import type { PageDetectionResult } from '@/types'

// Supported e-commerce stores
export const SUPPORTED_STORES = [
  { name: 'Amazon', pattern: /amazon\.(com|co\.uk|de|fr|es|it|ca|com\.au)/i, logo: 'A' },
  { name: 'Walmart', pattern: /walmart\.com/i, logo: 'W' },
  { name: 'Target', pattern: /target\.(com|com\.au)/i, logo: 'T' },
  { name: 'Kmart', pattern: /kmart\.(com|com\.au)/i, logo: 'K' },
  { name: 'Best Buy', pattern: /bestbuy\.com/i, logo: 'B' },
  { name: 'eBay', pattern: /ebay\.(com|co\.uk|de|com\.au)/i, logo: 'e' },
  { name: 'Shopify', pattern: /myshopify\.com/i, logo: 'S' },
  { name: 'Etsy', pattern: /etsy\.com/i, logo: 'E' },
  { name: 'Nike', pattern: /nike\.com/i, logo: 'N' },
  { name: 'Apple', pattern: /apple\.com/i, logo: '' },
  { name: 'Costco', pattern: /costco\.com/i, logo: 'C' },
  { name: 'Kroger', pattern: /kroger\.com/i, logo: 'K' },
  { name: 'Whole Foods', pattern: /wholefoodsmarket\.com/i, logo: 'W' },
  { name: 'CVS', pattern: /cvs\.com/i, logo: 'C' },
  { name: 'Walgreens', pattern: /walgreens\.com/i, logo: 'W' },
  { name: 'Chewy', pattern: /chewy\.com/i, logo: 'C' },
  { name: 'Petco', pattern: /petco\.com/i, logo: 'P' },
  { name: 'Instacart', pattern: /instacart\.com/i, logo: 'I' },
  { name: 'DoorDash', pattern: /doordash\.com/i, logo: 'D' },
  { name: 'Uber Eats', pattern: /ubereats\.com/i, logo: 'U' },
  { name: 'Starbucks', pattern: /starbucks\.com/i, logo: 'S' },
  { name: 'Big W', pattern: /bigw\.com\.au/i, logo: 'W' },
  { name: 'Bunnings', pattern: /bunnings\.com\.au/i, logo: 'B' },
  { name: 'Woolworths', pattern: /woolworths\.com\.au/i, logo: 'W' },
  { name: 'Bunnings', pattern: /bunnings\.com\.au/i, logo: 'B' }
]

// Remove duplicate Bunnings

/**
 * Detect if current page is a supported store
 */
export function detectStore(url: string): { name: string; logo: string } | null {
  for (const store of SUPPORTED_STORES) {
    if (store.pattern.test(url)) {
      return { name: store.name, logo: store.logo }
    }
  }
  return null
}

// URL patterns that indicate order confirmation pages
const ORDER_CONFIRMATION_PATTERNS = [
  { pattern: /amazon\.\w+\/gp\/buy\/thankyou/i, trigger: 'amazon-thankyou', confidence: 0.95 },
  { pattern: /amazon\.\w+\/gp\/css\/summary/i, trigger: 'amazon-summary', confidence: 0.85 },
  { pattern: /walmart\.com\/checkout\/order-confirmation/i, trigger: 'walmart-confirmation', confidence: 0.95 },
  { pattern: /target\.(com|com\.au)\/(co-thankyou|spc\/order\/thankyou)/i, trigger: 'target-thankyou', confidence: 0.95 },
  { pattern: /kmart\.(com|com\.au).*\/order.*thank/i, trigger: 'kmart-thankyou', confidence: 0.95 },
  { pattern: /\/spc\/order\/thankyou/i, trigger: 'spc-thankyou', confidence: 0.95 },
  { pattern: /kmart\.(com|com\.au)\/checkout\/order-confirmation/i, trigger: 'kmart-confirmation', confidence: 0.98 },
  { pattern: /target\.(com|com\.au)\/checkout\/order-confirmation/i, trigger: 'target-checkout-confirmation', confidence: 0.98 },
  { pattern: /\/checkout\/order-confirmation/i, trigger: 'checkout-order-confirmation', confidence: 0.95 },
  { pattern: /\/order-confirmation/i, trigger: 'url-order-confirmation', confidence: 0.9 },
  { pattern: /\/order\/confirm/i, trigger: 'url-order-confirm', confidence: 0.85 },
  { pattern: /\/order\/success/i, trigger: 'url-order-success', confidence: 0.85 },
  { pattern: /\/checkout\/complete/i, trigger: 'url-checkout-complete', confidence: 0.85 },
  { pattern: /\/checkout\/thank-?you/i, trigger: 'url-thank-you', confidence: 0.8 },
  { pattern: /\/order\/thank-?you/i, trigger: 'url-order-thank-you', confidence: 0.9 },
  { pattern: /\/thank-?you/i, trigger: 'url-thank-you', confidence: 0.7 },
  { pattern: /\/order\/thank/i, trigger: 'url-order-thank', confidence: 0.8 },
  { pattern: /\/purchase\/complete/i, trigger: 'url-purchase-complete', confidence: 0.85 },
  { pattern: /\/confirmation\/?$/i, trigger: 'url-confirmation', confidence: 0.7 },
  { pattern: /myshopify\.com\/\d+\/orders\/\d+/i, trigger: 'shopify-order', confidence: 0.9 },
  { pattern: /\/orders\/\d+\/authenticate/i, trigger: 'shopify-authenticate', confidence: 0.85 }
]

// URL patterns that indicate order details/history pages (for viewing past orders)
const ORDER_DETAILS_PATTERNS = [
  { pattern: /amazon\.\w+\/gp\/css\/order-details/i, trigger: 'amazon-order-details', confidence: 0.9 },
  { pattern: /amazon\.\w+\/gp\/your-account\/order-details/i, trigger: 'amazon-order-details-2', confidence: 0.9 },
  { pattern: /\/orders\/\d+/i, trigger: 'order-details-id', confidence: 0.85 },
  { pattern: /\/order\/\d+/i, trigger: 'order-detailed-id', confidence: 0.85 },
  { pattern: /\/order-details/i, trigger: 'order-details', confidence: 0.85 },
  { pattern: /\/order\/view/i, trigger: 'order-view', confidence: 0.85 },
  { pattern: /myaccount\/orders/i, trigger: 'account-orders', confidence: 0.8 },
  { pattern: /\/order-history/i, trigger: 'order-history', confidence: 0.8 },
  { pattern: /\/your-orders/i, trigger: 'your-orders', confidence: 0.8 }
]

// URL patterns that indicate NOT an order confirmation
const EXCLUDE_PATTERNS = [
  /\/cart/i,
  /\/checkout\/?$/i,
  /\/dp\//i,  // Amazon product pages
  /\/product\//i,
  /\/order-history/i,
  /\/orders\/?$/i,  // Order list, not confirmation
  /\/account/i,
  /\/login/i,
  /\/signin/i
]

// Title patterns that indicate order confirmation
const TITLE_CONFIRMATION_PATTERNS = [
  { pattern: /order\s*confirm/i, trigger: 'title-order-confirmation', confidence: 0.8 },
  { pattern: /thank\s*you.*order/i, trigger: 'title-thank-you-order', confidence: 0.8 },
  { pattern: /order\s*placed/i, trigger: 'title-order-placed', confidence: 0.85 },
  { pattern: /purchase\s*confirm/i, trigger: 'title-purchase-confirm', confidence: 0.8 },
  { pattern: /order\s*complete/i, trigger: 'title-order-complete', confidence: 0.85 }
]

// Content patterns that indicate order confirmation
const CONTENT_CONFIRMATION_PATTERNS = [
  { pattern: /order\s*(#|number|no\.?)\s*[:\s]?\s*[\w-]+/i, trigger: 'content-order-number', confidence: 0.7 },
  { pattern: /confirmation\s*(#|number|no\.?)\s*[:\s]?\s*[\w-]+/i, trigger: 'content-confirmation-number', confidence: 0.7 },
  { pattern: /your\s*order\s*(has\s*been\s*)?(confirmed|placed|received)/i, trigger: 'content-order-confirmed', confidence: 0.75 },
  { pattern: /thank\s*you\s*for\s*(your\s*)?(order|purchase)/i, trigger: 'content-thank-you', confidence: 0.65 },
  { pattern: /confirmation\s*email\s*(has\s*been\s*)?sent/i, trigger: 'content-email-sent', confidence: 0.6 },
  { pattern: /we('ve|.*have)\s*received\s*your\s*order/i, trigger: 'content-order-received', confidence: 0.75 }
]

/**
 * Check if a URL is likely an order confirmation page based on URL patterns
 */
export function isLikelyOrderConfirmationUrl(url: string): PageDetectionResult {
  const triggers: string[] = []
  let maxConfidence = 0

  // First check exclusion patterns
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(url)) {
      return {
        isLikelyOrderConfirmation: false,
        confidence: 0,
        triggers: []
      }
    }
  }

  // Check confirmation patterns
  for (const { pattern, trigger, confidence } of ORDER_CONFIRMATION_PATTERNS) {
    if (pattern.test(url)) {
      triggers.push(trigger)
      maxConfidence = Math.max(maxConfidence, confidence)
    }
  }

  return {
    isLikelyOrderConfirmation: maxConfidence >= 0.6,
    confidence: maxConfidence,
    triggers
  }
}

/**
 * Get a confidence score for URL being an order confirmation
 */
export function getUrlConfidenceScore(url: string): number {
  const result = isLikelyOrderConfirmationUrl(url)
  return result.confidence
}

/**
 * Check if URL is an order details/history page (for viewing past orders)
 */
export function isOrderDetailsPage(url: string): PageDetectionResult {
  const triggers: string[] = []
  let maxConfidence = 0

  for (const { pattern, trigger, confidence } of ORDER_DETAILS_PATTERNS) {
    if (pattern.test(url)) {
      triggers.push(trigger)
      maxConfidence = Math.max(maxConfidence, confidence)
    }
  }

  return {
    isLikelyOrderConfirmation: maxConfidence >= 0.7,
    confidence: maxConfidence,
    triggers
  }
}

/**
 * Check if a page is likely an order confirmation based on URL, title, and content
 */
export function isLikelyOrderConfirmationPage(page: {
  url: string
  title: string
  bodyText: string
}): PageDetectionResult {
  const triggers: string[] = []
  let totalConfidence = 0

  // Check URL
  const urlResult = isLikelyOrderConfirmationUrl(page.url)
  if (urlResult.isLikelyOrderConfirmation) {
    triggers.push(...urlResult.triggers)
    totalConfidence += urlResult.confidence
  }

  // Check title
  for (const { pattern, trigger, confidence } of TITLE_CONFIRMATION_PATTERNS) {
    if (pattern.test(page.title)) {
      triggers.push(trigger)
      totalConfidence += confidence
    }
  }

  // Check content
  for (const { pattern, trigger, confidence } of CONTENT_CONFIRMATION_PATTERNS) {
    if (pattern.test(page.bodyText)) {
      triggers.push(trigger)
      totalConfidence += confidence
    }
  }

  // Normalize confidence (cap at 1.0)
  const normalizedConfidence = Math.min(totalConfidence, 1)

  // Require minimum confidence threshold
  // Higher threshold if only content signals (no URL or title match)
  const hasUrlOrTitleSignal = triggers.some(
    t => t.startsWith('url-') || t.startsWith('title-') ||
         t.startsWith('amazon-') || t.startsWith('walmart-') ||
         t.startsWith('target-') || t.startsWith('shopify-')
  )
  const threshold = hasUrlOrTitleSignal ? 0.5 : 0.8

  return {
    isLikelyOrderConfirmation: normalizedConfidence >= threshold && triggers.length > 0,
    confidence: normalizedConfidence,
    triggers
  }
}

/**
 * Extract clean text content from HTML for LLM analysis
 */
export function extractPageContent(html: string): string {
  // Remove script and style tags
  let content = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')

  // Remove HTML tags but keep text
  content = content.replace(/<[^>]+>/g, ' ')

  // Decode HTML entities
  content = content
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Normalize whitespace
  content = content.replace(/\s+/g, ' ').trim()

  // Limit length to avoid sending too much to LLM
  const MAX_LENGTH = 50000
  if (content.length > MAX_LENGTH) {
    content = content.substring(0, MAX_LENGTH)
  }

  return content
}

/**
 * Check if we should analyze the current page with LLM
 * Only trigger LLM analysis if heuristics suggest it might be an order page
 */
export function shouldAnalyzeWithLLM(page: {
  url: string
  title: string
  bodyText: string
}): boolean {
  const result = isLikelyOrderConfirmationPage(page)
  // Use a lower threshold for triggering LLM analysis
  // LLM will make the final determination
  return result.confidence >= 0.4 || result.triggers.length >= 1
}
