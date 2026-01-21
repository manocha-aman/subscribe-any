import type { Subscription } from '@/types'

interface Props {
  subscription: Subscription
  onEdit: () => void
  onUpdate: () => void
}

export function SubscriptionCard({ subscription, onEdit, onUpdate }: Props) {
  const isDue = subscription.next_reminder_at
    ? new Date(subscription.next_reminder_at) <= new Date()
    : false

  const daysUntilReminder = subscription.next_reminder_at
    ? Math.ceil(
        (new Date(subscription.next_reminder_at).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    : null

  const getFrequencyLabel = (days: number): string => {
    if (days === 7) return 'Weekly'
    if (days === 14) return 'Bi-weekly'
    if (days === 30) return 'Monthly'
    if (days === 60) return 'Every 2 months'
    if (days === 90) return 'Quarterly'
    return `Every ${days} days`
  }

  const handleMarkAsOrdered = async () => {
    try {
      await chrome.runtime.sendMessage({
        type: 'MARK_AS_ORDERED',
        payload: { id: subscription.id }
      })
      onUpdate()
    } catch (error) {
      console.error('Error marking as ordered:', error)
    }
  }

  const handleSnooze = async (days: number) => {
    try {
      await chrome.runtime.sendMessage({
        type: 'SNOOZE_REMINDER',
        payload: { id: subscription.id, days }
      })
      onUpdate()
    } catch (error) {
      console.error('Error snoozing:', error)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this subscription?')) return

    try {
      await chrome.runtime.sendMessage({
        type: 'DELETE_SUBSCRIPTION',
        payload: { id: subscription.id }
      })
      onUpdate()
    } catch (error) {
      console.error('Error deleting:', error)
    }
  }

  const handleReorder = () => {
    if (subscription.product_url) {
      chrome.tabs.create({ url: subscription.product_url })
      handleMarkAsOrdered()
    }
  }

  return (
    <div className="subscription-card">
      <div className="subscription-header">
        <div>
          <h3 className="subscription-name">{subscription.product_name}</h3>
          <span className="subscription-retailer">{subscription.retailer}</span>
        </div>
        <button className="btn btn-secondary" onClick={onEdit}>
          Edit
        </button>
      </div>

      <div className="subscription-meta">
        {subscription.price && (
          <span className="subscription-price">
            ${subscription.price.toFixed(2)}
          </span>
        )}
        <span className="subscription-frequency">
          {getFrequencyLabel(subscription.frequency_days)}
        </span>
      </div>

      {daysUntilReminder !== null && (
        <div className={`subscription-reminder ${isDue ? 'due' : ''}`}>
          {isDue
            ? 'Due for reorder!'
            : daysUntilReminder === 0
            ? 'Reminder today'
            : daysUntilReminder === 1
            ? 'Reminder tomorrow'
            : `Reminder in ${daysUntilReminder} days`}
        </div>
      )}

      <div className="subscription-actions">
        {subscription.product_url && (
          <button className="btn btn-primary" onClick={handleReorder}>
            Reorder
          </button>
        )}
        {isDue && (
          <>
            <button className="btn btn-secondary" onClick={() => handleSnooze(1)}>
              Snooze 1d
            </button>
            <button className="btn btn-secondary" onClick={() => handleSnooze(7)}>
              Snooze 1w
            </button>
          </>
        )}
        <button className="btn btn-danger" onClick={handleDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}
