-- Apply in Supabase SQL Editor. Only the authenticated owner can access a document.
create table if not exists public.foodlab_states (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'version' = '1'),
 updated_at timestamptz not null default now()
);
alter table public.foodlab_states enable row level security;
revoke all on public.foodlab_states from anon;
grant select, insert, update, delete on public.foodlab_states to authenticated;
drop policy if exists "Owner reads" on public.foodlab_states;
create policy "Owner reads" on public.foodlab_states for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Owner inserts" on public.foodlab_states;
create policy "Owner inserts" on public.foodlab_states for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Owner updates" on public.foodlab_states;
create policy "Owner updates" on public.foodlab_states for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Owner deletes" on public.foodlab_states;
create policy "Owner deletes" on public.foodlab_states for delete to authenticated using ((select auth.uid()) = user_id);
