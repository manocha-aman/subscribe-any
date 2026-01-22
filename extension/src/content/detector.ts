import {
  isLikelyOrderConfirmationPage,
  extractPageContent,
  shouldAnalyzeWithLLM,
  detectStore,
  isOrderDetailsPage
} from '@/lib/detector'
import type { OrderDetectedPayload, PageDetectionResult } from '@/types'

// Debounce time to avoid multiple detections on same page
const DETECTION_DEBOUNCE_MS = 2000

// Track if we've already processed this page
let lastProcessedUrl = ''
let lastProcessedTime = 0

/**
 * Wait for dynamic content to load (React, Vue, etc.)
 * Always waits a minimum time, then watches for DOM stability
 */
async function waitForDynamicContent(minWaitMs = 3000, maxWaitMs = 8000): Promise<void> {
  console.log(`[Subscribe Any] Waiting ${minWaitMs}ms for dynamic content to load...`)

  // Always wait minimum time for React/Vue to hydrate and render
  await new Promise(r => setTimeout(r, minWaitMs))

  return new Promise((resolve) => {
    let lastChangeTime = Date.now()
    let checkCount = 0
    const maxChecks = 50  // 50 * 100ms = 5 seconds additional max

    const observer = new MutationObserver(() => {
      lastChangeTime = Date.now()
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    })

    const checkStable = () => {
      checkCount++
      const timeSinceLastChange = Date.now() - lastChangeTime

      // Page is stable if no changes for 800ms
      if (timeSinceLastChange > 800 || checkCount >= maxChecks) {
        observer.disconnect()
        console.log(`[Subscribe Any] Content stabilized after ${minWaitMs + checkCount * 100}ms total`)
        resolve()
      } else {
        setTimeout(checkStable, 100)
      }
    }

    // Start checking
    setTimeout(checkStable, 100)

    // Safety timeout
    setTimeout(() => {
      observer.disconnect()
      console.log(`[Subscribe Any] Max wait reached (${maxWaitMs}ms)`)
      resolve()
    }, maxWaitMs - minWaitMs)
  })
}

/**
 * Main detection logic - runs when page loads
 */
async function detectOrderConfirmation(): Promise<void> {
  const url = window.location.href
  const now = Date.now()

  // Debounce to avoid processing same page multiple times
  if (url === lastProcessedUrl && now - lastProcessedTime < DETECTION_DEBOUNCE_MS) {
    console.log('[Subscribe Any] Skipping - already processed this URL recently')
    return
  }

  lastProcessedUrl = url
  lastProcessedTime = now

  // Get the setting for showing on order details pages
  const settings = await chrome.storage.sync.get(['showOnOrderDetails'])
  const showOnOrderDetails = settings.showOnOrderDetails !== false // default true

  // Quick check if this might be an order page (before waiting)
  const orderDetailsResult = isOrderDetailsPage(url)
  const isOrderDetails = orderDetailsResult.isLikelyOrderConfirmation

  console.log('[Subscribe Any] URL check:', {
    url,
    isOrderDetails,
    orderDetailsConfidence: orderDetailsResult.confidence,
    orderDetailsTriggers: orderDetailsResult.triggers,
    urlPatternMatch: /order|checkout|confirmation|receipt/i.test(url)
  })

  // If it looks like an order page, wait for dynamic content to load
  const shouldWait = isOrderDetails || /order|checkout|confirmation|receipt/i.test(url)
  if (shouldWait) {
    console.log('[Subscribe Any] URL matches order pattern, waiting for dynamic content...')
    await waitForDynamicContent()
    console.log('[Subscribe Any] Wait complete, proceeding with detection...')
  } else {
    console.log('[Subscribe Any] URL does not match order pattern, skipping wait')
  }

  // Now get page content (after dynamic content has loaded)
  const title = document.title
  console.log('[Subscribe Any] Extracting page content, title:', title)

  let bodyHtml: string
  let bodyText: string
  try {
    const extracted = extractPageContent(document.body.innerHTML)
    bodyHtml = extracted.html
    bodyText = extracted.text
    console.log('[Subscribe Any] Content extracted successfully, HTML length:', bodyHtml.length, 'Text length:', bodyText.length)
  } catch (err) {
    console.error('[Subscribe Any] Error extracting page content:', err)
    return
  }

  // Check with heuristics
  const pageInfo = { url, title, bodyText }
  let heuristicResult: PageDetectionResult
  try {
    heuristicResult = isLikelyOrderConfirmationPage(pageInfo)
    console.log('[Subscribe Any] Heuristics computed:', {
      isLikely: heuristicResult.isLikelyOrderConfirmation,
      confidence: heuristicResult.confidence,
      triggers: heuristicResult.triggers
    })
  } catch (err) {
    console.error('[Subscribe Any] Error running heuristics:', err)
    return
  }

  console.log('[Subscribe Any] Detection check:', {
    url,
    title,
    isLikely: heuristicResult.isLikelyOrderConfirmation,
    isOrderDetails,
    confidence: heuristicResult.confidence,
    triggers: heuristicResult.triggers,
    htmlLength: bodyHtml.length,
    textLength: bodyText.length,
    bodyTextPreview: bodyText.substring(0, 200)
  })

  // Determine if we should analyze this page
  const shouldAnalyze = isOrderDetails || shouldAnalyzeWithLLM(pageInfo)

  console.log('[Subscribe Any] Analysis decision:', {
    shouldAnalyze,
    isOrderDetails,
    shouldAnalyzeWithLLM: shouldAnalyzeWithLLM(pageInfo),
    heuristicConfidence: heuristicResult.confidence,
    heuristicTriggers: heuristicResult.triggers.length
  })

  if (!shouldAnalyze) {
    console.log('[Subscribe Any] Skipping - not an order page (failed heuristics)')
    return
  }

  if (isOrderDetails && !showOnOrderDetails) {
    console.log('[Subscribe Any] Order details page, but setting disabled')
    return
  }

  console.log('[Subscribe Any] Proceeding with LLM analysis...')

  // Send to background script for LLM analysis
  try {
    console.log('[Subscribe Any] Sending to background for LLM analysis...', {
      htmlPreview: bodyHtml.substring(0, 500),
      textPreview: bodyText.substring(0, 500)
    })

    const response = await chrome.runtime.sendMessage({
      type: 'ANALYZE_PAGE',
      payload: {
        url,
        title,
        htmlContent: bodyHtml,
        textContent: bodyText,
        heuristicConfidence: Math.max(heuristicResult.confidence, orderDetailsResult.confidence)
      }
    })

    console.log('[Subscribe Any] LLM response:', response)

    const finalAnalysis = response?.analysis

    console.log('[Subscribe Any] Analysis details:', {
      isOrderConfirmation: finalAnalysis?.isOrderConfirmation,
      productsCount: finalAnalysis?.products?.length || 0,
      products: finalAnalysis?.products,
      retailer: finalAnalysis?.retailer,
      orderNumber: finalAnalysis?.orderNumber,
      confidence: finalAnalysis?.confidence
    })

    if (finalAnalysis?.isOrderConfirmation && finalAnalysis.products?.length > 0) {
      console.log('[Subscribe Any] Order detected with products! Showing prompt...')
      await showSubscriptionPrompt(finalAnalysis, url, title)
    } else if (isOrderDetails || (heuristicResult.isLikelyOrderConfirmation && heuristicResult.confidence >= 0.7)) {
      // It's an order page but LLM didn't find products - try DOM extraction
      console.log('[Subscribe Any] Order page detected, but no LLM products. Trying DOM extraction...')
      await showSubscriptionPrompt({
        isOrderConfirmation: true,
        confidence: Math.max(heuristicResult.confidence, orderDetailsResult.confidence),
        products: [], // Will extract from DOM in showSubscriptionPrompt
        retailer: finalAnalysis?.retailer || new URL(url).hostname.replace('www.', ''),
        orderNumber: finalAnalysis?.orderNumber || null
      }, url, title)
    } else {
      console.log('[Subscribe Any] Not an order page according to LLM and heuristics')
    }
  } catch (error) {
    console.error('[Subscribe Any] Error analyzing page:', error)
  }
}

/**
 * Extract price from text
 */
function extractPrice(text: string): number | null {
  // Match various price formats: $29.99, $29, £29.99, €29.99, 29.99
  const pricePatterns = [
    /[\$£€]\s*(\d{1,5}(?:[.,]\d{2})?)/,  // $29.99 or $29
    /(\d{1,5}[.,]\d{2})\s*(?:USD|AUD|EUR|GBP)?/i,  // 29.99 USD
  ]

  for (const pattern of pricePatterns) {
    const match = text.match(pattern)
    if (match) {
      const price = parseFloat(match[1].replace(',', '.'))
      if (price > 0 && price < 10000) {
        return price
      }
    }
  }
  return null
}

/**
 * Check if text looks like a product name (not a label/header)
 */
function isLikelyProductName(text: string): boolean {
  if (!text || text.length < 4 || text.length > 200) return false

  // Skip common non-product text
  const skipPatterns = [
    /^(your|order|thank|confirmation|item|quantity|price|total|subtotal|shipping|tax|discount|delivery|fee|promo|coupon|save|free|qty|sku|#)$/i,
    /^(product|description|name|details|summary|receipt|invoice|billing|payment|method|address|email|phone|date|time|status|tracking)$/i,
    /^[\d\s\-\.\,\#\:]+$/,  // Only numbers/punctuation
    /^\$[\d\.\,]+$/,  // Just a price
  ]

  return !skipPatterns.some(p => p.test(text.trim()))
}

/**
 * Extract products from the page DOM (fallback when LLM doesn't return products)
 * Uses multiple strategies to find products on any e-commerce site
 */
async function extractProductsFromDOM(): Promise<Array<{
  name: string
  price: number | null
  quantity: number
  isRecurring: boolean
  category: string | null
  suggestedFrequencyDays: number | null
}>> {
  const products: Array<{
    name: string
    price: number | null
    quantity: number
    isRecurring: boolean
    category: string | null
    suggestedFrequencyDays: number | null
  }> = []

  const addProduct = (name: string, price: number | null) => {
    const cleanName = name.trim().replace(/\s+/g, ' ')
    if (isLikelyProductName(cleanName) && !products.some(p => p.name === cleanName)) {
      products.push({
        name: cleanName,
        price,
        quantity: 1,
        isRecurring: true,
        category: null,
        suggestedFrequencyDays: 30
      })
    }
  }

  // Wait briefly for dynamic content to load
  await new Promise(r => setTimeout(r, 500))

  console.log('[Subscribe Any] Extracting products from DOM (fallback)')

  // Strategy 1: Parse from plain text using "N x Product Name" or "N.NN kg Product Name" pattern
  // This handles sites like Bunnings, grocery delivery, etc.
  // First normalize the text - replace newlines with spaces for easier matching
  const bodyText = (document.body.textContent || '').replace(/\s+/g, ' ')
  console.log('[Subscribe Any] Normalized bodyText (first 500 chars):', bodyText.substring(0, 500))

  // Look for the "What's in order" section and extract items from there
  const whatsInOrderMatch = bodyText.match(/What'?s in order \d+([^\[]+)/i)
  if (whatsInOrderMatch) {
    console.log('[Subscribe Any] Found "What\'s in order" section')
    const orderSection = whatsInOrderMatch[1]

    // Pattern for "N.NN x Product Name" or "N x Product Name"
    const quantityProductPattern = /(\d+(?:\.\d+)?)\s*x\s*([A-Z][^]*?)(?=\s*\d+\s*(?:x|kg|$))/gi

    let match
    while ((match = quantityProductPattern.exec(orderSection)) !== null) {
      const quantity = parseFloat(match[1])
      let productName = match[2]?.trim() || ''

      // Clean up the product name - remove trailing measurements and noise
      productName = productName
        .replace(/\s+\d+\s*(?:g|kg|ml|l|pcs?|pack|bunch).*$/i, '') // Remove trailing measurements
        .replace(/\s*(?:minimum|about|approx).*$/i, '') // Remove extra words
        .replace(/\s+/g, ' ')
        .trim()

      console.log('[Subscribe Any] Extracted product:', { productName, quantity, original: match[0] })

      if (productName.length > 5 && isLikelyProductName(productName)) {
        if (!products.some(p => p.name === productName)) {
          products.push({
            name: productName,
            price: null,
            quantity: Math.round(quantity),
            isRecurring: true,
            category: null,
            suggestedFrequencyDays: 30
          })
        }
      }
    }
  }

  // If no products found with "What's in order", try other patterns
  if (products.length === 0) {
    // Pattern for "N.NN kg Product Name"
    const kgPattern = /(\d+(?:\.\d+)?)\s*kg\s+([A-Z][^]*?)(?=\s*\d+\s*(?:x|kg|$)|\s*$)/gi
    let match
    while ((match = kgPattern.exec(bodyText)) !== null) {
      const quantity = parseFloat(match[1])
      let productName = match[2]?.trim() || ''

      productName = productName
        .replace(/\s+\d+\s*(?:g|kg|ml|l|pcs?|pack|bunch).*$/i, '')
        .replace(/\s+/g, ' ')
        .trim()

      if (productName.length > 5 && isLikelyProductName(productName)) {
        if (!products.some(p => p.name === productName)) {
          products.push({
            name: productName,
            price: null,
            quantity: Math.round(quantity),
            isRecurring: true,
            category: null,
            suggestedFrequencyDays: 30
          })
        }
      }
    }
  }

  console.log('[Subscribe Any] Text pattern extraction found', products.length, 'products')

  // Strategy 2: Look for elements with product-related data attributes
  const dataAttrSelectors = [
    '[data-product-name]',
    '[data-product-title]',
    '[data-item-name]',
    '[data-testid*="product"]',
    '[data-test*="product"]',
    '[data-qa*="product"]',
  ]

  for (const selector of dataAttrSelectors) {
    try {
      document.querySelectorAll(selector).forEach(el => {
        const name = el.getAttribute('data-product-name') ||
                     el.getAttribute('data-product-title') ||
                     el.getAttribute('data-item-name') ||
                     el.textContent?.trim()
        if (name) {
          const parent = el.closest('[class*="item"], [class*="product"], tr, li, article, div')
          const price = parent ? extractPrice(parent.textContent || '') : null
          addProduct(name, price)
        }
      })
    } catch (e) { /* skip */ }
  }

  // Strategy 3: Look for common product name class patterns
  if (products.length === 0) {
    const classSelectors = [
      '.product-name', '.productName', '.product_name',
      '.product-title', '.productTitle', '.product_title',
      '.item-name', '.itemName', '.item_name',
      '.item-title', '.itemTitle', '.item_title',
      '.order-item-name', '.orderItemName',
      '.line-item-name', '.lineItemName',
      '.cart-item-name', '.cartItemName',
      'h1[class*="product"], h2[class*="product"], h3[class*="product"]',
      'h1[class*="item"], h2[class*="item"], h3[class*="item"]',
      'a[class*="product"][class*="name"], a[class*="product"][class*="title"]',
      'span[class*="product"][class*="name"], span[class*="product"][class*="title"]',
    ]

    for (const selector of classSelectors) {
      try {
        const elements = document.querySelectorAll(selector)
        if (elements.length > 0) {
          console.log(`[Subscribe Any] Found ${elements.length} elements with: ${selector}`)
          elements.forEach(el => {
            const name = el.textContent?.trim()
            if (name) {
              const parent = el.closest('tr, li, article, [class*="item"], [class*="product"], [class*="row"]')
              const price = parent ? extractPrice(parent.textContent || '') : null
              addProduct(name, price)
            }
          })
          if (products.length > 0) break
        }
      } catch (e) { /* skip invalid selector */ }
    }
  }

  // Strategy 4: Look for order item containers and extract text
  if (products.length === 0) {
    const containerSelectors = [
      '.order-item', '.orderItem', '.order_item',
      '.cart-item', '.cartItem', '.cart_item',
      '.line-item', '.lineItem', '.line_item',
      '.product-item', '.productItem', '.product_item',
      '[class*="OrderItem"]', '[class*="CartItem"]', '[class*="LineItem"]',
      '[class*="order-item"]', '[class*="cart-item"]', '[class*="line-item"]',
    ]

    for (const selector of containerSelectors) {
      try {
        const containers = document.querySelectorAll(selector)
        if (containers.length > 0) {
          console.log(`[Subscribe Any] Found ${containers.length} containers with: ${selector}`)
          containers.forEach(container => {
            // Look for the most prominent text that could be a product name
            const candidates = container.querySelectorAll('h1, h2, h3, h4, h5, h6, a, span, p, div')
            for (const el of Array.from(candidates)) {
              const text = el.textContent?.trim()
              if (text && text.length > 5 && text.length < 150 && isLikelyProductName(text)) {
                const price = extractPrice(container.textContent || '')
                addProduct(text, price)
                break  // Take first good match per container
              }
            }
          })
          if (products.length > 0) break
        }
      } catch (e) { /* skip */ }
    }
  }

  // Strategy 5: Look for tables (common in order confirmations)
  if (products.length === 0) {
    console.log('[Subscribe Any] Trying table-based extraction...')
    const tables = document.querySelectorAll('table')
    for (const table of Array.from(tables).slice(0, 5)) {
      const rows = table.querySelectorAll('tr')
      for (const row of Array.from(rows)) {
        const cells = row.querySelectorAll('td')
        if (cells.length >= 1) {
          // Try each cell as potential product name
          for (const cell of Array.from(cells)) {
            const text = cell.textContent?.trim()
            if (text && isLikelyProductName(text)) {
              const price = extractPrice(row.textContent || '')
              addProduct(text, price)
              break  // One product per row
            }
          }
        }
      }
      if (products.length > 0) break
    }
  }

  // Strategy 6: Look for list items with prices
  if (products.length === 0) {
    console.log('[Subscribe Any] Trying list-based extraction...')
    const listItems = document.querySelectorAll('li, div[class*="item"], div[class*="row"]')
    for (const item of Array.from(listItems).slice(0, 50)) {
      const text = item.textContent?.trim() || ''
      const price = extractPrice(text)

      if (price) {
        // Find the longest text segment that looks like a product name
        const textNodes: string[] = []
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT)
        let node
        while ((node = walker.nextNode())) {
          const t = node.textContent?.trim()
          if (t && t.length > 5) textNodes.push(t)
        }

        // Pick the best candidate (longest text that's not a price)
        const candidate = textNodes
          .filter(t => isLikelyProductName(t) && !t.includes('$'))
          .sort((a, b) => b.length - a.length)[0]

        if (candidate) {
          addProduct(candidate, price)
        }
      }
    }
  }

  console.log('[Subscribe Any] Extracted products from DOM:', products)
  return products.slice(0, 10)
}

/**
 * Show the subscription prompt UI
 */
async function showSubscriptionPrompt(
  analysis: OrderDetectedPayload['analysis'],
  pageUrl: string,
  _pageTitle: string
): Promise<void> {
  // Check if prompt already exists
  if (document.getElementById('subscribe-any-prompt')) {
    console.log('[Subscribe Any] Prompt already exists, skipping')
    return
  }

  console.log('[Subscribe Any] Showing subscription prompt with products:', analysis.products)

  // Get existing subscriptions to filter out already subscribed items
  const existingSubsResponse = await chrome.runtime.sendMessage({ type: 'GET_SUBSCRIPTIONS' })
  const existingSubscriptions = existingSubsResponse?.subscriptions || []

  // Use all products, not just recurring ones - user can decide
  let productsToShow = analysis.products
  if (productsToShow.length === 0) {
    console.log('[Subscribe Any] No products from analysis, extracting from DOM...')
    productsToShow = await extractProductsFromDOM()
    if (productsToShow.length === 0) {
      productsToShow = [{ name: 'Items from this order', price: null, quantity: 1, isRecurring: true, category: null, suggestedFrequencyDays: 30 }]
    }
  }

  // Create prompt container
  const container = document.createElement('div')
  container.id = 'subscribe-any-prompt'
  container.innerHTML = `
    <style>
      #subscribe-any-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 999998;
        animation: fadeIn 0.25s ease-out;
      }

      #subscribe-any-prompt {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 400px;
        max-width: 90vw;
        background: white;
        box-shadow: -4px 0 30px rgba(0, 0, 0, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 999999;
        animation: slideInRight 0.3s ease-out;
        display: flex;
        flex-direction: column;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes slideInRight {
        from {
          transform: translateX(100%);
        }
        to {
          transform: translateX(0);
        }
      }

      #subscribe-any-prompt.closing {
        animation: slideOutRight 0.25s ease-in forwards;
      }

      @keyframes slideOutRight {
        to {
          transform: translateX(100%);
        }
      }

      .sa-header {
        padding: 20px;
        border-bottom: 1px solid #e5e5e5;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: white;
      }

      .sa-title {
        font-size: 18px;
        font-weight: 600;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .sa-logo {
        width: 28px;
        height: 28px;
        background: white;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }

      .sa-close {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: white;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: background 0.2s;
      }

      .sa-close:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .sa-body {
        padding: 20px;
        flex: 1;
        overflow-y: auto;
      }

      .sa-product {
        display: flex;
        align-items: center;
        padding: 16px;
        border: 2px solid #e5e7eb;
        border-radius: 12px;
        margin-bottom: 12px;
        cursor: pointer;
        transition: all 0.2s;
        background: white;
      }

      .sa-product:hover {
        border-color: #6366f1;
        box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
      }

      .sa-product.selected {
        border-color: #6366f1;
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%);
      }

      .sa-checkbox {
        margin-right: 14px;
        width: 22px;
        height: 22px;
        accent-color: #6366f1;
        cursor: pointer;
      }

      .sa-product-info {
        flex: 1;
      }

      .sa-product-name {
        font-size: 14px;
        font-weight: 500;
        color: #333;
        margin-bottom: 4px;
      }

      .sa-product-price {
        font-size: 13px;
        color: #666;
      }

      .sa-suggested-freq {
        display: inline-block;
        margin-left: 8px;
        padding: 2px 8px;
        background: #e0e7ff;
        color: #4338ca;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
      }

      .sa-product-frequency {
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .sa-product-frequency-label {
        font-size: 12px;
        color: #666;
        white-space: nowrap;
      }

      .sa-product-frequency-select {
        flex: 1;
        padding: 6px 10px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 13px;
        background: white;
        cursor: pointer;
      }

      .sa-footer {
        padding: 20px;
        border-top: 1px solid #e5e5e5;
        background: #f9fafb;
      }

      .sa-subscribe-btn {
        width: 100%;
        padding: 14px;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: white;
        border: none;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
      }

      .sa-subscribe-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
      }

      .sa-subscribe-btn:active {
        transform: translateY(0);
      }

      .sa-subscribe-btn:disabled {
        background: #d1d5db;
        box-shadow: none;
        cursor: not-allowed;
        transform: none;
      }
    </style>

    <div class="sa-header">
      <h3 class="sa-title">
        <span class="sa-logo">SA</span>
        We recommend you buy this again
      </h3>
      <button class="sa-close" id="sa-close">&times;</button>
    </div>

    <div class="sa-body">
      <div id="sa-products"></div>
    </div>

    <div class="sa-footer">
      <button class="sa-subscribe-btn" id="sa-subscribe" disabled>
        Please help us remind you
      </button>
    </div>
  `

  // Create backdrop
  const backdrop = document.createElement('div')
  backdrop.id = 'subscribe-any-backdrop'

  // Close on backdrop click
  backdrop.addEventListener('click', () => {
    container.classList.add('closing')
    backdrop.style.opacity = '0'
    setTimeout(() => {
      container.remove()
      backdrop.remove()
    }, 250)
  })

  document.body.appendChild(backdrop)
  document.body.appendChild(container)

  // Populate products - ONLY show subscribable items (isRecurring: true)
  // and NOT already subscribed
  const productsContainer = document.getElementById('sa-products')!
  const selectedProducts = new Set<number>()
  const productFrequencies = new Map<number, number>() // Store frequency for each product

  // Filter to only subscribable products that aren't already subscribed
  const subscribableProducts = productsToShow.filter(p => {
    if (p.isRecurring === false) return false // Exclude durables
    // Check if already subscribed to this product
    return !existingSubscriptions.some((sub: any) =>
      sub.product_name.toLowerCase() === p.name.toLowerCase()
    )
  })

  if (subscribableProducts.length === 0) {
    productsContainer.innerHTML = `
      <div style="text-align: center; padding: 30px; color: #666;">
        <p>We found items from this order, but you're already subscribed to all of them!</p>
        <p style="font-size: 13px;">Check your subscriptions to manage reminders.</p>
      </div>
    `
    return
  }

  subscribableProducts.forEach((product, index) => {
    const suggestedDays = product.suggestedFrequencyDays || 30

    const productEl = document.createElement('div')
    productEl.className = 'sa-product'
    productEl.innerHTML = `
      <input type="checkbox" class="sa-checkbox" data-index="${index}">
      <div class="sa-product-info">
        <div class="sa-product-name">${escapeHtml(product.name)}</div>
        <div class="sa-product-price">
          ${product.price ? `$${product.price.toFixed(2)}` : ''}
          ${product.category ? `• ${escapeHtml(product.category)}` : ''}
        </div>
        <div class="sa-product-frequency">
          <span class="sa-product-frequency-label">Remind me every:</span>
          <select class="sa-product-frequency-select" data-index="${index}">
            <option value="7" ${suggestedDays === 7 ? 'selected' : ''}>Weekly</option>
            <option value="14" ${suggestedDays === 14 ? 'selected' : ''}>Bi-weekly</option>
            <option value="30" ${suggestedDays === 30 ? 'selected' : ''}>Monthly</option>
            <option value="60" ${suggestedDays === 60 ? 'selected' : ''}>Every 2 months</option>
            <option value="90" ${suggestedDays === 90 ? 'selected' : ''}>Quarterly</option>
          </select>
        </div>
      </div>
    `

    // Initialize frequency with suggested value
    productFrequencies.set(index, suggestedDays)

    const checkbox = productEl.querySelector('.sa-checkbox')! as HTMLInputElement
    const frequencySelect = productEl.querySelector('.sa-product-frequency-select')! as HTMLSelectElement

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedProducts.add(index)
        productEl.classList.add('selected')
      } else {
        selectedProducts.delete(index)
        productEl.classList.remove('selected')
      }
      updateSubscribeButton()
    })

    frequencySelect.addEventListener('change', (e) => {
      const value = parseInt((e.target as HTMLSelectElement).value)
      productFrequencies.set(index, value)
    })

    productEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'SELECT') {
        checkbox.checked = !checkbox.checked
        checkbox.dispatchEvent(new Event('change'))
      }
    })

    productsContainer.appendChild(productEl)
  })

  // Update subscribe button state
  function updateSubscribeButton() {
    const btn = document.getElementById('sa-subscribe') as HTMLButtonElement
    btn.disabled = selectedProducts.size === 0
    btn.textContent =
      selectedProducts.size === 0
        ? 'Select items above'
        : `Help me remember ${selectedProducts.size} item${selectedProducts.size > 1 ? 's' : ''}`
  }

  // Close button
  document.getElementById('sa-close')!.addEventListener('click', () => {
    container.classList.add('closing')
    if (backdrop) backdrop.style.opacity = '0'
    setTimeout(() => {
      container.remove()
      backdrop.remove()
    }, 250)
  })

  // Subscribe button
  document.getElementById('sa-subscribe')!.addEventListener('click', async () => {
    // Send subscription request to background (each with its own frequency)
    try {
      for (const idx of selectedProducts) {
        const product = subscribableProducts[idx]
        const frequency = productFrequencies.get(idx) || 30

        await chrome.runtime.sendMessage({
          type: 'CREATE_SUBSCRIPTION',
          payload: {
            subscription: {
              product_name: product.name,
              product_url: pageUrl,
              retailer: analysis.retailer || new URL(pageUrl).hostname,
              price: product.price,
              frequency_days: frequency
            }
          }
        })
      }

      // Show success and close
      showSuccessMessage(selectedProducts.size)
      container.remove()
    } catch (error) {
      console.error('[Subscribe Any] Error creating subscription:', error)
      alert('Failed to create subscription. Please try again.')
    }
  })
}

/**
 * Show success message after subscribing
 */
function showSuccessMessage(count: number): void {
  const toast = document.createElement('div')
  toast.id = 'subscribe-any-toast'
  toast.innerHTML = `
    <style>
      #subscribe-any-toast {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 16px 24px;
        background: #4CAF50;
        color: white;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 999999;
        animation: fadeIn 0.3s ease-out;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
    Subscribed to ${count} item${count > 1 ? 's' : ''}! You'll receive reminders.
  `

  document.body.appendChild(toast)

  setTimeout(() => {
    toast.remove()
  }, 3000)
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Show floating button on supported store pages
 */
function showFloatingButton(): void {
  // Check if button already exists
  if (document.getElementById('sa-floating-btn')) {
    return
  }

  const store = detectStore(window.location.href)
  if (!store) return

  const button = document.createElement('div')
  button.id = 'sa-floating-btn'
  button.innerHTML = `
    <style>
      #sa-floating-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        border-radius: 16px;
        box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
        cursor: pointer;
        z-index: 999997;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        transition: all 0.2s ease;
        animation: bounceIn 0.4s ease-out;
      }

      @keyframes bounceIn {
        0% {
          transform: scale(0) translateY(20px);
          opacity: 0;
        }
        60% {
          transform: scale(1.1) translateY(0);
        }
        100% {
          transform: scale(1) translateY(0);
          opacity: 1;
        }
      }

      #sa-floating-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 24px rgba(99, 102, 241, 0.5);
      }

      #sa-floating-btn:active {
        transform: scale(1.05);
      }

      #sa-floating-btn .sa-btn-icon {
        font-size: 24px;
        font-weight: 700;
        color: white;
      }

      #sa-floating-btn .sa-btn-tooltip {
        position: absolute;
        right: 64px;
        background: #1f2937;
        color: white;
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 13px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s;
      }

      #sa-floating-btn:hover .sa-btn-tooltip {
        opacity: 1;
      }

      #sa-floating-btn .sa-btn-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        width: 20px;
        height: 20px;
        background: #ef4444;
        border-radius: 50%;
        font-size: 11px;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
      }
    </style>
    <span class="sa-btn-icon">SA</span>
    <span class="sa-btn-tooltip">Subscribe Any - ${escapeHtml(store.name)}</span>
  `

  // Click handler - open sidebar
  button.addEventListener('click', () => {
    showMainSidebar(store)
  })

  document.body.appendChild(button)
}

/**
 * Show the main sidebar when clicking the floating button
 */
async function showMainSidebar(store: { name: string; logo: string }): Promise<void> {
  // Check if already open
  if (document.getElementById('sa-main-sidebar')) {
    return
  }

  // Fetch user's subscriptions
  let subscriptions: any[] = []
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_SUBSCRIPTIONS'
    })
    subscriptions = response?.subscriptions || []
  } catch (e) {
    console.log('Could not fetch subscriptions')
  }

  const container = document.createElement('div')
  container.id = 'sa-main-sidebar'
  container.innerHTML = `
    <style>
      #sa-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 999998;
        animation: fadeIn 0.25s ease-out;
      }

      #sa-main-sidebar {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 400px;
        max-width: 90vw;
        background: white;
        box-shadow: -4px 0 30px rgba(0, 0, 0, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 999999;
        animation: slideInRight 0.3s ease-out;
        display: flex;
        flex-direction: column;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes slideInRight {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
      }

      #sa-main-sidebar.closing {
        animation: slideOutRight 0.25s ease-in forwards;
      }

      @keyframes slideOutRight {
        to { transform: translateX(100%); }
      }

      .sa-header {
        padding: 20px;
        border-bottom: 1px solid #e5e5e5;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: white;
      }

      .sa-title {
        font-size: 18px;
        font-weight: 600;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .sa-logo {
        width: 32px;
        height: 32px;
        background: white;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 700;
        color: #6366f1;
      }

      .sa-close {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: white;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: background 0.2s;
      }

      .sa-close:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .sa-store-banner {
        padding: 16px 20px;
        background: #f3f4f6;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .sa-store-icon {
        width: 36px;
        height: 36px;
        background: white;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        color: #374151;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }

      .sa-store-info h4 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: #1f2937;
      }

      .sa-store-info p {
        margin: 2px 0 0;
        font-size: 12px;
        color: #6b7280;
      }

      .sa-body {
        padding: 20px;
        flex: 1;
        overflow-y: auto;
      }

      .sa-section-title {
        font-size: 14px;
        font-weight: 600;
        color: #374151;
        margin: 0 0 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .sa-subscription-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 10px;
        transition: all 0.2s;
      }

      .sa-subscription-card:hover {
        border-color: #6366f1;
        box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1);
      }

      .sa-subscription-name {
        font-weight: 500;
        color: #1f2937;
        margin-bottom: 4px;
      }

      .sa-subscription-meta {
        font-size: 12px;
        color: #6b7280;
      }

      .sa-empty-state {
        text-align: center;
        padding: 30px 20px;
        color: #6b7280;
      }

      .sa-empty-state svg {
        width: 48px;
        height: 48px;
        margin-bottom: 12px;
        opacity: 0.5;
      }

      .sa-footer {
        padding: 16px 20px;
        border-top: 1px solid #e5e5e5;
        background: #f9fafb;
      }

      .sa-btn-secondary {
        width: 100%;
        padding: 12px;
        background: white;
        color: #6366f1;
        border: 2px solid #6366f1;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .sa-btn-secondary:hover {
        background: #6366f1;
        color: white;
      }
    </style>

    <div class="sa-header">
      <h3 class="sa-title">
        <span class="sa-logo">SA</span>
        Subscribe Any
      </h3>
      <button class="sa-close" id="sa-close">&times;</button>
    </div>

    <div class="sa-store-banner">
      <div class="sa-store-icon">${escapeHtml(store.logo || store.name[0])}</div>
      <div class="sa-store-info">
        <h4>${escapeHtml(store.name)}</h4>
        <p>Browsing on this store</p>
      </div>
    </div>

    <div class="sa-body">
      <h3 class="sa-section-title">Your Subscriptions</h3>
      <div id="sa-subscriptions-list"></div>
    </div>

    <div class="sa-footer">
      <button class="sa-btn-secondary" id="sa-manage-btn">
        Manage All Subscriptions
      </button>
    </div>
  `

  // Create backdrop
  const backdrop = document.createElement('div')
  backdrop.id = 'sa-backdrop'

  const closeSidebar = () => {
    container.classList.add('closing')
    backdrop.style.opacity = '0'
    setTimeout(() => {
      container.remove()
      backdrop.remove()
    }, 250)
  }

  backdrop.addEventListener('click', closeSidebar)
  document.body.appendChild(backdrop)
  document.body.appendChild(container)

  // Close button
  document.getElementById('sa-close')!.addEventListener('click', closeSidebar)

  // Populate subscriptions
  const listEl = document.getElementById('sa-subscriptions-list')!

  if (subscriptions.length === 0) {
    listEl.innerHTML = `
      <div class="sa-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v20M2 12h20"/>
        </svg>
        <p>No subscriptions yet</p>
        <p style="font-size: 12px;">Complete a purchase to get started</p>
      </div>
    `
  } else {
    subscriptions.forEach(sub => {
      const card = document.createElement('div')
      card.className = 'sa-subscription-card'
      card.innerHTML = `
        <div class="sa-subscription-name">${escapeHtml(sub.product_name)}</div>
        <div class="sa-subscription-meta">
          ${escapeHtml(sub.retailer)} • Every ${sub.frequency_days} days
          ${sub.price ? ` • $${sub.price}` : ''}
        </div>
      `
      listEl.appendChild(card)
    })
  }

  // Manage button - opens extension popup
  document.getElementById('sa-manage-btn')!.addEventListener('click', () => {
    closeSidebar()
    // Open extension popup programmatically
    chrome.runtime.sendMessage({ type: 'OPEN_POPUP' })
  })
}

// Run detection when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    detectOrderConfirmation()
    showFloatingButton()
  })
} else {
  detectOrderConfirmation()
  showFloatingButton()
}

// Also run on SPA navigation (history changes)
let lastUrl = location.href
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href
    setTimeout(() => {
      detectOrderConfirmation()
      showFloatingButton()
    }, 500) // Wait for page to settle
  }
}).observe(document, { subtree: true, childList: true })
