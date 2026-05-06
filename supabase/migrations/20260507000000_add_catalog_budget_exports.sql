create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  firebase_doc_id text not null unique,
  name text not null,
  sku text,
  category text not null default 'products',
  supplier text,
  dimensions text,
  width numeric,
  depth numeric,
  height numeric,
  material text,
  colors text,
  tags text,
  status text,
  active boolean not null default true,
  currency text not null default 'PHP',
  retail_price numeric(12, 2),
  sale_price numeric(12, 2),
  display_price numeric(12, 2),
  source_image_url text,
  image_storage_bucket text default 'catalog-assets',
  image_storage_path text,
  public_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.catalog_items enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'catalog_items'
      and policyname = 'Authenticated users can read active catalog items'
  ) then
    create policy "Authenticated users can read active catalog items"
      on public.catalog_items
      for select
      to authenticated
      using (active = true);
  end if;
end $$;

grant select on public.catalog_items to authenticated;

create index if not exists catalog_items_active_category_name_idx
  on public.catalog_items (active, category, name);

create index if not exists catalog_items_firebase_doc_id_idx
  on public.catalog_items (firebase_doc_id);

alter table public.projects
  add column if not exists budget_amount numeric(12, 2),
  add column if not exists budget_currency text not null default 'PHP';

alter table public.generated_media
  drop constraint if exists generated_media_kind_check;

alter table public.generated_media
  add constraint generated_media_kind_check
  check (kind in ('render_image', 'video_clip', 'walkthrough_video', 'presentation_pdf'));

insert into storage.buckets (id, name, public)
values ('catalog-assets', 'catalog-assets', true)
on conflict (id) do update
set public = excluded.public;
