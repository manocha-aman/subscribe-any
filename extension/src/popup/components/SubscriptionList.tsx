import { useState } from 'react'
import type { Subscription } from '@/types'
import { SubscriptionCard } from './SubscriptionCard'
import { EditSubscriptionModal } from './EditSubscriptionModal'

interface Props {
  subscriptions: Subscription[]
  onUpdate: () => void
}

export function SubscriptionList({ subscriptions, onUpdate }: Props) {
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null)

  if (subscriptions.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📦</div>
        <h3 className="empty-state-title">No subscriptions yet</h3>
        <p className="empty-state-text">
          Visit an e-commerce site and complete a purchase.
          We'll detect it and offer to create a subscription reminder!
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="subscription-list">
        {subscriptions.map((subscription) => (
          <SubscriptionCard
            key={subscription.id}
            subscription={subscription}
            onEdit={() => setEditingSubscription(subscription)}
            onUpdate={onUpdate}
          />
        ))}
      </div>

      {editingSubscription && (
        <EditSubscriptionModal
          subscription={editingSubscription}
          onClose={() => setEditingSubscription(null)}
          onSave={() => {
            setEditingSubscription(null)
            onUpdate()
          }}
        />
      )}
    </>
  )
}
