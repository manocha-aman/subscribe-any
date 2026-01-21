import { useState, useEffect } from 'react'
import { signOut, getCurrentUser } from '@/lib/supabase'

interface Settings {
  emailReminders: boolean
  showOnOrderDetails: boolean
}

export function Settings() {
  const [settings, setSettings] = useState<Settings>({
    emailReminders: false,
    showOnOrderDetails: true
  })
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
    loadUser()
  }, [])

  const loadSettings = async () => {
    const result = await chrome.storage.sync.get(['emailReminders', 'showOnOrderDetails'])
    setSettings({
      emailReminders: result.emailReminders || false,
      showOnOrderDetails: result.showOnOrderDetails !== false // default to true
    })
  }

  const loadUser = async () => {
    const { user } = await getCurrentUser()
    setUserEmail((user as { email?: string })?.email || null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await chrome.storage.sync.set(settings)
      alert('Settings saved!')
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    if (!confirm('Sign out?')) return
    await signOut()
    window.location.reload()
  }

  return (
    <div className="settings">
      <div className="settings-section">
        <h3 className="settings-title">Account</h3>
        <p style={{ marginBottom: '12px', color: '#666' }}>
          Signed in as: {userEmail}
        </p>
        <button className="btn btn-secondary" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>

      <div className="settings-section">
        <h3 className="settings-title">Order Detection</h3>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.showOnOrderDetails}
            onChange={(e) =>
              setSettings({ ...settings, showOnOrderDetails: e.target.checked })
            }
          />
          <span style={{ fontSize: '14px' }}>
            Show subscription prompt on order details/history pages
          </span>
        </label>
        <p className="form-hint" style={{ marginTop: '8px' }}>
          Enable to see the subscription option when viewing past orders. Turn off to only see it on order confirmation pages.
        </p>
      </div>

      <div className="settings-section">
        <h3 className="settings-title">Notifications</h3>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.emailReminders}
            onChange={(e) =>
              setSettings({ ...settings, emailReminders: e.target.checked })
            }
          />
          <span style={{ fontSize: '14px' }}>
            Send email reminders (in addition to browser notifications)
          </span>
        </label>
        <p className="form-hint" style={{ marginTop: '8px' }}>
          Browser notifications are always enabled when reminders are due.
        </p>
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving}
        style={{ width: '100%' }}
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
