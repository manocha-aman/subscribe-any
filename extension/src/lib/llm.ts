import type { LLMProvider, OrderAnalysis } from '@/types'

const DEFAULT_RESULT: OrderAnalysis = {
  isOrderConfirmation: false,
  confidence: 0,
  products: [],
  retailer: null,
  orderNumber: null
}

/**
 * Analyze an order page using the server-side AI Edge Function
 * This keeps API keys secure on the server
 */
export async function analyzeOrderWithAI(pageContent: string): Promise<OrderAnalysis> {
  try {
    console.log('[LLM] Getting session from storage...')
    const result = await chrome.storage.local.get('session')
    const session = result.session

    if (!session?.access_token) {
      console.error('[LLM] No active session for AI analysis, using fallback')
      // Fall back to heuristic analysis
      return analyzeOrderWithHeuristics(pageContent)
    }

    console.log('[LLM] Session found, calling Edge Function...')
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ pageContent })
    })

    if (!response.ok) {
      console.error(`[LLM] Edge Function error: ${response.status} ${response.statusText}`)
      // Fall back to heuristic analysis
      return analyzeOrderWithHeuristics(pageContent)
    }

    const data = await response.json()
    console.log('[LLM] Edge Function response:', data)
    return data.error ? DEFAULT_RESULT : data
  } catch (error) {
    console.error('[LLM] AI analysis error:', error)
    // Fall back to heuristic analysis
    return analyzeOrderWithHeuristics(pageContent)
  }
}

/**
 * Fallback heuristic-based detection (no AI required)
 */
export function analyzeOrderWithHeuristics(pageContent: string): OrderAnalysis {
  const lowerContent = pageContent.toLowerCase()

  // Order confirmation indicators
  const confirmationSignals = [
    'order confirmation',
    'thank you for your order',
    'order has been received',
    'order number',
    'receipt',
    'purchase confirmation',
    'order successfully placed',
    'we\'ll send you an email'
  ]

  const hasConfirmation = confirmationSignals.some(signal =>
    lowerContent.includes(signal)
  )

  if (!hasConfirmation) {
    return DEFAULT_RESULT
  }

  // Extract retailer from common patterns
  const retailerPatterns = [
    { name: 'Amazon', pattern: /amazon|amzn/i },
    { name: 'eBay', pattern: /\bebay\b/i },
    { name: 'Walmart', pattern: /walmart/i },
    { name: 'Target', pattern: /target/i },
    { name: 'Best Buy', pattern: /best buy|bestbuy/i },
    { name: 'Apple', pattern: /\bapple\b/i },
    { name: 'Nike', pattern: /\bnike\b/i }
  ]

  let retailer = null
  for (const { name, pattern } of retailerPatterns) {
    if (pattern.test(pageContent)) {
      retailer = name
      break
    }
  }

  // Extract order number
  const orderNumberMatch = pageContent.match(/order\s*[:#]?\s*([A-Z0-9-]{4,})/i)
  const orderNumber = orderNumberMatch?.[1] || null

  // Simple product extraction (looks for common patterns)
  const products: Array<{
    name: string
    price: number | null
    quantity: number
    isRecurring: boolean
    category: string | null
  }> = []

  const productLines = pageContent.split(/\n|\r/).filter(line =>
    line.length > 10 && line.length < 200 &&
    (line.includes('$') || /\d+\s*(x|pcs|items|qty)/i.test(line))
  )

  for (const line of productLines.slice(0, 5)) {
    const priceMatch = line.match(/\$(\d+\.?\d*)/)
    products.push({
      name: line.trim().substring(0, 50),
      price: priceMatch ? parseFloat(priceMatch[1]) : null,
      quantity: 1,
      isRecurring: false, // Conservative default
      category: null
    })
  }

  return {
    isOrderConfirmation: true,
    confidence: 0.6, // Lower confidence for heuristics
    products,
    retailer,
    orderNumber
  }
}

/**
 * Get the configured LLM provider (for backward compatibility)
 * Now just returns the Edge Function wrapper
 */
export async function getLLMProvider(): Promise<LLMProvider | null> {
  return {
    async analyzeOrderPage(pageContent: string): Promise<OrderAnalysis> {
      return analyzeOrderWithAI(pageContent)
    }
  }
}
