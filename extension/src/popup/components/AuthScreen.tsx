import React, { useState } from 'react'
import { signIn, signUp } from '@/lib/supabase'

interface Props {
  onAuthSuccess: () => void
}

export function AuthScreen({ onAuthSuccess }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result =
        mode === 'signin'
          ? await signIn(email, password)
          : await signUp(email, password)

      if (result.error) {
        setError(result.error.message)
        return
      }

      if (mode === 'signup') {
        setError('Check your email to confirm your account, then sign in.')
        setMode('signin')
        return
      }

      onAuthSuccess()
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="header" style={{ margin: '-24px -20px 24px', padding: '24px 20px' }}>
        <h1 className="header-title">Subscribe Any</h1>
        <p className="header-subtitle">Never run out of essentials again</p>
      </div>

      <h2 className="auth-title">
        {mode === 'signin' ? 'Welcome back!' : 'Create an account'}
      </h2>
      <p className="auth-subtitle">
        {mode === 'signin'
          ? 'Sign in to access your subscriptions'
          : 'Sign up to start tracking your recurring purchases'}
      </p>

      {error && (
        <div
          style={{
            padding: '12px',
            background: '#ffebee',
            color: '#d32f2f',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '14px'
          }}
        >
          {error}
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            type="email"
            className="form-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            type="password"
            className="form-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ width: '100%' }}
        >
          {loading
            ? 'Please wait...'
            : mode === 'signin'
            ? 'Sign In'
            : 'Create Account'}
        </button>
      </form>

      <p className="auth-switch">
        {mode === 'signin' ? (
          <>
            Don't have an account?{' '}
            <a onClick={() => setMode('signup')}>Sign up</a>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <a onClick={() => setMode('signin')}>Sign in</a>
          </>
        )}
      </p>
    </div>
  )
}
