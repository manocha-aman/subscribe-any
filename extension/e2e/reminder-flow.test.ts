import { test, expect, type BrowserContext } from '@playwright/test'

// Helper to get extension ID from service worker
async function getExtensionId(context: BrowserContext): Promise<string> {
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

  const url = serviceWorker.url()
  const match = url.match(/chrome-extension:\/\/([^/]+)/)
  if (!match) {
    throw new Error('Could not extract extension ID')
  }

  return match[1]
}

test.describe('Reminder Flow', () => {
  test.skip('user receives reminder and marks as ordered', async ({ context }) => {
    const extensionId = await getExtensionId(context)

    // This test would:
    // 1. Create a subscription with a past due reminder date
    // 2. Trigger the reminder check
    // 3. Verify notification was created
    // 4. Click "Reorder Now" button
    // 5. Verify subscription was updated

    // Note: Browser notification testing is complex in Playwright
    // Consider using a mock notification system for testing
  })

  test.skip('user can snooze a reminder', async ({ context }) => {
    const extensionId = await getExtensionId(context)

    // This test would:
    // 1. Create a subscription with a due reminder
    // 2. Open the popup
    // 3. Click the snooze button
    // 4. Verify reminder date was updated
  })

  test.skip('subscription card shows due status', async ({ context }) => {
    const extensionId = await getExtensionId(context)
    const popupPage = await context.newPage()
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`)

    // With a mocked subscription that's due:
    // await expect(popupPage.locator('text=Due for reorder')).toBeVisible()
  })
})

// Integration test helpers
// These would be used with a local Supabase instance

export async function createTestSubscription(supabase: any, userId: string) {
  const { data, error } = await supabase.from('subscriptions').insert({
    user_id: userId,
    product_name: 'Test Product',
    retailer: 'Test Store',
    price: 29.99,
    frequency_days: 30,
    last_ordered_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    next_reminder_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Yesterday
  })

  if (error) throw error
  return data
}

export async function cleanupTestData(supabase: any, userId: string) {
  await supabase.from('subscriptions').delete().eq('user_id', userId)
}
