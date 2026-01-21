import { vi } from 'vitest'

// Mock Chrome APIs
const mockChrome = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined)
    },
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined)
    }
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onMessage: {
      addListener: vi.fn()
    },
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`)
  },
  notifications: {
    create: vi.fn((id: string, _options: unknown, callback?: (id: string) => void) => {
      if (callback) callback(id)
      return id
    }),
    clear: vi.fn((_id: string, callback?: (wasCleared: boolean) => void) => {
      if (callback) callback(true)
      return true
    }),
    update: vi.fn((_id: string, _options: unknown, callback?: (wasUpdated: boolean) => void) => {
      if (callback) callback(true)
      return true
    }),
    onClicked: {
      addListener: vi.fn()
    },
    onButtonClicked: {
      addListener: vi.fn()
    },
    onClosed: {
      addListener: vi.fn()
    }
  },
  alarms: {
    create: vi.fn(),
    get: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(true),
    clearAll: vi.fn().mockResolvedValue(true),
    onAlarm: {
      addListener: vi.fn()
    }
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({})
  }
}

// @ts-expect-error - Mocking chrome global
globalThis.chrome = mockChrome

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})
