import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Environment variables - these will be replaced at build time
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Create Supabase client
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: {
      getItem: async (key: string) => {
        const result = await chrome.storage.local.get(key)
        return result[key] || null
      },
      setItem: async (key: string, value: string) => {
        await chrome.storage.local.set({ [key]: value })
      },
      removeItem: async (key: string) => {
        await chrome.storage.local.remove(key)
      }
    }
  }
})

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    console.error('Sign in error:', error)
    return { user: null, error }
  }

  return { user: data.user, error: null }
}

/**
 * Sign up with email and password
 */
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  })

  if (error) {
    console.error('Sign up error:', error)
    return { user: null, error }
  }

  return { user: data.user, error: null }
}

/**
 * Sign out the current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('Sign out error:', error)
    return { error }
  }

  return { error: null }
}

/**
 * Get the current authenticated user
 */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    return { user: null, error }
  }

  return { user: data.user, error: null }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const { user } = await getCurrentUser()
  return user !== null
}

/**
 * Listen for auth state changes
 */
export function onAuthStateChange(callback: (user: unknown) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null)
  })
}
