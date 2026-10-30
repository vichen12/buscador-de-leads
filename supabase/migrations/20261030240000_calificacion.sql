-- Cuánto le sirve cada empresa a la persona (3 = mucho, 2 = sirve, 1 = más o menos). La búsqueda aprende de esto.
alter table public.prospectos add column if not exists calificacion smallint check (calificacion between 1 and 3);
