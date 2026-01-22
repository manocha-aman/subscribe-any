import type { PageDetectionResult } from '@/types'

/**
 * Detect store from URL - extracts retailer name from hostname
 * Works universally for ANY store (no hardcoded list needed)
 */
export function detectStore(url: string): { name: string; logo: string } | null {
  try {
    const hostname = new URL(url).hostname.replace('www.', '')
    // Extract the main domain name (e.g., "amazon" from "amazon.com.au")
    const parts = hostname.split('.')
    const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
    const logo = name.charAt(0).toUpperCase()
    return { name, logo }
  } catch {
    return null
  }
}

// Generic URL patterns that indicate order confirmation pages (works for ANY store)
const ORDER_CONFIRMATION_PATTERNS = [
  // Generic order confirmation patterns
  { pattern: /\/checkout\/order-confirmation/i, trigger: 'checkout-order-confirmation', confidence: 0.9 },
  { pattern: /\/order-confirmation/i, trigger: 'url-order-confirmation', confidence: 0.85 },
  { pattern: /\/order\/confirm/i, trigger: 'url-order-confirm', confidence: 0.8 },
  { pattern: /\/order\/success/i, trigger: 'url-order-success', confidence: 0.8 },
  { pattern: /\/checkout\/complete/i, trigger: 'url-checkout-complete', confidence: 0.8 },
  { pattern: /\/checkout\/thank-?you/i, trigger: 'url-checkout-thank-you', confidence: 0.75 },
  { pattern: /\/order\/thank-?you/i, trigger: 'url-order-thank-you', confidence: 0.85 },
  { pattern: /\/thank-?you.*order/i, trigger: 'url-thank-you-order', confidence: 0.75 },
  { pattern: /\/purchase\/complete/i, trigger: 'url-purchase-complete', confidence: 0.8 },
  { pattern: /\/receipt/i, trigger: 'url-receipt', confidence: 0.7 },
  { pattern: /\/confirmation\/?$/i, trigger: 'url-confirmation', confidence: 0.6 },
  // Generic order view patterns (Shopify, WooCommerce, etc.)
  { pattern: /\/orders\/\d+/i, trigger: 'url-order-view', confidence: 0.7 },
  { pattern: /\/order\/\d+/i, trigger: 'url-order-id', confidence: 0.7 }
]

// URL patterns that indicate order details/history pages (for viewing past orders)
const ORDER_DETAILS_PATTERNS = [
  // Specific order detail pages (high confidence)
  { pattern: /\/order-details/i, trigger: 'order-details', confidence: 0.9 },
  { pattern: /\/order\/details/i, trigger: 'order-slash-details', confidence: 0.9 },
  { pattern: /\/previous-orders.*order/i, trigger: 'previous-order-details', confidence: 0.9 },
  { pattern: /\/my-account.*order/i, trigger: 'account-order', confidence: 0.85 },
  { pattern: /\/account.*order-details/i, trigger: 'account-order-details', confidence: 0.9 },
  { pattern: /\/orders\/\d+/i, trigger: 'order-details-id', confidence: 0.85 },
  { pattern: /\/order\/\d+/i, trigger: 'order-detailed-id', confidence: 0.85 },
  { pattern: /orderId=/i, trigger: 'order-id-param', confidence: 0.85 },
  { pattern: /order_id=/i, trigger: 'order-id-param-underscore', confidence: 0.85 },
  { pattern: /\/order\/view/i, trigger: 'order-view', confidence: 0.85 },
  { pattern: /\/view-order/i, trigger: 'view-order', confidence: 0.85 },
  // Order history pages (lower confidence - might be list not detail)
  { pattern: /\/order-history/i, trigger: 'order-history', confidence: 0.7 },
  { pattern: /\/your-orders/i, trigger: 'your-orders', confidence: 0.7 },
  { pattern: /\/purchase-history/i, trigger: 'purchase-history', confidence: 0.7 },
]

// URL patterns that indicate NOT an order confirmation
const EXCLUDE_PATTERNS = [
  /\/cart\/?$/i,
  /\/cart\?/i,
  /\/checkout\/?$/i,
  /\/dp\//i,  // Amazon product pages
  /\/product\/[^\/]+\/?$/i,  // Product detail pages (but not /product/order)
  /\/login/i,
  /\/signin/i,
  /\/register/i,
  /\/password/i,
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
    t => t.startsWith('url-') || t.startsWith('title-') || t.startsWith('checkout-')
  )
  // Lower threshold since LLM validates - we want to be more permissive in triggering
  const threshold = hasUrlOrTitleSignal ? 0.4 : 0.7

  return {
    isLikelyOrderConfirmation: normalizedConfidence >= threshold && triggers.length > 0,
    confidence: normalizedConfidence,
    triggers
  }
}

/**
 * Extract page content for LLM analysis
 * Returns both structured HTML (with attributes preserved) and plain text
 */
export function extractPageContent(html: string): {
  html: string   // Cleaned but structured HTML with attributes
  text: string   // Plain text from body
} {
  // Remove scripts, styles, and other non-content elements
  let content = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')  // HTML comments

  // Remove common noise elements - but be more selective, don't remove all nav/header/footer
  // Only remove if they clearly don't contain order info
  content = content
    .replace(/<(header|footer|nav|aside)\b[^>]*class="[^"]*(?:main|site|global)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, '')

  // Simplify attributes - KEEP MORE attributes for better semantic understanding
  content = content.replace(/<([a-z][a-z0-9]*)\s+([^>]*)>/gi, (_match, tag, attrs) => {
    const keepAttrs: string[] = []

    // Keep ALL class names (they contain semantic information)
    const classMatch = attrs.match(/class\s*=\s*["']([^"']*)["']/i)
    if (classMatch) {
      keepAttrs.push(`class="${classMatch[1]}"`)
    }

    // Keep ALL id attributes
    const idMatch = attrs.match(/id\s*=\s*["']([^"']*)["']/i)
    if (idMatch) {
      keepAttrs.push(`id="${idMatch[1]}"`)
    }

    // Keep ALL data-* attributes (they often contain product info)
    const dataMatches = attrs.match(/data-[a-z0-9-]+\s*=\s*["'][^"']*["']/gi) || []
    dataMatches.forEach((d: string) => keepAttrs.push(d))

    // Keep semantic attributes
    const semanticAttrs = ['role', 'aria-label', 'aria-labelledby', 'aria-describedby', 'itemprop', 'itemscope', 'itemtype']
    semanticAttrs.forEach((attr) => {
      const match = attrs.match(new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, 'i'))
      if (match) keepAttrs.push(`${attr}="${match[1]}"`)
    })

    // Keep href on anchor tags (for product context)
    if (tag.toLowerCase() === 'a') {
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']*)["']/i)
      if (hrefMatch) keepAttrs.push(`href="${hrefMatch[1]}"`)
    }

    // Keep src on img tags (for product images)
    if (tag.toLowerCase() === 'img') {
      const srcMatch = attrs.match(/src\s*=\s*["']([^"']*)["']/i)
      if (srcMatch) keepAttrs.push(`src="${srcMatch[1]}"`)
      const altMatch = attrs.match(/alt\s*=\s*["']([^"']*)["']/i)
      if (altMatch) keepAttrs.push(`alt="${altMatch[1]}"`)
    }

    return keepAttrs.length > 0 ? `<${tag} ${keepAttrs.join(' ')}>` : `<${tag}>`
  })

  // Decode HTML entities
  content = content
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Extract plain text (remove all tags)
  let text = content
    .replace(/<[^>]+>/g, ' ')  // Remove all HTML tags
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .trim()

  // Clean up HTML but keep structure
  let htmlContent = content
    .replace(/<([a-z][a-z0-9]*)[^>]*>\s*<\/\1>/gi, '')  // Empty tags
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .replace(/>\s+</g, '><')  // Remove space between tags
    .replace(/>\s+/g, '> ')  // Single space after tags
    .replace(/\s+</g, ' <')  // Single space before tags
    .trim()

  // Increased limit from 40k to 60k chars for better coverage
  const MAX_HTML_LENGTH = 60000
  const MAX_TEXT_LENGTH = 30000

  if (htmlContent.length > MAX_HTML_LENGTH) {
    htmlContent = htmlContent.substring(0, MAX_HTML_LENGTH) + '...[truncated]'
  }

  if (text.length > MAX_TEXT_LENGTH) {
    text = text.substring(0, MAX_TEXT_LENGTH) + '...[truncated]'
  }

  return { html: htmlContent, text }
}

/**
 * Check if we should analyze the current page with LLM
 * More permissive since LLM is the source of truth for order detection
 */
export function shouldAnalyzeWithLLM(page: {
  url: string
  title: string
  bodyText: string
}): boolean {
  const result = isLikelyOrderConfirmationPage(page)
  // Low threshold - let LLM make the final determination
  // Any signal is enough to trigger LLM analysis
  return result.confidence >= 0.3 || result.triggers.length >= 1
}
