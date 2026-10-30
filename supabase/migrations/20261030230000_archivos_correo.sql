-- Firma con imagen y archivos para adjuntar en los emails (catálogo, presentación, lista de precios…).
-- Cada archivo tiene una descripción: Claude la lee para decidir cuándo adjuntarlo y mencionarlo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('archivos', 'archivos', false, 10485760)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- Cada usuario sólo toca su carpeta: archivos/<su id>/...
create policy "archivos propios (leer)" on storage.objects for select to authenticated
  using (bucket_id = 'archivos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "archivos propios (subir)" on storage.objects for insert to authenticated
  with check (bucket_id = 'archivos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "archivos propios (cambiar)" on storage.objects for update to authenticated
  using (bucket_id = 'archivos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "archivos propios (borrar)" on storage.objects for delete to authenticated
  using (bucket_id = 'archivos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table if not exists public.archivos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo        text not null check (tipo in ('firma', 'adjunto')),
  nombre      text not null,
  path        text not null,
  mime        text not null default 'application/octet-stream',
  tamano      int not null default 0,
  descripcion text not null default '',
  created_at  timestamptz not null default now()
);
create unique index if not exists archivos_una_firma on public.archivos (owner_id) where tipo = 'firma';
alter table public.archivos enable row level security;
create policy archivos_propios on public.archivos for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and path like (select auth.uid())::text || '/%');
grant select, insert, update, delete on public.archivos to authenticated;

-- Qué archivos lleva cada borrador de email
alter table public.mensajes add column if not exists adjuntos uuid[] not null default '{}';
