-- Restore reserved inventory when an order is cancelled.
create or replace function public.restore_rugvaya_inventory_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.products p
       set stock = p.stock + oi.quantity
      from public.order_items oi
     where oi.order_id = new.id
       and oi.product_id = p.id;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_restore_inventory_on_cancel on public.orders;
create trigger orders_restore_inventory_on_cancel
after update of status on public.orders
for each row execute function public.restore_rugvaya_inventory_on_cancel();
