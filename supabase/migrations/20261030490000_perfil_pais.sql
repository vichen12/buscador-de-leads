-- País y provincia/región de cada cuenta: se pide al empezar y se cambia en Mi cuenta.
-- Con eso se arman las zonas sugeridas, la zona horaria y el idioma de las búsquedas (antes todo arrancaba en Mendoza).
alter table public.perfiles add column if not exists pais text check (pais is null or pais ~ '^[A-Z]{2}$');
alter table public.perfiles add column if not exists region text check (region is null or length(region) <= 80);
