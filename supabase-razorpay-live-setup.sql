-- MAINSTREAM™ Razorpay live checkout migration
-- Run once in Supabase SQL Editor before deploying the payment functions.

alter table public.orders
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists shipping_address text,
  add column if not exists shipping_city text,
  add column if not exists shipping_pincode text,
  add column if not exists shipping_state text,
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists paid_at timestamptz;

create unique index if not exists orders_razorpay_order_id_uidx
  on public.orders (razorpay_order_id)
  where razorpay_order_id is not null;

create unique index if not exists orders_razorpay_payment_id_uidx
  on public.orders (razorpay_payment_id)
  where razorpay_payment_id is not null;

alter table public.orders
  alter column payment_status set default 'created',
  alter column order_status set default 'pending_payment';

-- Browser clients must not create unpaid/demo orders directly.
drop policy if exists "Public can create unpaid demo orders" on public.orders;
revoke insert on public.orders from anon, authenticated;
