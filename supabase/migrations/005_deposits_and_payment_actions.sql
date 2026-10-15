-- Run in the Payment Desk schema after migrations 001-004. Never expose these tables to browser clients.
alter table checkout_sessions add column checkout_type text not null default 'sale' check (checkout_type in ('sale','deposit'));
alter table checkout_sessions add column deposit_amount bigint;
alter table checkout_sessions add column follow_up_at timestamptz;
alter table checkout_sessions add column follow_up_date date;
alter table checkout_sessions add column follow_up_time time;
alter table checkout_sessions add column time_zone text;
alter table checkout_sessions add column installment_count integer;
update checkout_sessions set installment_count=payment_count;
alter table checkout_sessions alter column installment_count set not null;
alter table checkout_sessions alter column offer_id drop not null;
alter table checkout_sessions alter column contract_value drop not null;
alter table checkout_sessions alter column payment_type drop not null;
alter table checkout_sessions alter column plan drop not null;
do $$
declare constraint_row record;
begin
 for constraint_row in select conname from pg_constraint where conrelid='checkout_sessions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%amount_due_today%' and pg_get_constraintdef(oid) like '%contract_value%'
 loop execute format('alter table checkout_sessions drop constraint %I',constraint_row.conname); end loop;
end $$;
alter table checkout_sessions add constraint positive_checkout_amount check (amount_due_today>0);
alter table checkout_sessions drop constraint checkout_sessions_status_check;
alter table checkout_sessions add constraint checkout_status check (status in ('created','pending_payment','paid','partially_paid','failed'));
alter table checkout_sessions add constraint checkout_kind_consistency check (
 (checkout_type='sale' and offer_id is not null and contract_value is not null and contract_value>0 and payment_type is not null and plan is not null and deposit_amount is null and amount_due_today<=contract_value) or
 (checkout_type='deposit' and offer_id is null and contract_value is null and payment_type is null and plan is null and deposit_amount is not null and deposit_amount=amount_due_today and payment_count=1 and installment_count=1 and follow_up_at is not null and follow_up_date is not null and follow_up_time is not null and time_zone is not null)
);
alter table checkout_sessions add constraint installment_count_consistency check (installment_count=payment_count);
alter table payments alter column contract_value drop not null;
alter table payments add column payment_type text;
alter table payments add column is_deposit boolean not null default false;
alter table payments add column status text not null default 'succeeded' check(status='succeeded');
update payments p set payment_type=s.payment_type from checkout_sessions s where s.id=p.checkout_session_id;

alter table call_records drop constraint attendance_outcome_consistency;
alter table call_records add constraint attendance_outcome_consistency check (
 (attendance='attended' and outcome is not null and outcome in ('sold','deposit','follow_up','no_sale','unqualified')) or
 (attendance<>'attended' and outcome is null)
);
alter table call_records add column deposit_amount bigint;
alter table call_records add constraint deposit_call_details check (outcome is distinct from 'deposit' or (checkout_session_id is not null and deposit_amount is not null and deposit_amount>0 and follow_up_at is not null and follow_up_date is not null and follow_up_time is not null and time_zone is not null));
-- The existing call_records table remains the single call-report source of truth.

create table payment_actions (
 action_key text primary key, checkout_session_id uuid not null references checkout_sessions(id),
 whop_payment_id text not null references payments(whop_payment_id),
 status text not null check(status in ('running','completed','failed')),
 claim_token uuid not null, lease_until timestamptz, result jsonb,
 created_at timestamptz not null default now()
);
alter table payment_actions enable row level security;
create index payment_actions_retry on payment_actions(status,lease_until) where status<>'completed';

-- Dynamic search_path = this function's schema, so isolated payment_desk installs
-- cannot accidentally read another project's public checkout/payment tables.
drop function record_payment(uuid,text,bigint);
create function record_payment(session_id uuid,payment_id text,collected bigint,payment_paid_at timestamptz) returns jsonb
language plpgsql security definer set search_path from current as $$
declare s checkout_sessions; previous_payment payments; total bigint; payment_count_so_far integer; maximum bigint; duplicate boolean; expected boolean;
begin
 select * into strict s from checkout_sessions where id=session_id for update;
 if collected<=0 or payment_paid_at is null then raise exception 'Invalid payment'; end if;
 select * into previous_payment from payments where whop_payment_id=payment_id;
 duplicate:=found;
 if duplicate and (previous_payment.checkout_session_id<>session_id or previous_payment.amount_collected<>collected) then raise exception 'Mismatched payment replay'; end if;
 if s.checkout_type='deposit' then
  maximum:=s.deposit_amount; expected:=collected=s.deposit_amount;
 else
  maximum:=s.contract_value;
  select exists(select 1 from jsonb_array_elements_text(s.plan->'installments') n where n::bigint=collected) into expected;
 end if;
 if not expected then raise exception 'Payment does not match checkout'; end if;
 select coalesce(sum(amount_collected),0),count(*) into total,payment_count_so_far from payments where checkout_session_id=session_id and payment_status='succeeded';
 if not duplicate then
  if total+collected>maximum or payment_count_so_far>=s.installment_count then raise exception 'Payment exceeds agreed schedule'; end if;
  insert into payments(checkout_session_id,whop_payment_id,amount_collected,contract_value,payment_type,is_pif,is_deposit,paid_at)
   values(session_id,payment_id,collected,s.contract_value,s.payment_type,s.checkout_type='sale' and s.payment_type='pif' and collected=s.contract_value,s.checkout_type='deposit',payment_paid_at);
  total:=total+collected;
 end if;
 update checkout_sessions set status=case when total>=maximum then 'paid' else 'partially_paid' end where id=session_id;
 return jsonb_build_object('cash_collected',total,'contract_value',s.contract_value,'duplicate',duplicate);
end $$;

create function claim_payment_action(action_key text,session_id uuid,payment_id text,claim_token uuid) returns jsonb
language plpgsql security definer set search_path from current as $$
declare a payment_actions;
begin
 insert into payment_actions(action_key,checkout_session_id,whop_payment_id,status,claim_token,lease_until)
  values($1,$2,$3,'running',$4,now()+interval '5 minutes') on conflict do nothing;
 select * into strict a from payment_actions p where p.action_key=$1 for update;
 if a.checkout_session_id<>$2 then raise exception 'Action belongs to another checkout'; end if;
 if a.status='completed' then return jsonb_build_object('completed',true,'claimed',false,'result',a.result); end if;
 if a.claim_token=$4 or a.status='failed' or a.lease_until<now() then
  update payment_actions p set status='running',claim_token=$4,lease_until=now()+interval '5 minutes' where p.action_key=$1;
  return jsonb_build_object('claimed',true,'completed',false);
 end if;
 return jsonb_build_object('claimed',false,'completed',false);
end $$;
revoke all on function record_payment(uuid,text,bigint,timestamptz),claim_payment_action(text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function record_payment(uuid,text,bigint,timestamptz),claim_payment_action(text,uuid,text,uuid) to service_role;
grant select,insert,update on payment_actions to service_role;
