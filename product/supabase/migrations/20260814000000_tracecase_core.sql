create extension if not exists vector with schema extensions;

create table if not exists public.tracecase_documents (
  row_key text primary key,
  entity_type text not null,
  id text not null,
  organization_id text not null,
  project_id text not null default '',
  run_id text,
  session_id text,
  email text,
  token_hash text,
  public_key_hash text,
  idempotency_key text,
  repository text,
  commit_sha text,
  content_hash text,
  status text,
  exact_identifiers text[] not null default '{}',
  due_at timestamptz,
  sort_at timestamptz not null default now(),
  content_text text,
  embedding extensions.vector(768),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracecase_entity_type_check check (entity_type in (
    'organization', 'user', 'invitation', 'project', 'report', 'case', 'run',
    'run_event', 'evidence_bundle', 'checkpoint', 'repository_chunk', 'artifact',
    'intake_draft', 'audit_event'
  ))
);

create index if not exists tracecase_documents_tenant_entity_sort
  on public.tracecase_documents (organization_id, project_id, entity_type, sort_at desc);
create index if not exists tracecase_documents_run_events
  on public.tracecase_documents (organization_id, project_id, run_id, sort_at)
  where entity_type = 'run_event';
create index if not exists tracecase_documents_exact_identifiers
  on public.tracecase_documents using gin (exact_identifiers);
create index if not exists tracecase_documents_content_fts
  on public.tracecase_documents using gin (to_tsvector('english', coalesce(content_text, '')));
create index if not exists tracecase_documents_repository_identity
  on public.tracecase_documents (organization_id, project_id, repository, commit_sha, content_hash)
  where entity_type = 'repository_chunk';
create unique index if not exists tracecase_documents_user_email
  on public.tracecase_documents (organization_id, lower(email))
  where entity_type = 'user';
create unique index if not exists tracecase_documents_invitation_token
  on public.tracecase_documents (token_hash)
  where entity_type = 'invitation';
create unique index if not exists tracecase_documents_widget_key
  on public.tracecase_documents (public_key_hash)
  where entity_type = 'project';
create unique index if not exists tracecase_documents_checkpoint_idempotency
  on public.tracecase_documents (organization_id, project_id, idempotency_key)
  where entity_type = 'checkpoint';

create table if not exists public.tracecase_leases (
  organization_id text not null,
  project_id text not null,
  lease_key text not null,
  owner text not null,
  expires_at timestamptz not null,
  primary key (organization_id, project_id, lease_key)
);

alter table public.tracecase_documents enable row level security;
alter table public.tracecase_leases enable row level security;
revoke all on public.tracecase_documents from anon, authenticated;
revoke all on public.tracecase_leases from anon, authenticated;
grant all on public.tracecase_documents to service_role;
grant all on public.tracecase_leases to service_role;

create or replace function public.tracecase_acquire_lease(
  p_organization_id text,
  p_project_id text,
  p_lease_key text,
  p_owner text,
  p_expires_at timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare acquired boolean;
begin
  insert into public.tracecase_leases (organization_id, project_id, lease_key, owner, expires_at)
  values (p_organization_id, p_project_id, p_lease_key, p_owner, p_expires_at)
  on conflict (organization_id, project_id, lease_key) do update
    set owner = excluded.owner, expires_at = excluded.expires_at
    where public.tracecase_leases.expires_at <= now()
       or public.tracecase_leases.owner = excluded.owner;
  select exists (
    select 1 from public.tracecase_leases
    where organization_id = p_organization_id and project_id = p_project_id
      and lease_key = p_lease_key and owner = p_owner
  ) into acquired;
  return acquired;
end;
$$;

create or replace function public.tracecase_match_repository_chunks(
  p_organization_id text,
  p_project_id text,
  p_query_text text,
  p_query_embedding extensions.vector(768) default null,
  p_repository text default null,
  p_commit text default null,
  p_limit integer default 5
) returns table (document jsonb, score double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.document,
    (case when p_query_embedding is not null and d.embedding is not null
      then 0.75 * (1 - (d.embedding operator(extensions.<=>) p_query_embedding)) else 0 end)
    + (0.25 * ts_rank_cd(to_tsvector('english', coalesce(d.content_text, '')), websearch_to_tsquery('english', p_query_text))) as score
  from public.tracecase_documents d
  where d.entity_type = 'repository_chunk'
    and d.organization_id = p_organization_id
    and d.project_id = p_project_id
    and (p_repository is null or d.repository = p_repository)
    and (p_commit is null or d.commit_sha = p_commit)
    and coalesce((d.document->>'ignored')::boolean, false) = false
    and (
      (p_query_embedding is not null and d.embedding is not null)
      or to_tsvector('english', coalesce(d.content_text, '')) @@ websearch_to_tsquery('english', p_query_text)
    )
  order by score desc
  limit least(greatest(p_limit, 1), 40);
$$;

grant execute on function public.tracecase_acquire_lease(text, text, text, text, timestamptz) to service_role;
grant execute on function public.tracecase_match_repository_chunks(text, text, text, extensions.vector, text, text, integer) to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('tracecase-artifacts', 'tracecase-artifacts', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tracecase_documents'
  ) then
    alter publication supabase_realtime add table public.tracecase_documents;
  end if;
end $$;
