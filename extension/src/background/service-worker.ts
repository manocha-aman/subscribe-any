import { getLLMProvider } from '@/lib/llm'
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
  getSubscriptions,
  markAsOrdered,
  snoozeReminder
} from '@/lib/subscriptions'
import {
  initializeReminderSystem,
  checkDueReminders,
  handleNotificationClick
} from '@/lib/reminders'
import type {
  ExtensionMessage,
  CreateSubscriptionPayload,
  UpdateSubscriptionPayload,
  DeleteSubscriptionPayload,
  MarkAsOrderedPayload,
  SnoozeReminderPayload
} from '@/types'

// Initialize reminder system on service worker start
initializeReminderSystem()

// Log service worker start
console.log('[Subscribe Any] Service worker started')

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  console.log('[Subscribe Any] Received message:', message.type)

  // Handle async operations
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error('[Subscribe Any] Error handling message:', error)
      sendResponse({ error: error.message })
    })

  // Return true to indicate we'll respond asynchronously
  return true
})

/**
 * Handle incoming messages
 */
async function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case 'ANALYZE_PAGE': {
      const payload = message.payload as
        | { url: string; title: string; content: string; heuristicConfidence?: number }
        | { url: string; title: string; htmlContent: string; textContent: string; heuristicConfidence?: number }

      // Handle both old and new payload formats
      if ('htmlContent' in payload) {
        return analyzePageContent(
          { htmlContent: payload.htmlContent, textContent: payload.textContent },
          payload.heuristicConfidence
        )
      } else {
        return analyzePageContent(payload.content, payload.heuristicConfidence)
      }
    }

    case 'CREATE_SUBSCRIPTION': {
      const { subscription } = message.payload as CreateSubscriptionPayload
      const result = await createSubscription(subscription)
      return { success: !!result, subscription: result }
    }

    case 'GET_SUBSCRIPTIONS': {
      const subscriptions = await getSubscriptions()
      return { subscriptions }
    }

    case 'UPDATE_SUBSCRIPTION': {
      const { id, updates } = message.payload as UpdateSubscriptionPayload
      const result = await updateSubscription(id, updates)
      return { success: !!result, subscription: result }
    }

    case 'DELETE_SUBSCRIPTION': {
      const { id } = message.payload as DeleteSubscriptionPayload
      const success = await deleteSubscription(id)
      return { success }
    }

    case 'MARK_AS_ORDERED': {
      const { id } = message.payload as MarkAsOrderedPayload
      const result = await markAsOrdered(id)
      return { success: !!result, subscription: result }
    }

    case 'SNOOZE_REMINDER': {
      const { id, days } = message.payload as SnoozeReminderPayload
      const result = await snoozeReminder(id, days)
      return { success: !!result, subscription: result }
    }

    case 'CHECK_REMINDERS': {
      await checkDueReminders()
      return { success: true }
    }

    default:
      console.warn('[Subscribe Any] Unknown message type:', message.type)
      return { error: 'Unknown message type' }
  }
}

/**
 * Analyze page content using LLM
 */
async function analyzePageContent(
  contentOrHtml: string | { htmlContent: string; textContent: string },
  heuristicConfidence = 0
) {
  try {
    console.log('[Subscribe Any BG] Getting LLM provider...')
    const provider = await getLLMProvider()

    // Normalize content to string for fallback
    const contentString = typeof contentOrHtml === 'string'
      ? contentOrHtml
      : contentOrHtml.htmlContent

    if (!provider) {
      console.log('[Subscribe Any BG] No LLM provider configured, using fallback')
      // Return a basic analysis based on content patterns
      const fallback = createFallbackAnalysis(contentString)
      // If heuristics were confident, override the fallback
      if (heuristicConfidence >= 0.8) {
        fallback.isOrderConfirmation = true
        fallback.confidence = heuristicConfidence
      }
      return { analysis: fallback }
    }

    console.log('[Subscribe Any BG] Calling LLM analyzeOrderPage...')
    const analysis = await provider.analyzeOrderPage(contentOrHtml)
    console.log('[Subscribe Any BG] LLM analysis result:', analysis)

    // If LLM says no but heuristics were very confident, trust heuristics
    if (!analysis.isOrderConfirmation && heuristicConfidence >= 0.9) {
      console.log('[Subscribe Any BG] Overriding LLM result with heuristics (very high confidence)')
      analysis.isOrderConfirmation = true
      analysis.confidence = heuristicConfidence
    }

    return { analysis }
  } catch (error) {
    console.error('[Subscribe Any BG] Error analyzing page:', error)
    const contentString = typeof contentOrHtml === 'string'
      ? contentOrHtml
      : contentOrHtml.htmlContent
    const fallback = createFallbackAnalysis(contentString)
    if (heuristicConfidence >= 0.8) {
      fallback.isOrderConfirmation = true
      fallback.confidence = heuristicConfidence
    }
    return { analysis: fallback, error: 'Failed to analyze page' }
  }
}

/**
 * Create a fallback analysis when no LLM is configured
 * Uses simple pattern matching to extract basic info
 */
function createFallbackAnalysis(content: string) {
  // Check for order confirmation indicators
  const orderPatterns = [
    /order\s*(#|number|no\.?)\s*[:\s]?\s*([\w-]+)/i,
    /confirmation\s*(#|number|no\.?)\s*[:\s]?\s*([\w-]+)/i,
    /your\s*order\s*(has\s*been\s*)?(confirmed|placed|received)/i,
    /thank\s*you\s*for\s*(your\s*)?(order|purchase)/i
  ]

  const isOrderConfirmation = orderPatterns.some((p) => p.test(content))

  if (!isOrderConfirmation) {
    return {
      isOrderConfirmation: false,
      confidence: 0,
      products: [],
      retailer: null,
      orderNumber: null
    }
  }

  // Try to extract order number
  const orderMatch = content.match(/order\s*(#|number|no\.?)\s*[:\s]?\s*([\w-]+)/i)
  const orderNumber = orderMatch ? orderMatch[2] : null

  // Try to extract product names from common patterns
  // This looks for text that appears to be a product name (not too short, not too long)
  // near price indicators or order item patterns
  const products: Array<{
    name: string
    price: number | null
    quantity: number
    isRecurring: boolean
    category: string | null
    suggestedFrequencyDays: number | null
  }> = []

  // Look for product patterns - lines that have product-like descriptions
  const lines = content.split(/\n|\r/).filter(line => line.length > 5 && line.length < 200)

  // Pattern 1: Look for lines that look like "Product Name ... $XX.XX"
  const productPricePattern = /([A-Z][A-Za-z0-9\s\-&()\.]{5,80})\s*(?:\$?(\d+\.?\d*))/
  for (const line of lines.slice(0, 100)) { // Check first 100 lines
    // Skip if it's clearly not a product line
    if (/subtotal|total|tax|shipping|delivery|discount|promo/i.test(line)) continue

    const match = line.match(productPricePattern)
    if (match) {
      const name = match[1].trim()
      const price = match[2] ? parseFloat(match[2]) : null

      // Only add if it looks like a real product name
      if (name.length > 5 && name.length < 80 && !/^(your|order|thank|confirmation|item|quantity)/i.test(name)) {
        // Avoid duplicates
        if (!products.some(p => p.name === name)) {
          products.push({
            name,
            price: price && price > 0 && price < 10000 ? price : null,
            quantity: 1,
            isRecurring: true,
            category: null,
            suggestedFrequencyDays: 30
          })
        }
      }
    }
  }

  // If no products found, create a generic one
  if (products.length === 0) {
    const priceMatches = content.match(/\$[\d,]+\.?\d*/g) || []
    const prices = priceMatches
      .map((p) => parseFloat(p.replace(/[$,]/g, '')))
      .filter((p) => p > 0 && p < 10000)

    products.push({
      name: 'Items from this order',
      price: prices[0] || null,
      quantity: 1,
      isRecurring: true,
      category: null,
      suggestedFrequencyDays: 30
    })
  }

  return {
    isOrderConfirmation: true,
    confidence: 0.5,
    products: products.slice(0, 10), // Limit to 10 products
    retailer: null,
    orderNumber
  }
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(handleNotificationClick)

// Handle alarm triggers
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'check-reminders') {
    checkDueReminders()
  }
})

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Subscribe Any] Extension installed/updated:', details.reason)

  if (details.reason === 'install') {
    // Open welcome/setup page on first install
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup.html#/setup')
    })
  }
})

// Export for testing
export { handleMessage, analyzePageContent, createFallbackAnalysis }
