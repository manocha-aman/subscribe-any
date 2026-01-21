import { supabase } from './supabase'
import type { Subscription, CreateSubscriptionInput, UpdateSubscriptionInput } from '@/types'

/**
 * Calculate the next reminder date based on last order date and frequency
 */
export function calculateNextReminderDate(
  lastOrderedAt: string | null,
  frequencyDays: number
): string {
  const baseDate = lastOrderedAt ? new Date(lastOrderedAt) : new Date()
  const nextDate = new Date(baseDate)
  nextDate.setDate(nextDate.getDate() + frequencyDays)
  return nextDate.toISOString()
}

/**
 * Get the current user ID from Supabase auth
 */
async function getCurrentUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    console.error('Error getting current user:', error)
    return null
  }
  return data.user.id
}

/**
 * Create a new subscription
 */
export async function createSubscription(
  input: CreateSubscriptionInput
): Promise<Subscription | null> {
  const userId = await getCurrentUserId()
  if (!userId) {
    console.error('No authenticated user')
    return null
  }

  const nextReminderAt = calculateNextReminderDate(null, input.frequency_days)

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      product_name: input.product_name,
      product_url: input.product_url || null,
      retailer: input.retailer,
      price: input.price || null,
      frequency_days: input.frequency_days,
      last_ordered_at: new Date().toISOString(),
      next_reminder_at: nextReminderAt
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating subscription:', error)
    return null
  }

  return data as Subscription
}

/**
 * Update an existing subscription
 */
export async function updateSubscription(
  id: string,
  updates: UpdateSubscriptionInput
): Promise<Subscription | null> {
  // If frequency is being updated, recalculate next reminder
  const updateData: Record<string, unknown> = { ...updates }

  if (updates.frequency_days !== undefined) {
    // Fetch current subscription to get last_ordered_at
    const { data: current } = await supabase
      .from('subscriptions')
      .select('last_ordered_at')
      .eq('id', id)
      .single()

    if (current) {
      updateData.next_reminder_at = calculateNextReminderDate(
        (current as { last_ordered_at: string | null }).last_ordered_at,
        updates.frequency_days
      )
    }
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating subscription:', error)
    return null
  }

  return data as Subscription
}

/**
 * Delete a subscription
 */
export async function deleteSubscription(id: string): Promise<boolean> {
  const { error } = await supabase.from('subscriptions').delete().eq('id', id)

  if (error) {
    console.error('Error deleting subscription:', error)
    return false
  }

  return true
}

/**
 * Get all subscriptions for the current user
 */
export async function getSubscriptions(): Promise<Subscription[]> {
  const userId = await getCurrentUserId()
  if (!userId) {
    return []
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('next_reminder_at', { ascending: true })

  if (error) {
    console.error('Error fetching subscriptions:', error)
    return []
  }

  return (data || []) as Subscription[]
}

/**
 * Get a single subscription by ID
 */
export async function getSubscription(id: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching subscription:', error)
    return null
  }

  return data as Subscription
}

/**
 * Mark a subscription as ordered (resets the reminder cycle)
 */
export async function markAsOrdered(id: string): Promise<Subscription | null> {
  // First get the current subscription
  const current = await getSubscription(id)
  if (!current) {
    return null
  }

  const now = new Date().toISOString()
  const nextReminderAt = calculateNextReminderDate(now, current.frequency_days)

  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      last_ordered_at: now,
      next_reminder_at: nextReminderAt
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error marking as ordered:', error)
    return null
  }

  return data as Subscription
}

/**
 * Snooze a reminder by adding days to the next reminder date
 */
export async function snoozeReminder(
  id: string,
  days: number
): Promise<Subscription | null> {
  // Get current subscription
  const current = await getSubscription(id)
  if (!current) {
    return null
  }

  // Calculate new reminder date
  const currentReminder = current.next_reminder_at
    ? new Date(current.next_reminder_at)
    : new Date()
  currentReminder.setDate(currentReminder.getDate() + days)

  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      next_reminder_at: currentReminder.toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error snoozing reminder:', error)
    return null
  }

  return data as Subscription
}

/**
 * Get subscriptions that are due for reminder
 */
export async function getDueSubscriptions(): Promise<Subscription[]> {
  const userId = await getCurrentUserId()
  if (!userId) {
    return []
  }

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .lte('next_reminder_at', now)
    .order('next_reminder_at', { ascending: true })

  if (error) {
    console.error('Error fetching due subscriptions:', error)
    return []
  }

  return (data || []) as Subscription[]
}
