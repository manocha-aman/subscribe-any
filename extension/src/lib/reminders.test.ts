import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Subscription } from '@/types'

// Mock supabase before importing reminders (which imports subscriptions which imports supabase)
vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          lte: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null }))
          }))
        }))
      }))
    })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-123' } }, error: null }))
    }
  }
}))

import {
  sendBrowserNotification,
  scheduleReminderCheck,
  formatReminderMessage,
  isDueForReminder
} from './reminders'

// Mock chrome APIs are set up in test-setup.ts

const mockSubscription: Subscription = {
  id: 'sub-123',
  user_id: 'user-123',
  product_name: 'Dog Food',
  product_url: 'https://amazon.com/product/123',
  retailer: 'Amazon',
  price: 59.99,
  frequency_days: 30,
  last_ordered_at: '2024-01-01T00:00:00Z',
  next_reminder_at: '2024-01-31T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z'
}

describe('Reminder Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('isDueForReminder', () => {
    it('returns true when reminder date is in the past', () => {
      vi.setSystemTime(new Date('2024-02-01T00:00:00Z'))

      const result = isDueForReminder(mockSubscription)
      expect(result).toBe(true)
    })

    it('returns true when reminder date is today', () => {
      vi.setSystemTime(new Date('2024-01-31T12:00:00Z'))

      const result = isDueForReminder(mockSubscription)
      expect(result).toBe(true)
    })

    it('returns false when reminder date is in the future', () => {
      vi.setSystemTime(new Date('2024-01-15T00:00:00Z'))

      const result = isDueForReminder(mockSubscription)
      expect(result).toBe(false)
    })

    it('returns false when next_reminder_at is null', () => {
      const subWithoutReminder = { ...mockSubscription, next_reminder_at: null }
      const result = isDueForReminder(subWithoutReminder)
      expect(result).toBe(false)
    })
  })

  describe('formatReminderMessage', () => {
    it('formats message with product name and retailer', () => {
      const message = formatReminderMessage(mockSubscription)

      expect(message).toContain('Dog Food')
      expect(message).toContain('Amazon')
    })

    it('includes price if available', () => {
      const message = formatReminderMessage(mockSubscription)
      expect(message).toContain('$59.99')
    })

    it('handles missing price gracefully', () => {
      const subWithoutPrice = { ...mockSubscription, price: null }
      const message = formatReminderMessage(subWithoutPrice)

      expect(message).toContain('Dog Food')
      expect(message).not.toContain('$')
    })
  })

  describe('sendBrowserNotification', () => {
    it('creates notification with correct options', async () => {
      await sendBrowserNotification(mockSubscription)

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.stringContaining('reminder-sub-123'),
        expect.objectContaining({
          type: 'basic',
          title: expect.stringContaining('Reorder'),
          message: expect.any(String),
          iconUrl: expect.any(String),
          requireInteraction: true,
          buttons: expect.arrayContaining([
            expect.objectContaining({ title: 'Reorder Now' }),
            expect.objectContaining({ title: 'Snooze' })
          ])
        }),
        expect.any(Function) // Callback function
      )
    })

    it('uses subscription ID in notification ID', async () => {
      await sendBrowserNotification(mockSubscription)

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.stringContaining('sub-123'),
        expect.any(Object),
        expect.any(Function) // Callback function
      )
    })
  })

  describe('scheduleReminderCheck', () => {
    it('creates an alarm for periodic checking', () => {
      scheduleReminderCheck()

      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'check-reminders',
        expect.objectContaining({
          periodInMinutes: expect.any(Number)
        })
      )
    })

    it('schedules check every hour by default', () => {
      scheduleReminderCheck()

      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'check-reminders',
        expect.objectContaining({
          periodInMinutes: 60
        })
      )
    })

    it('allows custom interval', () => {
      scheduleReminderCheck(30)

      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'check-reminders',
        expect.objectContaining({
          periodInMinutes: 30
        })
      )
    })
  })

  describe('checkDueReminders', () => {
    it('identifies subscriptions due for reminder today', async () => {
      vi.setSystemTime(new Date('2024-02-01T00:00:00Z'))

      const subscriptions = [
        mockSubscription, // Due (past)
        { ...mockSubscription, id: 'sub-456', next_reminder_at: '2024-03-01T00:00:00Z' } // Not due
      ]

      const due = subscriptions.filter(isDueForReminder)
      expect(due).toHaveLength(1)
      expect(due[0].id).toBe('sub-123')
    })

    it('does not include subscriptions without reminder date', () => {
      vi.setSystemTime(new Date('2024-02-01T00:00:00Z'))

      const subscriptions = [
        mockSubscription,
        { ...mockSubscription, id: 'sub-789', next_reminder_at: null }
      ]

      const due = subscriptions.filter(isDueForReminder)
      expect(due).toHaveLength(1)
    })
  })
})
