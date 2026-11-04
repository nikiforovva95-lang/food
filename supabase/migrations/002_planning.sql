-- Additive migration. Version 1 remains readable; downgrade writes are rejected.
alter table public.foodlab_states drop constraint if exists foodlab_states_payload_check;
alter table public.foodlab_states add constraint foodlab_states_payload_check check (jsonb_typeof(payload)='object' and payload->>'version' in ('1','2'));
alter table public.foodlab_states add column if not exists revision bigint not null default 1;
create or replace function public.foodlab_guard_state() returns trigger language plpgsql set search_path='' as $$
begin
 if (old.payload->>'version')::int > (new.payload->>'version')::int then
  raise exception 'This application version cannot overwrite a newer data format';
 end if;
 new.revision := old.revision + 1;
 new.updated_at := now();
 return new;
end $$;
drop trigger if exists foodlab_guard_state on public.foodlab_states;
create trigger foodlab_guard_state before update on public.foodlab_states for each row execute function public.foodlab_guard_state();
create table if not exists public.foodlab_ai_usage(user_id uuid references auth.users(id) on delete cascade,day date not null default current_date,requests int not null default 1,primary key(user_id,day));
alter table public.foodlab_ai_usage enable row level security;
revoke all on public.foodlab_ai_usage from anon,authenticated;
create or replace function public.foodlab_reserve_ai_request() returns boolean language plpgsql security definer set search_path='' as $$
declare amount int;
begin
 if auth.uid() is null then return false; end if;
 insert into public.foodlab_ai_usage(user_id,day,requests) values(auth.uid(),current_date,1)
 on conflict(user_id,day) do update set requests=public.foodlab_ai_usage.requests+1 where public.foodlab_ai_usage.requests<10 returning requests into amount;
 return amount is not null;
end $$;
revoke all on function public.foodlab_reserve_ai_request() from public,anon;
grant execute on function public.foodlab_reserve_ai_request() to authenticated;
