-- jotter cloud mirror — every table owner-scoped with RLS.
-- Apply in the Supabase SQL editor or via `supabase db push`.

create table if not exists planners (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  year int not null,
  title text not null default '',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pages (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  planner_id uuid not null references planners (id) on delete cascade,
  type text not null check (type in ('year', 'month', 'week', 'section')),
  index int not null,
  label text not null default '',
  month_index int not null default -1,
  date_start text not null default '',
  date_end text not null default '',
  meta jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists strokes (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page_id uuid not null references pages (id) on delete cascade,
  tool text not null,
  color text not null,
  width real not null,
  opacity real not null default 1,
  points jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists blocks (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page_id uuid not null references pages (id) on delete cascade,
  type text not null check (type in ('text', 'image', 'task')),
  x real not null, y real not null, w real not null, h real not null,
  z int not null default 0,
  content text not null default '',
  image_path text, -- Supabase Storage path (blobs never go in Postgres)
  checked boolean,
  category_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists habits (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  planner_id uuid not null references planners (id) on delete cascade,
  name text not null,
  cadence text not null check (cadence in ('daily', 'weekly')),
  "order" int not null default 0,
  active boolean not null default true
);

create table if not exists habit_checks (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null references habits (id) on delete cascade,
  date text not null,
  checked boolean not null default false,
  unique (habit_id, date)
);

create table if not exists categories (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  planner_id uuid not null references planners (id) on delete cascade,
  name text not null,
  color text not null,
  "order" int not null default 0
);

create table if not exists events (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  planner_id uuid not null references planners (id) on delete cascade,
  google_id text,
  kind text not null check (kind in ('event', 'birthday', 'reminder')),
  title text not null,
  date text not null,
  start_time text,
  end_time text,
  all_day boolean not null default true,
  rrule text,
  category_id uuid,
  updated_at timestamptz not null default now()
);

-- RLS: owner-only on every table, every operation.
do $$
declare t text;
begin
  foreach t in array array['planners','pages','strokes','blocks','habits','habit_checks','categories','events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "owner_all" on %I', t);
    execute format(
      'create policy "owner_all" on %I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- Private storage bucket for pasted images, owner-scoped by folder prefix.
insert into storage.buckets (id, name, public)
values ('block-images', 'block-images', false)
on conflict (id) do nothing;

drop policy if exists "owner_images" on storage.objects;
create policy "owner_images" on storage.objects for all to authenticated
using (bucket_id = 'block-images' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'block-images' and (storage.foldername(name))[1] = auth.uid()::text);
