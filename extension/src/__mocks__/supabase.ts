import { vi } from 'vitest'

// Mock subscription data
export const mockSubscriptions = [
  {
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
]

// Mock Supabase client
export const supabase = {
  from: vi.fn((_table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({ data: mockSubscriptions[0], error: null })
        ),
        order: vi.fn(() =>
          Promise.resolve({ data: mockSubscriptions, error: null })
        )
      })),
      order: vi.fn(() =>
        Promise.resolve({ data: mockSubscriptions, error: null })
      ),
      lte: vi.fn(() => ({
        order: vi.fn(() =>
          Promise.resolve({ data: mockSubscriptions, error: null })
        )
      }))
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({ data: mockSubscriptions[0], error: null })
        )
      }))
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({ data: mockSubscriptions[0], error: null })
          )
        }))
      }))
    })),
    delete: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null }))
    }))
  })),
  auth: {
    getUser: vi.fn(() =>
      Promise.resolve({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null
      })
    ),
    signInWithPassword: vi.fn(() =>
      Promise.resolve({
        data: {
          user: { id: 'user-123', email: 'test@example.com' },
          session: { access_token: 'token' }
        },
        error: null
      })
    ),
    signUp: vi.fn(() =>
      Promise.resolve({
        data: {
          user: { id: 'user-123', email: 'test@example.com' },
          session: null
        },
        error: null
      })
    ),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } }
    }))
  }
}

// Helper to reset all mocks
export function resetSupabaseMocks() {
  vi.clearAllMocks()
}
