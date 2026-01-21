import type { Subscription } from '@/types'
import { getDueSubscriptions, markAsOrdered, snoozeReminder } from './subscriptions'

const REMINDER_ALARM_NAME = 'check-reminders'
const DEFAULT_CHECK_INTERVAL_MINUTES = 60

/**
 * Check if a subscription is due for a reminder
 */
export function isDueForReminder(subscription: Subscription): boolean {
  if (!subscription.next_reminder_at) {
    return false
  }

  const reminderDate = new Date(subscription.next_reminder_at)
  const now = new Date()

  // Due if reminder date is today or in the past
  return reminderDate <= now
}

/**
 * Format the reminder notification message
 */
export function formatReminderMessage(subscription: Subscription): string {
  let message = `Time to reorder ${subscription.product_name} from ${subscription.retailer}`

  if (subscription.price) {
    message += ` ($${subscription.price.toFixed(2)})`
  }

  return message
}

/**
 * Send a browser notification for a subscription reminder
 */
export async function sendBrowserNotification(subscription: Subscription): Promise<string> {
  const notificationId = `reminder-${subscription.id}-${Date.now()}`

  return new Promise((resolve) => {
    chrome.notifications.create(notificationId, {
      type: 'basic',
      title: `Reorder Reminder: ${subscription.product_name}`,
      message: formatReminderMessage(subscription),
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      requireInteraction: true,
      buttons: [
        { title: 'Reorder Now' },
        { title: 'Snooze' }
      ]
    }, (id) => {
      resolve(id || notificationId)
    })
  })
}

/**
 * Schedule periodic reminder checks
 */
export function scheduleReminderCheck(intervalMinutes = DEFAULT_CHECK_INTERVAL_MINUTES): void {
  chrome.alarms.create(REMINDER_ALARM_NAME, {
    periodInMinutes: intervalMinutes,
    delayInMinutes: 1 // Start first check after 1 minute
  })
}

/**
 * Cancel scheduled reminder checks
 */
export async function cancelReminderCheck(): Promise<void> {
  await chrome.alarms.clear(REMINDER_ALARM_NAME)
}

/**
 * Check for due reminders and send notifications
 */
export async function checkDueReminders(): Promise<void> {
  try {
    const dueSubscriptions = await getDueSubscriptions()

    // Track which subscriptions we've already notified about today
    // to avoid duplicate notifications
    const notifiedToday = await getNotifiedToday()

    for (const subscription of dueSubscriptions) {
      if (!notifiedToday.has(subscription.id)) {
        await sendBrowserNotification(subscription)
        await recordNotification(subscription.id)
      }
    }
  } catch (error) {
    console.error('Error checking due reminders:', error)
  }
}

/**
 * Get IDs of subscriptions that were notified today
 */
async function getNotifiedToday(): Promise<Set<string>> {
  const today = new Date().toISOString().split('T')[0]
  const result = await chrome.storage.local.get(['notifiedSubscriptions', 'notifiedDate'])

  // Reset if it's a new day
  if (result.notifiedDate !== today) {
    await chrome.storage.local.set({ notifiedSubscriptions: [], notifiedDate: today })
    return new Set()
  }

  return new Set(result.notifiedSubscriptions || [])
}

/**
 * Record that a notification was sent for a subscription
 */
async function recordNotification(subscriptionId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  const result = await chrome.storage.local.get(['notifiedSubscriptions', 'notifiedDate'])

  let notified = result.notifiedSubscriptions || []
  if (result.notifiedDate !== today) {
    notified = []
  }

  notified.push(subscriptionId)
  await chrome.storage.local.set({ notifiedSubscriptions: notified, notifiedDate: today })
}

/**
 * Handle notification button click
 */
export async function handleNotificationClick(
  notificationId: string,
  buttonIndex: number
): Promise<void> {
  // Extract subscription ID from notification ID
  const match = notificationId.match(/reminder-([^-]+)/)
  if (!match) return

  const subscriptionId = match[1]

  if (buttonIndex === 0) {
    // "Reorder Now" - mark as ordered and open product URL
    const subscription = await markAsOrdered(subscriptionId)
    if (subscription?.product_url) {
      chrome.tabs.create({ url: subscription.product_url })
    }
  } else if (buttonIndex === 1) {
    // "Snooze" - snooze for 1 day
    await snoozeReminder(subscriptionId, 1)
  }

  // Clear the notification
  chrome.notifications.clear(notificationId)
}

/**
 * Handle notification close/dismiss
 */
export async function handleNotificationClosed(notificationId: string): Promise<void> {
  // Could log dismissal for analytics
  console.log(`Notification ${notificationId} was closed`)
}

/**
 * Initialize reminder system
 */
export function initializeReminderSystem(): void {
  // Schedule periodic checks
  scheduleReminderCheck()

  // Set up alarm listener
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REMINDER_ALARM_NAME) {
      checkDueReminders()
    }
  })

  // Set up notification button click listener
  chrome.notifications.onButtonClicked.addListener(handleNotificationClick)

  // Set up notification close listener
  chrome.notifications.onClosed.addListener(handleNotificationClosed)
}
