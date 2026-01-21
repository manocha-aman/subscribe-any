import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeOrderWithHeuristics } from './llm'

describe('LLM Integration', () => {
  describe('analyzeOrderWithHeuristics', () => {
    it('detects order confirmation pages', () => {
      const orderContent = `
        Order Confirmation
        Thank you for your order!
        Order #12345
      `
      const result = analyzeOrderWithHeuristics(orderContent)

      expect(result.isOrderConfirmation).toBe(true)
      expect(result.confidence).toBe(0.6)
    })

    it('returns false for non-order pages', () => {
      const nonOrderContent = `
        Welcome to our store
        Browse our products
        Add to cart
      `
      const result = analyzeOrderWithHeuristics(nonOrderContent)

      expect(result.isOrderConfirmation).toBe(false)
      expect(result.products).toHaveLength(0)
    })

    it('extracts retailer information', () => {
      const amazonContent = 'Order confirmation from Amazon - Order #123'
      const result = analyzeOrderWithHeuristics(amazonContent)

      expect(result.retailer).toBe('Amazon')
    })

    it('extracts order number', () => {
      const content = 'Order # ABC-12345-XYZ confirmed'
      const result = analyzeOrderWithHeuristics(content)

      expect(result.orderNumber).toBe('ABC-12345-XYZ')
    })

    it('identifies common retailers', () => {
      const retailers = [
        { content: 'Order from Walmart', expected: 'Walmart' },
        { content: 'Target order confirmation', expected: 'Target' },
        { content: 'Best Buy purchase', expected: 'Best Buy' },
        { content: 'Apple Store order', expected: 'Apple' }
      ]

      for (const { content, expected } of retailers) {
        const result = analyzeOrderWithHeuristics(content)
        expect(result.retailer).toBe(expected)
      }
    })

    it('handles various confirmation phrases', () => {
      const phrases = [
        'Order confirmation',
        'Thank you for your order',
        'Order has been received',
        'Purchase confirmation',
        'Order successfully placed'
      ]

      for (const phrase of phrases) {
        const result = analyzeOrderWithHeuristics(phrase)
        expect(result.isOrderConfirmation).toBe(true)
      }
    })
  })

  describe('analyzeOrderWithAI', () => {
    beforeEach(() => {
      vi.resetAllMocks()
    })

    it('calls Edge Function with session token', async () => {
      const mockSession = {
        access_token: 'test-token'
      }

      vi.spyOn(chrome.storage.local, 'get').mockImplementation((callback) => {
        if (typeof callback === 'function') {
          callback({ session: mockSession })
        }
        return
      })

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          isOrderConfirmation: true,
          confidence: 0.95,
          products: [],
          retailer: 'Test Store',
          orderNumber: '123'
        })
      })
      global.fetch = mockFetch

      const { analyzeOrderWithAI } = await import('./llm')
      const result = await analyzeOrderWithAI('Test content')

      expect(result.isOrderConfirmation).toBe(true)
      expect(mockFetch).toHaveBeenCalled()
    })

    it('handles missing session gracefully', async () => {
      vi.spyOn(chrome.storage.local, 'get').mockImplementation((callback) => {
        if (typeof callback === 'function') {
          callback({ session: null })
        }
        return
      })

      const { analyzeOrderWithAI } = await import('./llm')
      const result = await analyzeOrderWithAI('Test content')

      expect(result.isOrderConfirmation).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('handles API errors gracefully', async () => {
      vi.spyOn(chrome.storage.local, 'get').mockImplementation((callback) => {
        if (typeof callback === 'function') {
          callback({ session: { access_token: 'test-token' } })
        }
        return
      })

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error'
      })
      global.fetch = mockFetch

      const { analyzeOrderWithAI } = await import('./llm')
      const result = await analyzeOrderWithAI('Test content')

      expect(result.isOrderConfirmation).toBe(false)
    })
  })
})
