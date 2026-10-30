-- Cómo quiere la persona que Claude escriba sus emails (tono, largo, estructura) y qué archivos van siempre
alter table public.perfiles add column if not exists config_email jsonb not null default '{}'::jsonb;
alter table public.archivos add column if not exists siempre boolean not null default false;
