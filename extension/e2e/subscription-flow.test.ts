import { test, expect, type BrowserContext } from '@playwright/test'
import path from 'path'

// Helper to get extension ID from service worker
async function getExtensionId(context: BrowserContext): Promise<string> {
  // Wait for service worker to be registered
  let serviceWorker
  for (let i = 0; i < 10; i++) {
    const workers = context.serviceWorkers()
    serviceWorker = workers.find((w) => w.url().includes('service-worker'))
    if (serviceWorker) break
    await new Promise((r) => setTimeout(r, 500))
  }

  if (!serviceWorker) {
    throw new Error('Extension service worker not found')
  }

  // Extract extension ID from URL
  const url = serviceWorker.url()
  const match = url.match(/chrome-extension:\/\/([^/]+)/)
  if (!match) {
    throw new Error('Could not extract extension ID')
  }

  return match[1]
}

test.describe('Subscription Flow', () => {
  test.skip('popup shows auth screen when not logged in', async ({ context }) => {
    const extensionId = await getExtensionId(context)
    const popupPage = await context.newPage()
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`)

    // Should show auth screen
    await expect(popupPage.locator('text=Welcome back')).toBeVisible()
    await expect(popupPage.locator('text=Sign in')).toBeVisible()
  })

  test.skip('detects order confirmation page', async ({ context }) => {
    // Create a mock order confirmation page
    const mockPage = await context.newPage()

    // Navigate to a mock order confirmation
    await mockPage.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Order Confirmation - Thank You</title></head>
        <body>
          <h1>Thank you for your order!</h1>
          <p>Order number: #12345678</p>
          <div class="product">
            <span class="name">Dog Food 30lb Bag</span>
            <span class="price">$59.99</span>
          </div>
          <p>Your order has been confirmed.</p>
        </body>
      </html>
    `)

    // Wait for content script to process
    await mockPage.waitForTimeout(2000)

    // Check if prompt appeared
    const prompt = mockPage.locator('#subscribe-any-prompt')
    // Note: This test may need adjustment based on actual LLM/heuristic behavior
  })
})

test.describe('UI Components', () => {
  test.skip('subscription list shows empty state', async ({ context }) => {
    const extensionId = await getExtensionId(context)
    const popupPage = await context.newPage()
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`)

    // After auth, should show subscriptions tab
    // This test assumes user is logged in (may need mock auth setup)
  })

  test.skip('settings page shows LLM configuration', async ({ context }) => {
    const extensionId = await getExtensionId(context)
    const popupPage = await context.newPage()
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`)

    // Click settings tab
    await popupPage.click('text=Settings')

    // Should show AI Provider section
    await expect(popupPage.locator('text=AI Provider')).toBeVisible()
  })
})

// Note: These tests are marked as skip because:
// 1. They require the extension to be built first
// 2. They need proper auth setup (mock Supabase)
// 3. Extension testing with Playwright requires additional setup
//
// To run these tests:
// 1. npm run build
// 2. Set up test environment variables
// 3. npm run test:e2e
//
// For CI, consider using a dedicated extension testing framework
// or mocking the Chrome APIs more extensively.
