-- Subscribe Any - Initial Database Schema

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Subscriptions table
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_name text not null,
  product_url text,
  retailer text not null,
  price decimal(10, 2),
  frequency_days integer not null default 30,
  last_ordered_at timestamp with time zone,
  next_reminder_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- Reminders history table
create table if not exists public.reminders (
  id uuid primary key default uuid_generate_v4(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  sent_at timestamp with time zone default now(),
  channel text not null check (channel in ('email', 'browser'))
);

-- Create indexes for common queries
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_next_reminder on public.subscriptions(next_reminder_at);
create index if not exists idx_reminders_subscription_id on public.reminders(subscription_id);
create index if not exists idx_reminders_sent_at on public.reminders(sent_at);

-- Enable Row Level Security
alter table public.subscriptions enable row level security;
alter table public.reminders enable row level security;

-- RLS Policies for subscriptions
-- Users can only see their own subscriptions
create policy "Users can view own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Users can insert their own subscriptions
create policy "Users can create own subscriptions"
  on public.subscriptions for insert
  with check (auth.uid() = user_id);

-- Users can update their own subscriptions
create policy "Users can update own subscriptions"
  on public.subscriptions for update
  using (auth.uid() = user_id);

-- Users can delete their own subscriptions
create policy "Users can delete own subscriptions"
  on public.subscriptions for delete
  using (auth.uid() = user_id);

-- RLS Policies for reminders
-- Users can only see reminders for their subscriptions
create policy "Users can view own reminders"
  on public.reminders for select
  using (
    exists (
      select 1 from public.subscriptions
      where subscriptions.id = reminders.subscription_id
      and subscriptions.user_id = auth.uid()
    )
  );

-- Users can insert reminders for their subscriptions
create policy "Users can create own reminders"
  on public.reminders for insert
  with check (
    exists (
      select 1 from public.subscriptions
      where subscriptions.id = reminders.subscription_id
      and subscriptions.user_id = auth.uid()
    )
  );

-- Function to get subscriptions due for reminder
create or replace function get_due_subscriptions()
returns setof subscriptions
language sql
security definer
as $$
  select *
  from subscriptions
  where next_reminder_at <= now()
  order by next_reminder_at;
$$;

-- Grant access to authenticated users
grant usage on schema public to authenticated;
grant all on public.subscriptions to authenticated;
grant all on public.reminders to authenticated;
grant execute on function get_due_subscriptions to authenticated;
