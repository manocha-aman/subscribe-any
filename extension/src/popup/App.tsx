import { useState, useEffect } from 'react'
import { SubscriptionList } from './components/SubscriptionList'
import { Settings } from './components/Settings'
import { AuthScreen } from './components/AuthScreen'
import { getCurrentUser, onAuthStateChange } from '@/lib/supabase'
import type { Subscription } from '@/types'

type Tab = 'subscriptions' | 'settings'

export default function App() {
  const [user, setUser] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('subscriptions')
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])

  useEffect(() => {
    // Check initial auth state
    getCurrentUser().then(({ user }) => {
      setUser(user)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = onAuthStateChange((user) => {
      setUser(user)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadSubscriptions()
    }
  }, [user])

  const loadSubscriptions = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SUBSCRIPTIONS'
      })
      setSubscriptions(response.subscriptions || [])
    } catch (error) {
      console.error('Error loading subscriptions:', error)
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    )
  }

  if (!user) {
    return <AuthScreen onAuthSuccess={() => {}} />
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="header-title">Subscribe Any</h1>
        <p className="header-subtitle">Your subscription reminders</p>
      </header>

      <nav className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'subscriptions' ? 'active' : ''}`}
          onClick={() => setActiveTab('subscriptions')}
        >
          Subscriptions
        </button>
        <button
          className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </nav>

      <main className="content">
        {activeTab === 'subscriptions' ? (
          <SubscriptionList
            subscriptions={subscriptions}
            onUpdate={loadSubscriptions}
          />
        ) : (
          <Settings />
        )}
      </main>
    </div>
  )
}
