alter type public.estado_prospecto add value if not exists 'reunion' before 'cliente';
alter type public.estado_prospecto add value if not exists 'propuesta' before 'cliente';
alter type public.estado_prospecto add value if not exists 'perdido';
