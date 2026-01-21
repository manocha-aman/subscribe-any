import React, { useState } from 'react'
import type { Subscription } from '@/types'
import { FREQUENCY_OPTIONS } from '@/types'

interface Props {
  subscription: Subscription
  onClose: () => void
  onSave: () => void
}

export function EditSubscriptionModal({ subscription, onClose, onSave }: Props) {
  const [productName, setProductName] = useState(subscription.product_name)
  const [productUrl, setProductUrl] = useState(subscription.product_url || '')
  const [price, setPrice] = useState(subscription.price?.toString() || '')
  const [frequencyDays, setFrequencyDays] = useState(subscription.frequency_days)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SUBSCRIPTION',
        payload: {
          id: subscription.id,
          updates: {
            product_name: productName,
            product_url: productUrl || null,
            price: price ? parseFloat(price) : null,
            frequency_days: frequencyDays
          }
        }
      })
      onSave()
    } catch (error) {
      console.error('Error updating subscription:', error)
      alert('Failed to update subscription')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Edit Subscription</h3>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Product Name</label>
              <input
                type="text"
                className="form-input"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Product URL (optional)</label>
              <input
                type="url"
                className="form-input"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">Price (optional)</label>
              <input
                type="number"
                className="form-input"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                step="0.01"
                min="0"
                placeholder="0.00"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Reminder Frequency</label>
              <select
                className="form-select"
                value={frequencyDays}
                onChange={(e) => setFrequencyDays(parseInt(e.target.value))}
              >
                {FREQUENCY_OPTIONS.map((option) => (
                  <option key={option.days} value={option.days}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
