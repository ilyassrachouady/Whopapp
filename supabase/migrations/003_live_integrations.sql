alter table checkout_sessions drop constraint checkout_sessions_mode_check;
alter table checkout_sessions add constraint checkout_sessions_mode_check check(mode in ('mock','sandbox','live'));
-- Replays may never reassign an existing payment ID to a different checkout.
create or replace function record_payment(session_id uuid,payment_id text,collected bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s checkout_sessions; total bigint; duplicate boolean;
begin
 select * into strict s from checkout_sessions where id=session_id for update;
 if collected<=0 then raise exception 'Invalid amount'; end if;
 if exists(select 1 from payments where whop_payment_id=payment_id and checkout_session_id<>session_id) then raise exception 'Payment belongs to a different checkout'; end if;
 duplicate := exists(select 1 from payments where whop_payment_id=payment_id);
 insert into payments(checkout_session_id,whop_payment_id,amount_collected,contract_value,is_pif,paid_at)
 values(session_id,payment_id,collected,s.contract_value,s.payment_type='pif' and collected=s.contract_value,now()) on conflict(whop_payment_id) do nothing;
 select coalesce(sum(amount_collected),0) into total from payments where checkout_session_id=session_id and payment_status='succeeded';
 update checkout_sessions set status=case when total>=contract_value then 'paid' else 'partially_paid' end where id=session_id;
 return jsonb_build_object('cash_collected',total,'contract_value',s.contract_value,'duplicate',duplicate);
end $$;
revoke all on function record_payment(uuid,text,bigint) from public,anon,authenticated;
grant execute on function record_payment(uuid,text,bigint) to service_role;
