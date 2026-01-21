/**
 * Browser notification utilities
 */

export interface NotificationOptions {
  title: string
  message: string
  iconUrl?: string
  requireInteraction?: boolean
  buttons?: Array<{ title: string }>
}

/**
 * Check if notifications are permitted
 */
export async function checkNotificationPermission(): Promise<boolean> {
  // In extension context, notifications are always permitted if declared in manifest
  return true
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<boolean> {
  // Extensions don't need to request permission, it's granted via manifest
  return true
}

/**
 * Show a basic notification
 */
export function showNotification(
  id: string,
  options: NotificationOptions
): Promise<string> {
  return new Promise((resolve) => {
    chrome.notifications.create(
      id,
      {
        type: 'basic',
        title: options.title,
        message: options.message,
        iconUrl: options.iconUrl || chrome.runtime.getURL('icons/icon128.png'),
        requireInteraction: options.requireInteraction ?? false,
        buttons: options.buttons
      },
      (notificationId) => {
        resolve(notificationId || id)
      }
    )
  })
}

/**
 * Clear a notification
 */
export function clearNotification(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.notifications.clear(id, (wasCleared) => {
      resolve(wasCleared)
    })
  })
}

/**
 * Update a notification
 */
export function updateNotification(
  id: string,
  options: Partial<NotificationOptions>
): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.notifications.update(
      id,
      {
        title: options.title,
        message: options.message
      },
      (wasUpdated) => {
        resolve(wasUpdated)
      }
    )
  })
}
