# Progreso de las mejoras (partes 1, 2 y 3)

Fuente: los tres documentos "Mejoras para Prospecta" (parte 1: completar y ordenar; parte 2: features nuevas A–G; parte 3: modo B2C y lanzamiento).

## Cómo se deploya (importante)
- Web: push a `main` → Vercel deploya solo.
- Funciones: MCP `deploy_edge_function`. El código compartido grande (`_shared/correo.ts`, `_shared/redactar.ts`, `_shared/plantillas.js`)
  NO se manda en el deploy: los `index.ts` lo importan desde GitHub fijado a un commit
  (`https://raw.githubusercontent.com/vichen12/buscador-de-leads/<sha>/supabase/functions/_shared/...`). El repo es público.
  Flujo: commit + push → reemplazar `../_shared/correo.ts` por la URL con el sha en el payload → deploy (index.ts, archivos locales y `_shared/supabase.ts`).
- pg_cron `prospecta-trabajador` llama cada minuto a la función `correo` con el header `x-trabajador` (secreto en Vault, `secreto_trabajador()`):
  cola de envíos (`envios_cola`, `tomar_envios`), secuencias (`inscripciones`) y lectura de casillas (cada 10 min, con clasificación de Claude).

## Parte 1
- [x] P1 Proteger casilla y ley (supresión, bajas con token público, rebotes, verificación de email, límite por proveedor + calentamiento, salud del dominio, términos/privacidad)
- [x] P2 Secuencias (+ por defecto), tareas, bandeja Respuestas con clasificación IA, responder en el hilo, cola en servidor (6.1) con pausar/reanudar/cancelar, A/B de asunto (5.3 parcial: falta reporte)
- [ ] P3 Datos: [x] tabla contactos + UI en ficha + borradores al contacto principal + idioma por país + regla "sin inventar" y `personalizado` en mensajes
      [ ] decisor al buscar, [ ] dedupe fuerte + unir duplicados, [ ] E.164 + fijo/celular, [ ] puntaje explicado, [ ] resaltado de frases con fuente en el borrador
- [ ] P4 Estados nuevos (reunión, propuesta, perdido con motivo) + Kanban con valor, roles admin/vendedor, responsable, calendario .ics, Ctrl+K global, URL state
      (ya hecho: menú reordenado, tareas, notas en historial)
- [ ] P5 Tablero (embudo, tasa 7/30, tareas del día, consumo IA), Reportes (+ A/B), exportables
- [ ] P6 Recuperar contraseña, TOTP, cerrar sesión en todos, auditoría, tope de costo por búsqueda + estimación + aviso 80 %/100 %, exportar ZIP / borrar cuenta, pruebas de aislamiento RLS
- [ ] P7 Recorrido de primer uso + checklist, tooltips, deshacer (toast con deshacer ya existe), lote en Por revisar con atajos, PWA, paginación servidor, accesibilidad
- [ ] P8 Integraciones (export HubSpot/Pipedrive/Zoho + webhooks), plantillas con variables, señales de oportunidad, búsquedas guardadas, notificaciones, idiomas (hecho en redacción)

## Parte 2 (A–G) — pendiente
## Parte 3 (B2C y lanzamiento) — pendiente

## Pendiente de decisión
- Email de contacto de privacidad y responsable legal: cargar en config_claves (`email_privacidad`, `responsable_legal`).
- URL pública de la app para los links de baja: config_claves `url_app` (por defecto https://web-puce-mu-10.vercel.app).

## 30/10 — P4, P5 y separación B2B/B2C
- P4 hecho: estados reunión/propuesta/perdido (con motivo), valor estimado, equipo con roles (admin/vendedor), navbar nueva (búsqueda Ctrl+K, Nuevo, avisos, menú de cuenta, barra móvil).
- P5 hecho: RPC `reporte(desde, hasta, owner)` + página /reportes (exporta CSV para Excel); tablero con tasa 7/30 días y tareas de hoy.
- B2B/B2C: `perfiles.modo` + `perfiles.modos`, `cambiar_modo`, `habilitar_modo`; tabla `clientes` (B2C) con consentimiento documentado por constraint; `tablero_b2c()`. En B2C el menú, el color (violeta), la búsqueda global y "Nuevo" son propios.
- Sigue: P6 (seguridad/robustez), B2C aliados/creadores/campañas, Parte 2.
- Pendiente de decisión: si B2C es un plan pago (hoy lo habilita el admin sin costo).

## 30/10 (noche) — P6, P7, B2C completo, tablero con gráficos
- P6: auditoría, recuperar contraseña, 2FA (TOTP), exportar .zip, borrar cuenta (admin-usuarios modo borrar_mi_cuenta), cupo visible antes de buscar, test RLS en supabase/tests/aislamiento.sql.
- P7: primeros pasos, atajos J/K/S/N/X en Por revisar, PWA.
- B2C: aliados, creadores, campañas + campana_envios (trigger que bloquea envíos sin permiso), correo modo `cliente`, generar-mensajes modo `b2c`. Bajas por link también marcan clientes. limite_email cuenta mails de campañas.
- Color B2C: verde azulado (#0d9488). B2B: naranja.
- Pendiente de verificar: URL de Vercel en Supabase Auth → URL Configuration para el mail de recuperación.
- Sigue: P8 (integraciones CRM, plantillas, búsquedas guardadas, notificaciones), Parte 2 (Tu día, guion de llamada, brief de reunión, propuestas, visitas, multi-casilla, inbound, etiquetas, vistas, comentarios, metas, resumen semanal, coach, admin, ayuda, API), Parte 3 resto (bandeja unificada, planes, landing, demo, LANZAMIENTO.md).
