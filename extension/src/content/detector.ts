import {
  isLikelyOrderConfirmationPage,
  extractPageContent,
  shouldAnalyzeWithLLM,
  detectStore,
  isOrderDetailsPage
} from '@/lib/detector'
import type { OrderDetectedPayload } from '@/types'

// Debounce time to avoid multiple detections on same page
const DETECTION_DEBOUNCE_MS = 2000

// Track if we've already processed this page
let lastProcessedUrl = ''
let lastProcessedTime = 0

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

  // Get page content for analysis
  const title = document.title
  const bodyText = extractPageContent(document.body.innerHTML)

  // First check with heuristics
  const pageInfo = { url, title, bodyText }
  const heuristicResult = isLikelyOrderConfirmationPage(pageInfo)
  const orderDetailsResult = isOrderDetailsPage(url)

  console.log('[Subscribe Any] Detection check:', {
    url,
    title,
    isLikely: heuristicResult.isLikelyOrderConfirmation,
    isOrderDetails: orderDetailsResult.isLikelyOrderConfirmation,
    confidence: heuristicResult.confidence,
    triggers: heuristicResult.triggers
  })

  // Check if this is an order details page (past orders)
  const isOrderDetails = orderDetailsResult.isLikelyOrderConfirmation

  if (isOrderDetails && showOnOrderDetails) {
    console.log('[Subscribe Any] Order details page detected, showing prompt...')
    await showSubscriptionPrompt({
      isOrderConfirmation: true,
      confidence: orderDetailsResult.confidence,
      products: [], // Will extract from DOM
      retailer: new URL(url).hostname.replace('www.', ''),
      orderNumber: null
    }, url, title)
    return
  }

  // Check if we should analyze with LLM for confirmation pages
  const shouldAnalyze = shouldAnalyzeWithLLM(pageInfo)
  console.log('[Subscribe Any] Should analyze with LLM:', shouldAnalyze)

  // Only proceed if heuristics suggest it might be an order page
  if (!shouldAnalyze) {
    console.log('[Subscribe Any] Skipping - not an order page according to heuristics')
    return
  }

  // Send to background script for LLM analysis
  try {
    console.log('[Subscribe Any] Sending to background for LLM analysis...')
    const response = await chrome.runtime.sendMessage({
      type: 'ANALYZE_PAGE',
      payload: {
        url,
        title,
        content: bodyText.substring(0, 50000), // Limit content size
        heuristicConfidence: heuristicResult.confidence // Pass heuristic for fallback
      }
    })

    console.log('[Subscribe Any] LLM response:', response)

    // Use LLM result, but fall back to heuristics if LLM fails or says no
    const finalAnalysis = response?.analysis

    if (finalAnalysis?.isOrderConfirmation) {
      console.log('[Subscribe Any] Order detected! Showing subscription prompt...')
      await showSubscriptionPrompt(finalAnalysis, url, title)
    } else if (heuristicResult.isLikelyOrderConfirmation && heuristicResult.confidence >= 0.8) {
      // Trust heuristics if confidence is high
      console.log('[Subscribe Any] Using heuristic result (high confidence)')
      await showSubscriptionPrompt({
        isOrderConfirmation: true,
        confidence: heuristicResult.confidence,
        products: [], // Will prompt to add manually
        retailer: new URL(url).hostname.replace('www.', ''),
        orderNumber: null
      }, url, title)
    } else {
      console.log('[Subscribe Any] Not an order page according to LLM and heuristics')
    }
  } catch (error) {
    console.error('[Subscribe Any] Error analyzing page:', error)
  }
}

/**
 * Wait for an element to appear in the DOM
 */
function waitForElement(selector: string, timeout = 3000): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector)
    if (element) {
      resolve(element)
      return
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) {
        observer.disconnect()
        resolve(el)
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })

    setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)
  })
}

/**
 * Extract products from the page DOM
 */
async function extractProductsFromDOM(): Promise<Array<{
  name: string
  price: number | null
  quantity: number
  isRecurring: boolean
  category: string | null
}>> {
  const products: Array<{
    name: string
    price: number | null
    quantity: number
    isRecurring: boolean
    category: string | null
  }> = []

  const hostname = window.location.hostname.toLowerCase()

  // For Bunnings specifically, wait for order items to load
  if (hostname.includes('bunnings')) {
    console.log('[Subscribe Any] Waiting for Bunnings products to load...')
    await waitForElement('.order-item', 5000)
    await new Promise(r => setTimeout(r, 500)) // Additional delay for React rendering
  }

  // Store-specific selectors
  const storeSelectors: Record<string, string[]> = {
    'bunnings.com.au': [
      '.order-item h6.MuiTypography-subtitle2',
      '.order-item .product-info h6',
      'h6.MuiTypography-subtitle2',
      '.product-info-container h6',
      'div[class*="order-item"] h6',
      'div[class*="product-info"] h6',
      'a[href*="_p0"] h6', // Product links have _p0178166 format
      '.order-item',
      '.product-info-container'
    ],
    'amazon': [
      '.product-name',
      '.a-fixed-left-grid .a-col-right',
      '[data-asin]',
      '.item-title',
      '.order-item-name'
    ],
    'kmart.com.au': [
      '.product-name',
      '.item-description',
      '[data-testid*="product"]',
      '.cart-item-name'
    ],
    'target.com.au': [
      '.product-name',
      '.item-name',
      '[data-test="product-name"]'
    ]
  }

  // Get selectors for current store or use common ones
  let productSelectors = storeSelectors[hostname] || []

  // Common selectors for product names on order confirmation pages
  const commonSelectors = [
    '[data-product-name]',
    '[data-testid="product-name"]',
    '.product-name',
    '.product-title',
    '.product-description',
    '.item-name',
    '.item-title',
    '.item-description',
    '.order-item .name',
    '.order-item .title',
    '.order-item-name',
    'tr.order-item td:first-child',
    '.checkout-product-name',
    '[class*="product"] [class*="name"]',
    '[class*="product"] [class*="title"]',
    '[class*="item"] [class*="name"]',
    '[class*="ProductCard"] [class*="Title"]',
    '[class*="OrderItem"] [class*="Product"]',
    'table tr td:first-child',
    '.cart-item .product-name',
    '.line-item-name'
  ]

  productSelectors = [...productSelectors, ...commonSelectors]

  console.log('[Subscribe Any] Extracting products from DOM, hostname:', hostname)

  // Try to find products using selectors
  for (const selector of productSelectors) {
    try {
      const elements = document.querySelectorAll(selector)
      if (elements.length > 0) {
        console.log(`[Subscribe Any] Found ${elements.length} elements with selector: ${selector}`)
        for (const el of Array.from(elements).slice(0, 15)) {
          const name = el.textContent?.trim()
          // Filter out non-product names
          if (!name || name.length < 3 || name.length > 200) continue
          // Skip common non-product text
          if (/^(your|order|thank|confirmation|item|quantity|price|total|subtotal|shipping|tax|discount)$/i.test(name)) continue

          // Try to find price nearby
          let price: number | null = null
          const parent = el.closest('tr, li, .product-item, .order-item, .item, .cart-item, [class*="Product"], [class*="Item"], .line-item, .product-price-container')
          if (parent) {
            // Look for price in parent element
            const priceText = parent.textContent || ''
            // Handle $28.85 or $28<sup>.85</sup> format
            const priceMatch = priceText.match(/\$(\d+)(?:[.<sup>]+(\d+)[</sup>]+)?\.?(\d+)?/)
            if (priceMatch) {
              let extractedPrice: number
              if (priceMatch[2] && priceMatch[3]) {
                // Format: $28<sup>.85</sup>
                extractedPrice = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`)
              } else if (priceMatch[3]) {
                // Format: $28.85
                extractedPrice = parseFloat(`${priceMatch[1]}.${priceMatch[3]}`)
              } else {
                extractedPrice = parseFloat(priceMatch[1])
              }
              // Sanity check the price
              if (extractedPrice > 0 && extractedPrice < 10000) {
                price = extractedPrice
              }
            }
          }

          // Avoid duplicates
          if (!products.some(p => p.name === name)) {
            products.push({ name, price, quantity: 1, isRecurring: true, category: null })
          }
        }
        if (products.length > 0) {
          console.log(`[Subscribe Any] Extracted ${products.length} products from selector: ${selector}`)
          break
        }
      }
    } catch (e) {
      // Skip invalid selectors
    }
  }

  // More aggressive fallback: Look for table rows with price patterns
  if (products.length === 0) {
    console.log('[Subscribe Any] Trying table-based extraction...')
    const tables = document.querySelectorAll('table')
    for (const table of Array.from(tables).slice(0, 5)) {
      const rows = table.querySelectorAll('tr')
      for (const row of Array.from(rows)) {
        const cells = row.querySelectorAll('td, th')
        if (cells.length >= 2) {
          const rowText = row.textContent?.trim() || ''
          // Look for price in this row
          const priceMatch = rowText.match(/[\$£€]?\s?(\d{1,4}\.?\d{2})/)
          if (priceMatch) {
            const price = parseFloat(priceMatch[1])
            if (price > 0 && price < 10000) {
              // Get text from first non-price cell as product name
              const firstCell = cells[0].textContent?.trim()
              if (firstCell && firstCell.length > 3 && firstCell.length < 200) {
                // Skip if it looks like a header/total row
                if (!/quantity|price|total|subtotal|shipping|tax|discount|item#/i.test(firstCell)) {
                  if (!products.some(p => p.name === firstCell)) {
                    products.push({ name: firstCell, price, quantity: 1, isRecurring: true, category: null })
                  }
                }
              }
            }
          }
        }
      }
      if (products.length > 0) break
    }
  }

  // Final fallback: Look for any structured list items that might be products
  if (products.length === 0) {
    const listItems = document.querySelectorAll('li, tr')
    for (const item of Array.from(listItems).slice(0, 100)) {
      const text = item.textContent?.trim()
      if (!text || text.length < 10 || text.length > 300) continue

      // Look for lines with prices
      const priceMatch = text.match(/(\d{1,4}\.\d{2})/)
      if (priceMatch) {
        // Extract potential product name (text before price)
        const beforePrice = text.substring(0, text.indexOf(priceMatch[1])).trim()
        if (beforePrice.length > 5 && beforePrice.length < 100) {
          // Skip if it looks like a total/subtotal line
          if (!/subtotal|total|tax|shipping|delivery|discount|promo|fee|item#/i.test(beforePrice)) {
            const name = beforePrice.replace(/^[\d\s\-\•]+/, '').trim()
            if (name && !products.some(p => p.name === name)) {
              products.push({
                name,
                price: parseFloat(priceMatch[1]),
                quantity: 1,
                isRecurring: true,
                category: null
              })
            }
          }
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

  // Use all products, not just recurring ones - user can decide
  let productsToShow = analysis.products
  if (productsToShow.length === 0) {
    console.log('[Subscribe Any] No products from analysis, extracting from DOM...')
    productsToShow = await extractProductsFromDOM()
    if (productsToShow.length === 0) {
      productsToShow = [{ name: 'Items from this order', price: null, quantity: 1, isRecurring: true, category: null }]
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

      .sa-footer {
        padding: 20px;
        border-top: 1px solid #e5e5e5;
        background: #f9fafb;
      }

      .sa-frequency {
        margin-bottom: 12px;
      }

      .sa-frequency-label {
        font-size: 13px;
        color: #666;
        margin-bottom: 6px;
      }

      .sa-frequency-select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        background: white;
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
        Subscribe Any
      </h3>
      <button class="sa-close" id="sa-close">&times;</button>
    </div>

    <div class="sa-body">
      <div id="sa-products"></div>
    </div>

    <div class="sa-footer">
      <div class="sa-frequency">
        <div class="sa-frequency-label">Remind me to reorder every:</div>
        <select class="sa-frequency-select" id="sa-frequency">
          <option value="7">Weekly</option>
          <option value="14">Bi-weekly</option>
          <option value="30" selected>Monthly</option>
          <option value="60">Every 2 months</option>
          <option value="90">Quarterly</option>
        </select>
      </div>
      <button class="sa-subscribe-btn" id="sa-subscribe" disabled>
        Subscribe to selected items
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

  // Populate products
  const productsContainer = document.getElementById('sa-products')!
  const selectedProducts = new Set<number>()

  productsToShow.forEach((product, index) => {
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
      </div>
    `

    const checkbox = productEl.querySelector('input')!
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

    productEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName !== 'INPUT') {
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
        ? 'Select items to subscribe'
        : `Subscribe to ${selectedProducts.size} item${selectedProducts.size > 1 ? 's' : ''}`
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
    const frequency = parseInt(
      (document.getElementById('sa-frequency') as HTMLSelectElement).value
    )

    const productsToSubscribe = Array.from(selectedProducts).map(
      (idx) => productsToShow[idx]
    )

    // Send subscription request to background
    try {
      for (const product of productsToSubscribe) {
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
      showSuccessMessage(productsToSubscribe.length)
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
