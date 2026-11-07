-- MAINSTREAM demo order storage
-- Run once in Supabase Dashboard > SQL Editor.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null default 'Guest Customer',
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0 check (total >= 0),
  payment_method text,
  payment_status text not null default 'unpaid_demo',
  order_status text not null default 'pending_payment',
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

drop policy if exists "Public can create unpaid demo orders" on public.orders;
create policy "Public can create unpaid demo orders"
on public.orders for insert
to anon, authenticated
with check (
  payment_status = 'unpaid_demo'
  and order_status = 'pending_payment'
  and total >= 0
);

drop policy if exists "Authenticated admins can read orders" on public.orders;
create policy "Authenticated admins can read orders"
on public.orders for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "Authenticated admins can delete orders" on public.orders;
create policy "Authenticated admins can delete orders"
on public.orders for delete
to authenticated
using (auth.uid() is not null);

grant insert on public.orders to anon, authenticated;
grant select, delete on public.orders to authenticated;

create index if not exists orders_created_at_idx
on public.orders (created_at desc);
