// Core subscription types
export interface Subscription {
  id: string
  user_id: string
  product_name: string
  product_url: string | null
  retailer: string
  price: number | null
  frequency_days: number
  last_ordered_at: string | null
  next_reminder_at: string | null
  created_at: string
}

export interface CreateSubscriptionInput {
  product_name: string
  product_url?: string | null
  retailer: string
  price?: number | null
  frequency_days: number
}

export interface UpdateSubscriptionInput {
  product_name?: string
  product_url?: string | null
  retailer?: string
  price?: number | null
  frequency_days?: number
  last_ordered_at?: string | null
  next_reminder_at?: string | null
}

// Reminder types
export interface Reminder {
  id: string
  subscription_id: string
  sent_at: string
  channel: 'email' | 'browser'
}

// LLM types
export interface OrderAnalysis {
  isOrderConfirmation: boolean
  confidence: number
  products: ProductInfo[]
  retailer: string | null
  orderNumber: string | null
}

export interface ProductInfo {
  name: string
  price: number | null
  quantity: number
  isRecurring: boolean
  category: string | null
  suggestedFrequencyDays: number | null  // LLM suggests based on category
}

export interface PageContent {
  htmlContent: string
  textContent: string
}

export interface LLMProvider {
  analyzeOrderPage(pageContent: string | PageContent): Promise<OrderAnalysis>
}

// Page detection types
export interface PageDetectionResult {
  isLikelyOrderConfirmation: boolean
  confidence: number
  triggers: string[]
}

// Message types for extension communication
export type MessageType =
  | 'ANALYZE_PAGE'
  | 'ORDER_DETECTED'
  | 'CREATE_SUBSCRIPTION'
  | 'GET_SUBSCRIPTIONS'
  | 'UPDATE_SUBSCRIPTION'
  | 'DELETE_SUBSCRIPTION'
  | 'MARK_AS_ORDERED'
  | 'SNOOZE_REMINDER'
  | 'CHECK_REMINDERS'

export interface ExtensionMessage<T = unknown> {
  type: MessageType
  payload?: T
}

export interface OrderDetectedPayload {
  analysis: OrderAnalysis
  pageUrl: string
  pageTitle: string
}

export interface CreateSubscriptionPayload {
  subscription: CreateSubscriptionInput
}

export interface UpdateSubscriptionPayload {
  id: string
  updates: UpdateSubscriptionInput
}

export interface DeleteSubscriptionPayload {
  id: string
}

export interface MarkAsOrderedPayload {
  id: string
}

export interface SnoozeReminderPayload {
  id: string
  days: number
}

// Frequency options
export const FREQUENCY_OPTIONS = [
  { label: 'Weekly', days: 7 },
  { label: 'Bi-weekly', days: 14 },
  { label: 'Monthly', days: 30 },
  { label: 'Every 2 months', days: 60 },
  { label: 'Quarterly', days: 90 }
] as const

export type FrequencyOption = (typeof FREQUENCY_OPTIONS)[number]
