-- AI Analyses tracking table for monitoring usage
create table if not exists public.ai_analyses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai', 'claude')),
  is_order_confirmation boolean not null,
  confidence decimal(3, 2) not null,
  product_count integer not null,
  created_at timestamp with time zone default now()
);

-- Create indexes
create index if not exists idx_ai_analyses_user_id on public.ai_analyses(user_id);
create index if not exists idx_ai_analyses_created_at on public.ai_analyses(created_at);

-- Enable RLS
alter table public.ai_analyses enable row level security;

-- Users can only see their own AI analyses
create policy "Users can view own ai_analyses"
  on public.ai_analyses for select
  using (auth.uid() = user_id);

-- Service role can insert AI analyses
create policy "Service can insert ai_analyses"
  on public.ai_analyses for insert
  with check (true);

grant usage on schema public to authenticated;
grant select on public.ai_analyses to authenticated;
