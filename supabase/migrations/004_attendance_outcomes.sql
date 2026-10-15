-- Prepared for the private app; the public demo stays entirely in mock mode.
-- Run with the Payment Desk schema selected. Preserve existing no-show reports.
do $$
declare constraint_row record;
begin
  for constraint_row in select conname from pg_constraint
    where conrelid = 'call_records'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%call_outcome%'
  loop execute format('alter table call_records drop constraint %I', constraint_row.conname); end loop;
end $$;
alter table call_records rename column call_outcome to outcome;
alter table call_records alter column outcome drop not null;
alter table call_records add column attendance text;
alter table call_records rename column reschedule_needed to follow_up_required;
alter table call_records add column cancellation_reason text;
update call_records set attendance = case when outcome = 'no_show' then 'no_show' else 'attended' end;
update call_records set outcome = null where attendance = 'no_show';
alter table call_records alter column attendance set not null;
alter table call_records add constraint attendance_values check (attendance in ('attended','no_show','cancelled','rescheduled'));
alter table call_records add constraint attendance_outcome_consistency check (
  (attendance = 'attended' and outcome is not null and outcome in ('sold','follow_up','no_sale','unqualified')) or
  (attendance <> 'attended' and outcome is null)
);
alter table call_records add constraint sold_details check (outcome is distinct from 'sold' or (checkout_session_id is not null and offer_id is not null and contract_value > 0 and amount_due_today > 0));
alter table call_records add constraint loss_details check (outcome is null or outcome not in ('no_sale','unqualified') or loss_reason is not null);
alter table call_records add constraint cancellation_details check (attendance <> 'cancelled' or (cancellation_reason is not null and cancellation_reason in ('Prospect cancelled','Closer cancelled','Not ready','Other')));
alter table call_records add constraint attendance_follow_up check (attendance not in ('no_show','cancelled') or follow_up_required is not null);
alter table call_records add constraint schedule_details check (
  not (outcome is not distinct from 'follow_up' or attendance = 'rescheduled' or (attendance in ('no_show','cancelled') and follow_up_required)) or
  (follow_up_at is not null and follow_up_date is not null and follow_up_time is not null and time_zone is not null)
);
