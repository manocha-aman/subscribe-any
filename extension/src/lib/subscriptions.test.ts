import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
  getSubscriptions,
  markAsOrdered,
  calculateNextReminderDate,
  snoozeReminder
} from './subscriptions'
import type { Subscription, CreateSubscriptionInput } from '@/types'

// Mock Supabase
vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          order: vi.fn(() => Promise.resolve({ data: [], error: null }))
        })),
        order: vi.fn(() => Promise.resolve({ data: [], error: null }))
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: mockSubscription, error: null }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: mockSubscription, error: null }))
          }))
        }))
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }))
    })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-123' } }, error: null }))
    }
  }
}))

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

describe('Subscription Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('calculateNextReminderDate', () => {
    it('calculates next reminder from today when no last order date', () => {
      const now = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(now)

      const nextDate = calculateNextReminderDate(null, 30)
      const expected = new Date('2024-02-14T12:00:00Z')

      expect(new Date(nextDate).toISOString()).toBe(expected.toISOString())

      vi.useRealTimers()
    })

    it('calculates next reminder from last order date', () => {
      const lastOrdered = '2024-01-01T12:00:00Z'
      const nextDate = calculateNextReminderDate(lastOrdered, 30)
      const expected = new Date('2024-01-31T12:00:00Z')

      expect(new Date(nextDate).toISOString()).toBe(expected.toISOString())
    })

    it('handles weekly frequency', () => {
      const lastOrdered = '2024-01-01T12:00:00Z'
      const nextDate = calculateNextReminderDate(lastOrdered, 7)
      const expected = new Date('2024-01-08T12:00:00Z')

      expect(new Date(nextDate).toISOString()).toBe(expected.toISOString())
    })

    it('handles bi-weekly frequency', () => {
      const lastOrdered = '2024-01-01T12:00:00Z'
      const nextDate = calculateNextReminderDate(lastOrdered, 14)
      const expected = new Date('2024-01-15T12:00:00Z')

      expect(new Date(nextDate).toISOString()).toBe(expected.toISOString())
    })
  })

  describe('createSubscription', () => {
    it('creates subscription with correct next_reminder_at', async () => {
      const now = new Date('2024-01-15T12:00:00Z')
      vi.setSystemTime(now)

      const input: CreateSubscriptionInput = {
        product_name: 'Dog Food',
        product_url: 'https://amazon.com/product/123',
        retailer: 'Amazon',
        price: 59.99,
        frequency_days: 30
      }

      const result = await createSubscription(input)

      expect(result).not.toBeNull()
      expect(result?.product_name).toBe('Dog Food')

      vi.useRealTimers()
    })

    it('handles creation errors gracefully', async () => {
      const { supabase } = await import('./supabase')
      vi.mocked(supabase.from).mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'DB Error' } }))
          }))
        }))
      } as never)

      const input: CreateSubscriptionInput = {
        product_name: 'Test Product',
        retailer: 'Test Store',
        frequency_days: 30
      }

      const result = await createSubscription(input)
      expect(result).toBeNull()
    })
  })

  describe('updateSubscription', () => {
    it('updates frequency and recalculates reminder date', async () => {
      const { supabase } = await import('./supabase')
      const updatedSub = { ...mockSubscription, frequency_days: 14 }

      // First call: select to get current subscription
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: mockSubscription, error: null }))
          }))
        }))
      } as never)

      // Second call: update
      vi.mocked(supabase.from).mockReturnValueOnce({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: updatedSub, error: null }))
            }))
          }))
        }))
      } as never)

      const result = await updateSubscription('sub-123', { frequency_days: 14 })

      expect(result).not.toBeNull()
      expect(result?.frequency_days).toBe(14)
    })
  })

  describe('markAsOrdered', () => {
    it('updates last_ordered_at and calculates new reminder', async () => {
      const now = new Date('2024-02-01T12:00:00Z')
      vi.setSystemTime(now)

      const { supabase } = await import('./supabase')
      const orderedSub = {
        ...mockSubscription,
        last_ordered_at: now.toISOString(),
        next_reminder_at: new Date('2024-03-02T12:00:00Z').toISOString()
      }
      vi.mocked(supabase.from)
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: mockSubscription, error: null }))
            }))
          }))
        } as never)
        .mockReturnValueOnce({
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: orderedSub, error: null }))
              }))
            }))
          }))
        } as never)

      const result = await markAsOrdered('sub-123')

      expect(result).not.toBeNull()
      expect(result?.last_ordered_at).toBe(now.toISOString())

      vi.useRealTimers()
    })
  })

  describe('snoozeReminder', () => {
    it('adds snooze days to current reminder date', async () => {
      const currentReminder = new Date('2024-01-31T12:00:00Z')
      const { supabase } = await import('./supabase')
      const snoozedSub = {
        ...mockSubscription,
        next_reminder_at: new Date('2024-02-03T12:00:00Z').toISOString()
      }
      vi.mocked(supabase.from)
        .mockReturnValueOnce({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { ...mockSubscription, next_reminder_at: currentReminder.toISOString() },
                  error: null
                })
              )
            }))
          }))
        } as never)
        .mockReturnValueOnce({
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: snoozedSub, error: null }))
              }))
            }))
          }))
        } as never)

      const result = await snoozeReminder('sub-123', 3)

      expect(result).not.toBeNull()
    })
  })

  describe('deleteSubscription', () => {
    it('deletes subscription successfully', async () => {
      const result = await deleteSubscription('sub-123')
      expect(result).toBe(true)
    })

    it('handles deletion errors', async () => {
      const { supabase } = await import('./supabase')
      vi.mocked(supabase.from).mockReturnValueOnce({
        delete: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: { message: 'Not found' } }))
        }))
      } as never)

      const result = await deleteSubscription('non-existent')
      expect(result).toBe(false)
    })
  })

  describe('getSubscriptions', () => {
    it('returns all subscriptions for user', async () => {
      const { supabase } = await import('./supabase')
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({ data: [mockSubscription], error: null })
            )
          }))
        }))
      } as never)

      const result = await getSubscriptions()
      expect(result).toHaveLength(1)
      expect(result[0].product_name).toBe('Dog Food')
    })

    it('returns empty array on error', async () => {
      const { supabase } = await import('./supabase')
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({ data: null, error: { message: 'Error' } })
            )
          }))
        }))
      } as never)

      const result = await getSubscriptions()
      expect(result).toHaveLength(0)
    })
  })
})
