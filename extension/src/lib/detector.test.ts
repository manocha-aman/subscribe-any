import { describe, it, expect } from 'vitest'
import {
  isLikelyOrderConfirmationUrl,
  isLikelyOrderConfirmationPage,
  extractPageContent,
  getUrlConfidenceScore
} from './detector'

describe('URL Detection Heuristics', () => {
  describe('isLikelyOrderConfirmationUrl', () => {
    it('detects Amazon order confirmation URL', () => {
      const result = isLikelyOrderConfirmationUrl(
        'https://www.amazon.com/gp/buy/thankyou/handlers/display.html'
      )
      expect(result.isLikelyOrderConfirmation).toBe(true)
      expect(result.triggers).toContain('amazon-thankyou')
    })

    it('detects Amazon order history URLs', () => {
      const result = isLikelyOrderConfirmationUrl(
        'https://www.amazon.com/gp/css/order-history'
      )
      expect(result.isLikelyOrderConfirmation).toBe(false)
    })

    it('detects generic /thank-you URLs', () => {
      const result = isLikelyOrderConfirmationUrl(
        'https://shop.example.com/checkout/thank-you'
      )
      expect(result.isLikelyOrderConfirmation).toBe(true)
      expect(result.triggers).toContain('url-thank-you')
    })

    it('detects /order-confirmation URLs', () => {
      const result = isLikelyOrderConfirmationUrl(
        'https://store.example.com/order-confirmation?id=12345'
      )
      expect(result.isLikelyOrderConfirmation).toBe(true)
      expect(result.triggers).toContain('url-order-confirmation')
    })

    it('detects /order/success URLs', () => {
      const result = isLikelyOrderConfirmationUrl(
        'https://shop.example.com/order/success'
      )
      expect(result.isLikelyOrderConfirmation).toBe(true)
      expect(result.triggers).toContain('url-order-success')
    })

    it('detects /checkout/complete URLs', () => {
      const result = isLikelyOrderConfirmationUrl(
        'https://store.example.com/checkout/complete'
      )
      expect(result.isLikelyOrderConfirmation).toBe(true)
      expect(result.triggers).toContain('url-checkout-complete')
    })

    it('detects Walmart order confirmation', () => {
      const result = isLikelyOrderConfirmationUrl(
        'https://www.walmart.com/checkout/order-confirmation'
      )
      expect(result.isLikelyOrderConfirmation).toBe(true)
    })

    it('detects Target order confirmation', () => {
      const result = isLikelyOrderConfirmationUrl(
        'https://www.target.com/co-thankyou'
      )
      expect(result.isLikelyOrderConfirmation).toBe(true)
    })

    it('ignores product pages', () => {
      const result = isLikelyOrderConfirmationUrl(
        'https://www.amazon.com/dp/B08N5WRWNW'
      )
      expect(result.isLikelyOrderConfirmation).toBe(false)
    })

    it('ignores cart pages', () => {
      const result = isLikelyOrderConfirmationUrl(
        'https://www.amazon.com/gp/cart/view.html'
      )
      expect(result.isLikelyOrderConfirmation).toBe(false)
    })

    it('ignores checkout pages (not confirmation)', () => {
      const result = isLikelyOrderConfirmationUrl(
        'https://shop.example.com/checkout'
      )
      expect(result.isLikelyOrderConfirmation).toBe(false)
    })

    it('ignores homepage', () => {
      const result = isLikelyOrderConfirmationUrl('https://www.amazon.com/')
      expect(result.isLikelyOrderConfirmation).toBe(false)
    })

    it('detects Shopify confirmation pages', () => {
      const result = isLikelyOrderConfirmationUrl(
        'https://mystore.myshopify.com/12345/orders/67890/authenticate'
      )
      expect(result.isLikelyOrderConfirmation).toBe(true)
    })
  })

  describe('getUrlConfidenceScore', () => {
    it('returns high confidence for explicit order confirmation URLs', () => {
      const score = getUrlConfidenceScore(
        'https://shop.example.com/order-confirmation'
      )
      expect(score).toBeGreaterThanOrEqual(0.8)
    })

    it('returns medium confidence for thank-you URLs', () => {
      const score = getUrlConfidenceScore(
        'https://shop.example.com/thank-you'
      )
      expect(score).toBeGreaterThanOrEqual(0.6)
    })

    it('returns zero for unrelated URLs', () => {
      const score = getUrlConfidenceScore('https://www.google.com/')
      expect(score).toBe(0)
    })
  })

  describe('isLikelyOrderConfirmationPage', () => {
    it('detects order confirmation by page title', () => {
      const result = isLikelyOrderConfirmationPage({
        url: 'https://example.com/checkout/done',
        title: 'Order Confirmation - Your order has been placed',
        bodyText: 'Thank you for your purchase'
      })
      expect(result.isLikelyOrderConfirmation).toBe(true)
      expect(result.triggers).toContain('title-order-confirmation')
    })

    it('detects by order number in content with supporting signals', () => {
      const result = isLikelyOrderConfirmationPage({
        url: 'https://example.com/order/receipt',
        title: 'Order Receipt',
        bodyText: 'Your order number is #123456. Thank you for shopping with us. Your order has been confirmed.'
      })
      expect(result.isLikelyOrderConfirmation).toBe(true)
      expect(result.triggers).toContain('content-order-number')
    })

    it('detects by confirmation keywords in content', () => {
      const result = isLikelyOrderConfirmationPage({
        url: 'https://example.com/done',
        title: 'Thank You',
        bodyText:
          'Your order has been confirmed. A confirmation email has been sent.'
      })
      expect(result.isLikelyOrderConfirmation).toBe(true)
    })

    it('requires multiple signals for low-confidence URLs', () => {
      const result = isLikelyOrderConfirmationPage({
        url: 'https://example.com/page',
        title: 'Some Page',
        bodyText: 'Welcome to our store'
      })
      expect(result.isLikelyOrderConfirmation).toBe(false)
    })
  })

  describe('extractPageContent', () => {
    it('extracts clean text from HTML', () => {
      const html = `
        <html>
          <head><title>Order Confirmation</title></head>
          <body>
            <script>console.log('ignore me')</script>
            <style>.class { color: red; }</style>
            <nav>Navigation Menu</nav>
            <main>
              <h1>Thank you for your order!</h1>
              <p>Order #12345</p>
              <p>Product: Widget - $19.99</p>
            </main>
            <footer>Footer content</footer>
          </body>
        </html>
      `
      const { html: htmlContent, text } = extractPageContent(html)
      expect(htmlContent).toContain('Thank you for your order')
      expect(htmlContent).toContain('Order #12345')
      expect(htmlContent).toContain('Widget')
      expect(htmlContent).not.toContain('console.log')
      expect(htmlContent).not.toContain('color: red')
      expect(text).toContain('Thank you for your order')
      expect(text).not.toContain('console.log')
    })

    it('limits content length', () => {
      const longContent = 'x'.repeat(100000)
      const html = `<html><body>${longContent}</body></html>`
      const { html: htmlContent, text } = extractPageContent(html)
      expect(htmlContent.length).toBeLessThanOrEqual(60010) // 60000 + '[truncated]'
      expect(text.length).toBeLessThanOrEqual(30010) // 30000 + '[truncated]'
    })

    it('preserves useful HTML attributes', () => {
      const html = `
        <div class="product-item" id="prod123" data-product-name="Widget">
          <span class="product-name">Widget</span>
          <span class="price">$19.99</span>
        </div>
      `
      const { html: htmlContent } = extractPageContent(html)
      expect(htmlContent).toContain('class="product-item"')
      expect(htmlContent).toContain('id="prod123"')
      expect(htmlContent).toContain('data-product-name="Widget"')
    })

    it('extracts plain text separately', () => {
      const html = `
        <html>
          <body>
            <h1>Order Confirmation</h1>
            <p>Order #12345</p>
            <p>Product: Widget - $19.99</p>
          </body>
        </html>
      `
      const { text } = extractPageContent(html)
      expect(text).toContain('Order Confirmation')
      expect(text).toContain('Order #12345')
      expect(text).toContain('Widget')
      // Text should not contain HTML tags
      expect(text).not.toContain('<h1>')
      expect(text).not.toContain('</p>')
    })
  })
})
