# Prospecta · Lanzamiento

Estado al 30/10/2026. Todo lo de abajo está en producción (web en Vercel, base y funciones en Supabase).

- App: https://web-puce-mu-10.vercel.app
- Página pública: `/conoce` (demo, planes y "Pedí acceso")
- Formulario para la web de cada cliente: `/f/<token>` (el link y el código están en Conexiones)

## Qué hace

### Empresas (B2B)
- **Mi negocio:** Claude arma la estrategia (rubros, zonas, filtros) a partir de lo que vendés o de tu web.
- **Buscar y revisar:** búsqueda de empresas con Claude en Google Maps y la web, con el motivo por el que cada una encaja. Las revisás en "Por revisar" (atajos J/K/S/N/X).
- **Pipeline:**
  - estados pendiente → contactado → respondió → reunión → propuesta → cliente / perdido (con motivo);
  - valor estimado, etiquetas, vistas guardadas, duplicados y paginación;
  - exportar a Excel, HubSpot, Pipedrive o Zoho;
  - reactivar empresas perdidas hace más de 60 días.
- **Mensajes:**
  - borradores personalizados por empresa, con tu tono y tus adjuntos;
  - guion de llamada y brief de reunión;
  - plantillas listas para usar.
- **Email desde tu casilla:**
  - envío de a uno o masivo, desde el servidor, con pausas, reintentos y prueba A/B de asunto;
  - límite diario y calentamiento de la casilla;
  - link de baja en cada mail y lista de "No contactar";
  - copia en Enviados y lectura de las respuestas, que Claude clasifica.
- **Secuencias:** email en el mismo hilo más tareas de llamada, WhatsApp y LinkedIn. Se frenan solas cuando la empresa responde.
- **Tu día:** lo que conviene hacer hoy, en orden. La bandeja **Interesados** junta respuestas, formulario web y clientes nuevos.
- **Catálogo y propuestas:** presupuestos imprimibles o en PDF. Al enviar o aceptar una propuesta, la empresa cambia sola de estado.
- **Visitas** con ruta del día en Google Maps.
- **Equipo:**
  - roles admin y vendedor, tope de usuarios por plan, "tomar" empresas de otro;
  - comentarios con @menciones y avisos;
  - archivos por empresa;
  - metas, ranking y racha.
- **Medición:**
  - Tablero con gráficos;
  - Reportes por rubro, zona, búsqueda, llamas, mensaje, vendedor, canal, motivo de pérdida y A/B, exportables;
  - "Consejos de Claude" sobre tus números;
  - resumen semanal por mail los lunes.

### Consumidores (B2C)
Es un espacio separado, con otro color (verde azulado), otro menú y datos propios.
- **Mis clientes:** el permiso para escribirles queda documentado y lo exige la base de datos, no sólo la pantalla. Incluye baja e importación.
- **Campañas:** recompra, reactivación, referidos, reseñas, cumpleaños y promociones, sólo a quienes aceptaron ese canal.
  - Email: desde tu casilla, de a uno, con link de baja.
  - WhatsApp: abrís cada chat y lo mandás vos.
- **Aliados y creadores:** organizados por etapa, con comisiones y la cuenta de clientes y ventas que trajeron. Claude escribe la propuesta y la enviás vos.
- **Tablero B2C** con gráficos y primeros pasos.

### Seguridad y cumplimiento
- **Aislamiento entre cuentas:** cada tabla tiene protección por cuenta (RLS) y hay una prueba en `supabase/tests/aislamiento.sql`.
- **Funciones de la base:** las internas no se pueden llamar desde la API; las de usuario sólo con sesión iniciada.
- **Cuentas:**
  - verificación en dos pasos;
  - recuperar contraseña por mail;
  - descargar todos tus datos (.zip);
  - borrar tu cuenta.
- **Registro de actividad** (auditoría) y registro de errores para el super admin.
- **Mensajes:**
  - WhatsApp y LinkedIn nunca se automatizan;
  - en B2C no se busca a particulares y no se le escribe a nadie sin permiso;
  - términos y privacidad publicados.

### Super admin
- Uso de la plataforma.
- Empresas y usuarios.
- Claves.
- Planes.
- Sugerencias, errores y pedidos de acceso.

## Pendiente de decisión (construido o preparado, apagado)
| Tema | Qué falta decidir | Dónde queda |
|---|---|---|
| Cobro de planes | Mercado Pago o Stripe, y precios finales | Super admin → Planes (el cobro está apagado; el plan de cada empresa se asigna a mano) |
| B2C como plan pago | Si se cobra aparte o va incluido | Hoy lo activa cualquier admin desde el menú de su cuenta |
| WhatsApp Business API | Costo por conversación de Meta y verificación de la empresa | Hoy funciona con "Abrir WhatsApp" (envío manual) |
| Conectar Gmail u Outlook con su botón de inicio de sesión | Registrar la app en Google y Microsoft | Hoy se conecta con contraseña de aplicación por SMTP/IMAP |
| Varias casillas por persona | Si hace falta y en qué plan | Hoy hay una casilla por usuario |
| API pública y webhooks | Si se ofrece y en qué plan | No expuesta |
| Transcripción de llamadas y mapas con ruta optimizada | Servicios pagos | Hoy: guion de llamada y ruta en Google Maps |
| "Ver como" otro usuario (super admin) | Política de privacidad | No implementado a propósito |
| `url_app`, `email_privacidad`, `responsable_legal` | Valores definitivos | Super admin → Claves (`config_claves`) |

## Para revisar en los paneles (no se puede desde el código)
1. **Supabase → Authentication → URL Configuration:** agregar la URL de Vercel (y el dominio final) en *Site URL* y *Redirect URLs*. Sin esto, el link de "¿Olvidaste tu contraseña?" no vuelve a la app.
2. **Supabase → Authentication → Password security:** activar *Leaked password protection*.
3. **Supabase → Authentication → MFA:** confirmar que TOTP esté habilitado (viene activo por defecto).
4. **Dominio propio:** cuando lo haya, cargarlo en Vercel y en `url_app` (Super admin → Claves), así los links de baja y del formulario usan ese dominio.
5. **Casillas de STOKA:** SPF, DKIM y DMARC del dominio (la pantalla Email muestra el estado de cada uno).

## Cómo se despliega
- **Web:** cada push a `main` despliega solo en Vercel.
- **Funciones de Supabase:**
  - el `index.ts` importa los módulos grandes de `_shared/` desde GitHub, fijados a un commit (`raw.githubusercontent.com/.../<sha>/...`);
  - para actualizarlas: commit y push, reemplazar la SHA en los imports y desplegar.
- **Base de datos:** sólo por migraciones (`supabase/migrations`).
- **Trabajador:** pg_cron llama a la función `correo` cada minuto con el secreto guardado en Vault. Manda la cola, avanza las secuencias, lee las casillas y los lunes manda los resúmenes.

## Probado
- Build y pruebas unitarias.
- Pantallas con datos simulados, en escritorio y celular, en modo claro y oscuro.
- Contra la base real, con datos de prueba que después se deshicieron:
  - aislamiento entre cuentas;
  - bloqueo de campañas a clientes sin permiso;
  - formulario web: crea la empresa, la tarea y el aviso;
  - propuestas: cambian el estado de la empresa;
  - metas, ranking y racha;
  - auditoría.

## Falta probar
- Un envío real de campaña B2C por email.
- La copia en Enviados de Private Email con tráfico real.
