// Supabase Edge Function for sending email reminders
// This function is triggered by a cron job (daily)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// Email service configuration (using Resend)
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface Subscription {
  id: string
  user_id: string
  product_name: string
  product_url: string | null
  retailer: string
  price: number | null
  frequency_days: number
  next_reminder_at: string
}

interface UserProfile {
  email: string
}

serve(async (req) => {
  try {
    // Verify this is a cron trigger or authorized request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader && req.method !== 'POST') {
      return new Response('Unauthorized', { status: 401 })
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get all subscriptions due for reminder today
    const now = new Date().toISOString()
    const { data: dueSubscriptions, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*, auth.users!inner(email)')
      .lte('next_reminder_at', now)

    if (fetchError) {
      console.error('Error fetching due subscriptions:', fetchError)
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!dueSubscriptions || dueSubscriptions.length === 0) {
      console.log('No subscriptions due for reminder')
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`Found ${dueSubscriptions.length} subscriptions due for reminder`)

    // Group subscriptions by user for batch emails
    const userSubscriptions = new Map<string, { email: string; subscriptions: Subscription[] }>()

    for (const sub of dueSubscriptions) {
      const userId = sub.user_id
      const userEmail = (sub as any).auth?.users?.email

      if (!userEmail) continue

      if (!userSubscriptions.has(userId)) {
        userSubscriptions.set(userId, { email: userEmail, subscriptions: [] })
      }
      userSubscriptions.get(userId)!.subscriptions.push(sub)
    }

    // Send emails
    let sentCount = 0
    const errors: string[] = []

    for (const [userId, { email, subscriptions }] of userSubscriptions) {
      try {
        await sendReminderEmail(email, subscriptions)

        // Record reminders in database
        for (const sub of subscriptions) {
          await supabase.from('reminders').insert({
            subscription_id: sub.id,
            channel: 'email'
          })
        }

        sentCount++
      } catch (err) {
        console.error(`Error sending email to ${email}:`, err)
        errors.push(`${email}: ${err.message}`)
      }
    }

    return new Response(
      JSON.stringify({
        sent: sentCount,
        total: userSubscriptions.size,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

async function sendReminderEmail(email: string, subscriptions: Subscription[]): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY not configured, skipping email')
    return
  }

  const productList = subscriptions
    .map((s) => {
      let line = `- ${s.product_name} from ${s.retailer}`
      if (s.price) line += ` ($${s.price.toFixed(2)})`
      return line
    })
    .join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #4CAF50, #2E7D32); padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Time to Reorder!</h1>
      </div>

      <div style="padding: 32px; background: #f9f9f9;">
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          The following items are due for reorder:
        </p>

        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
          ${subscriptions
            .map(
              (s) => `
            <div style="padding: 12px 0; border-bottom: 1px solid #eee;">
              <div style="font-weight: 600; color: #333;">${escapeHtml(s.product_name)}</div>
              <div style="color: #666; font-size: 14px;">
                ${escapeHtml(s.retailer)}
                ${s.price ? ` • $${s.price.toFixed(2)}` : ''}
              </div>
              ${
                s.product_url
                  ? `<a href="${escapeHtml(s.product_url)}" style="color: #4CAF50; font-size: 14px;">Reorder now →</a>`
                  : ''
              }
            </div>
          `
            )
            .join('')}
        </div>

        <p style="color: #666; font-size: 14px;">
          Open the Subscribe Any extension to manage your subscriptions or snooze these reminders.
        </p>
      </div>

      <div style="padding: 20px; text-align: center; color: #999; font-size: 12px;">
        Sent by Subscribe Any • <a href="#" style="color: #999;">Unsubscribe</a>
      </div>
    </div>
  `

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Subscribe Any <reminders@subscribeany.com>',
      to: [email],
      subject: `Reorder Reminder: ${subscriptions.length} item${subscriptions.length > 1 ? 's' : ''} due`,
      html
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Resend API error: ${error}`)
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
