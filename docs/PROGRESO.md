# Progreso de las mejoras (partes 1, 2 y 3)

Fuente: los tres documentos "Mejoras para Prospecta" (parte 1: completar y ordenar; parte 2: features nuevas A–G; parte 3: modo B2C y lanzamiento).
Se trabaja por bloques en orden de prioridad. Cada bloque: migración → funciones → web → build → deploy → commit.

## Parte 1
- [ ] P1 Proteger casilla y ley
  - [x] Migración `p1_proteccion_casilla`: supresión por tenant (email + dominio), bajas_tokens + info_baja/confirmar_baja (anon),
        email_estado/motivo/verificado_at, limite_email() por proveedor + calentamiento, trigger de envío con SUPRIMIDO/LIMITE_EMAIL,
        tablero().email, datos_legales()
  - [ ] correo: pie de baja + token, bloqueo suprimido/inválido, límite email, lectura de bajas y rebotes, modo salud (SPF/DKIM/DMARC)
  - [ ] verificar-email (formato, MX por DNS-over-HTTPS, descartables)
  - [ ] Web: /baja/:token, /terminos, /privacidad, pantalla No contactar, límite y calentamiento, salud del dominio, indicador email, pausa 45–120 s, pausa por rebotes > 5 %
- [ ] P2 Secuencias, clasificación IA, Respuestas
- [ ] P3 Contactos, dedupe, E.164, puntaje explicado, datos con fuente
- [ ] P4 Estados nuevos + Kanban, notas/tareas, roles, calendario, menú, Ctrl+K
- [ ] P5 Tablero/embudo, reportes, A/B de asunto
- [ ] P6 Cola en servidor, credenciales, cuentas (recuperar, TOTP), auditoría, costos IA, exportación/borrado
- [ ] P7 Primer uso, claridad, lote, celular/PWA, rendimiento, accesibilidad
- [ ] P8 Integraciones, plantillas, señales, búsquedas guardadas, notificaciones, idiomas

## Parte 2 (A–G) — pendiente
## Parte 3 (B2C y lanzamiento) — pendiente

## Pendiente de decisión
- Email de contacto de privacidad y responsable legal: se cargan en config_claves (`email_privacidad`, `responsable_legal`).
