export interface Database {
  public: {
    Tables: {
      subscriptions: {
        Row: {
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
        Insert: {
          id?: string
          user_id: string
          product_name: string
          product_url?: string | null
          retailer: string
          price?: number | null
          frequency_days?: number
          last_ordered_at?: string | null
          next_reminder_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          product_name?: string
          product_url?: string | null
          retailer?: string
          price?: number | null
          frequency_days?: number
          last_ordered_at?: string | null
          next_reminder_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          id: string
          subscription_id: string
          sent_at: string
          channel: 'email' | 'browser'
        }
        Insert: {
          id?: string
          subscription_id: string
          sent_at?: string
          channel: 'email' | 'browser'
        }
        Update: {
          id?: string
          subscription_id?: string
          sent_at?: string
          channel?: 'email' | 'browser'
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
