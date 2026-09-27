-- Rumo · configuração do banco no Supabase (rode uma vez em: Supabase → SQL Editor → New query → Run)
-- Cria uma tabela com UMA linha por usuário contendo os dados do app (JSON),
-- protegida por RLS: cada pessoa só enxerga e altera a própria linha.

create table if not exists public.rumo_dados (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb       not null,
  rev        integer     not null default 1,   -- controle de versão para evitar que um aparelho sobrescreva o outro
  updated_at timestamptz not null default now()
);

alter table public.rumo_dados enable row level security;

drop policy if exists "rumo: ler os próprios dados" on public.rumo_dados;
drop policy if exists "rumo: criar os próprios dados" on public.rumo_dados;
drop policy if exists "rumo: alterar os próprios dados" on public.rumo_dados;
drop policy if exists "rumo: apagar os próprios dados" on public.rumo_dados;

create policy "rumo: ler os próprios dados" on public.rumo_dados
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "rumo: criar os próprios dados" on public.rumo_dados
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "rumo: alterar os próprios dados" on public.rumo_dados
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "rumo: apagar os próprios dados" on public.rumo_dados
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.rumo_dados from anon;

-- Consulta leve chamada 2x ao dia pelo GitHub Actions para registrar atividade no banco
-- (projetos gratuitos com pouca atividade no banco por 7 dias podem ser pausados).
-- Não expõe nenhum dado: sempre devolve 1.
create or replace function public.rumo_ping()
returns integer
language sql
security definer
set search_path = ''
as $$ select coalesce((select 1 from public.rumo_dados limit 1), 1) $$;

revoke all on function public.rumo_ping() from public;
grant execute on function public.rumo_ping() to anon, authenticated;
