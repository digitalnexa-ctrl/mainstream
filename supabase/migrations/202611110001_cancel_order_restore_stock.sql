-- MAINSTREAM: cancel orders and restore inventory exactly once.
-- This keeps the order record for audit. It does not issue a Razorpay refund.

alter table public.orders
  add column if not exists stock_restored_at timestamptz;

create or replace function public.cancel_mainstream_order(p_order_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_paid boolean;
  v_restored boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to cancel an order.';
  end if;

  select *
    into v_order
    from public.orders
   where order_number = p_order_number
   for update;

  if not found then
    raise exception 'Order % was not found.', p_order_number;
  end if;

  if lower(coalesce(v_order.order_status, '')) = 'cancelled' then
    return jsonb_build_object(
      'order_number', p_order_number,
      'cancelled', true,
      'stock_restored', v_order.stock_restored_at is not null,
      'already_cancelled', true
    );
  end if;

  if lower(coalesce(v_order.order_status, '')) in ('shipped', 'delivered') then
    raise exception 'Shipped or delivered orders cannot be cancelled from this screen.';
  end if;

  v_paid := lower(coalesce(v_order.payment_status, '')) in ('paid', 'captured');

  if v_paid then
    if v_order.stock_deducted_at is null then
      raise exception 'This paid order has no stock deduction record. Contact support before cancelling.';
    end if;

    if v_order.stock_restored_at is null then
      for v_item in
        select
          item->>'slug' as slug,
          sum((item->>'quantity')::integer)::integer as quantity
        from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as item
        group by item->>'slug'
      loop
        if v_item.slug is null or v_item.slug = '' or v_item.quantity is null or v_item.quantity < 1 then
          raise exception 'Order contains invalid product inventory details.';
        end if;

        update public.products
           set stock = stock + v_item.quantity
         where slug = v_item.slug;

        if not found then
          raise exception 'Product % was not found; stock was not restored.', v_item.slug;
        end if;
      end loop;

      update public.orders
         set stock_restored_at = now(),
             order_status = 'cancelled'
       where id = v_order.id;

      v_restored := true;
    else
      update public.orders
         set order_status = 'cancelled'
       where id = v_order.id;
    end if;
  else
    update public.orders
       set order_status = 'cancelled'
     where id = v_order.id;
  end if;

  return jsonb_build_object(
    'order_number', p_order_number,
    'cancelled', true,
    'stock_restored', v_restored,
    'already_cancelled', false
  );
end;
$$;

revoke all on function public.cancel_mainstream_order(text) from public;
grant execute on function public.cancel_mainstream_order(text) to authenticated;
