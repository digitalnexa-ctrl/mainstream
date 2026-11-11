-- MAINSTREAM: atomically mark a Razorpay order paid and deduct stock exactly once.
-- Run this migration in Supabase SQL Editor before deploying the updated Edge Functions.

alter table public.orders
  add column if not exists stock_deducted_at timestamptz;

create or replace function public.complete_razorpay_order(
  p_razorpay_order_id text,
  p_payment_id text,
  p_payment_method text default 'Razorpay'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_product_id uuid;
begin
  select *
    into v_order
    from public.orders
   where razorpay_order_id = p_razorpay_order_id
   for update;

  if not found then
    raise exception 'Matching MAINSTREAM order not found';
  end if;

  if v_order.stock_deducted_at is not null then
    return jsonb_build_object(
      'success', true,
      'already_processed', true,
      'order_id', v_order.id
    );
  end if;

  if jsonb_typeof(v_order.items) <> 'array' then
    raise exception 'Order items are invalid';
  end if;

  -- Aggregate duplicate product lines and process in stable order.
  for v_item in
    select lower(trim(item->>'slug')) as slug,
           sum((item->>'quantity')::integer)::integer as quantity
      from jsonb_array_elements(v_order.items) as item
     group by lower(trim(item->>'slug'))
     order by lower(trim(item->>'slug'))
  loop
    if v_item.slug is null or v_item.slug = '' or v_item.quantity is null or v_item.quantity < 1 then
      raise exception 'Invalid product or quantity in order';
    end if;

    update public.products
       set stock = stock - v_item.quantity,
           updated_at = now()
     where slug = v_item.slug
       and stock >= v_item.quantity
     returning id into v_product_id;

    if not found then
      raise exception 'Insufficient stock or product missing for slug %', v_item.slug;
    end if;
  end loop;

  update public.orders
     set payment_status = 'paid',
         order_status = 'processing',
         payment_method = coalesce(nullif(p_payment_method, ''), 'Razorpay'),
         razorpay_payment_id = p_payment_id,
         paid_at = coalesce(paid_at, now()),
         stock_deducted_at = now()
   where id = v_order.id;

  return jsonb_build_object(
    'success', true,
    'already_processed', false,
    'order_id', v_order.id
  );
end;
$$;

revoke all on function public.complete_razorpay_order(text, text, text) from public;
revoke all on function public.complete_razorpay_order(text, text, text) from anon, authenticated;
grant execute on function public.complete_razorpay_order(text, text, text) to service_role;
