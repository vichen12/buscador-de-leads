# Prospecta

Sistema de prospección y contacto para estudios de diseño web: cargás negocios que **no tienen web propia**, generás un mensaje personalizado para cada uno y llevás el seguimiento. **Cada envío lo revisa y lo confirma una persona.**

- **Multiusuario:** cada cuenta (agencia o vendedor) ve sólo sus prospectos, mensajes e historial. El aislamiento lo garantiza la base de datos con Row Level Security.
- **Carga:** importás CSV o Excel con mapeo flexible de columnas, cargás a mano o buscás en Google Places (API oficial, campo `websiteUri`). Los duplicados se descartan solos, por teléfono o por nombre + dirección.
- **Borradores con IA:** se arman un WhatsApp, un email y un seguimiento por negocio. El tono es cercano y entra por el valor, nunca por el miedo. Todos los borradores son editables y quedan guardados.
- **Contacto con una persona en el medio:** "Abrir WhatsApp" o "Abrir Email" abren la app con el texto cargado. Vos apretás enviar y después confirmás en Prospecta.
- **Seguimiento:** cinco estados, recordatorio a los X días, tablero con tasa de respuesta y envíos del día, filtros y exportación a CSV.

---

## Estado del despliegue (30/10/2026)

| Pieza | Estado |
|---|---|
| Base de datos (Supabase `prospecta`, São Paulo, plan gratis) | ✅ esquema, RLS y reglas aplicadas · advisor de seguridad sin observaciones |
| Funciones `generar-mensajes`, `buscar-places`, `registro` | ✅ desplegadas |
| Altas de usuarios | ✅ sólo el super admin (Super admin → Usuarios → Nuevo usuario); no hay registro abierto |
| Super admin (empresas, usuarios, invitaciones, claves) | ✅ panel en `/admin` |
| Asistente IA (chat con Claude) | ✅ en `/asistente`; funciona en cuanto cargues la clave de Claude |
| Borradores con IA | ⚙️ funciona con plantillas; para usar Claude, cargá la clave en **Super admin → Claves y servicios** |
| Buscar negocios | ✅ con Claude + búsqueda web (sin Google Places) |
| Web publicada | ✅ https://web-puce-mu-10.vercel.app (Vercel, se publica sola con cada push) |

- URL del proyecto: `https://yggpzstnntjwcxayhcfp.supabase.co`
- La clave pública (publishable) ya viene en `web/.env.production`. Es pública por diseño: RLS protege los datos.

## Super admin

La cuenta que se registra con **dallapevincenzo@gmail.com** queda como super admin (`perfiles.es_admin`). Nadie puede darse ese permiso desde el navegador: lo protege un trigger. Desde **Super admin** (`/admin`):

- **Empresas**: crear, editar, **habilitar o suspender**. Cuando suspendés una empresa, sus usuarios ven una pantalla de "empresa suspendida", la base les bloquea los datos con RLS y sus códigos dejan de servir para registrarse. Los datos no se borran: cuando la reactivás, vuelven a verlos.
- **Usuarios**: buscar a cualquier usuario, cambiarlo de empresa y suspenderlo o reactivarlo uno por uno. No te podés suspender a vos mismo.
- **Invitaciones**: los códigos se atan a una empresa. El link `…/?invitacion=CÓDIGO` abre el registro con el código ya cargado.
- **Claves y servicios**: la clave de Claude (Anthropic), la de Google Places y el modelo. Se guardan en `config_claves`, una tabla que sólo leen las funciones del servidor. El panel muestra únicamente los últimos 4 caracteres. Si cargás una clave también como secreto de Supabase, la del panel tiene prioridad.

## Asistente IA

Chat con Claude en **Asistente IA** (`/asistente`), la función `asistente`:
- Conoce los datos de la cuenta: métricas del tablero, hasta 300 prospectos con estado, rubro y notas, y la actividad reciente. Responde cosas como "¿a quién le escribo hoy?" o "¿qué rubro me responde más?", y también dudas generales (precios, objeciones, estrategia).
- **PDF de entrada:** se puede adjuntar un PDF (hasta 8 MB), por ejemplo el perfil de una empresa, y Claude lo lee.
- **PDF de salida:** cualquier respuesta, o la conversación entera, se exporta a un PDF con formato de informe ("Exportar PDF" → Guardar como PDF).
- **Límite por usuario:** 30 consultas por día por defecto. El general se cambia en Super admin → Claves y el de cada usuario en Super admin → Usuarios. El uso queda en `chat_uso`, que sólo escribe el servidor: borrar conversaciones no devuelve cupo.
- Las conversaciones son privadas de cada usuario: ni el super admin las ve.

### Altas y contraseñas
No hay registro abierto. El super admin crea cada cuenta en **Super admin → Usuarios → Nuevo usuario** (o "Agregar usuario" desde una empresa). La función `admin-usuarios` la crea confirmada y devuelve una contraseña inicial que se muestra una sola vez, junto con un mensaje listo para mandarle a la persona. El botón ↻ genera una contraseña nueva si alguien la olvida. Si alguien intentara registrarse directo contra la API de Auth, su perfil nace **sin acceso**: la marca de alta va en `app_metadata`, que sólo escribe el servidor.

### Buscar negocios
La función `buscar-negocios` le pide a Claude, con la herramienta de búsqueda web (`web_search`), negocios del rubro y la zona que no tengan web propia. Devuelve nombre, teléfono, Instagram, qué tienen hoy, la fuente y una nota. El usuario revisa y elige qué importar. Cada búsqueda usa 1 consulta del cupo diario de IA. Requiere que la búsqueda web esté habilitada en la organización de Anthropic.

### Publicar la web
`prospecta-web-listo.zip` es la web ya compilada y apuntando a este Supabase. Cualquiera de estas opciones la deja online:
- **Netlify (sin instalar nada):** descomprimí el zip, entrá a https://app.netlify.com/drop y arrastrá la carpeta. El archivo `_redirects` ya está incluido.
- **Vercel (CLI):** descomprimí el zip y, dentro de la carpeta, corré `npx vercel deploy --prod`. El `vercel.json` ya está incluido.
- **Desde GitHub (recomendado):** en Vercel, *Add New → Project → Import* `vichen12/buscador-de-leads` y *Deploy*, sin tocar nada: el `vercel.json` de la raíz ya define build y salida. Cada `git push` se publica solo. En Netlify es igual con *Import from Git*, porque `netlify.toml` ya está configurado. Las variables públicas vienen en `web/.env.production`.

---

## Estructura

```
prospecta/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 20261029000000_init.sql   ← esquema, RLS, reglas anti-spam, importación, tablero
│   └── functions/
│       ├── _shared/
│       │   ├── clasificar.js         ← ¿tiene web propia?, teléfonos, links wa.me/mailto (compartido con el front)
│       │   ├── plantillas.js         ← borradores sin IA (respaldo), variados por prospecto
│       │   └── supabase.ts           ← cliente que actúa como el usuario (RLS) + CORS
│       ├── generar-mensajes/index.ts ← borradores con Claude (o plantillas)
│       ├── buscar-places/index.ts    ← Google Places API (New) → candidatos sin web propia
│       └── registro/index.ts         ← alta de cuentas con código de invitación
├── web/                              ← React + Vite
│   ├── src/
│   │   ├── App.jsx                   ← sesión, perfil, rutas
│   │   ├── pages/  Login · Tablero · Prospectos · Prospecto (detalle y envío) · Seguimientos · Importar · BuscarPlaces · Cuenta · Admin (super admin) · Asistente
│   │   ├── components/  Layout · EstadoBadge · NuevoProspecto
│   │   └── lib/  supabase.js · importar.js (CSV/Excel, mapeo, dedupe) · util.js · logica.test.js
│   ├── .env.example
│   └── vercel.json
├── tests/
│   ├── sql/rls.test.mjs              ← pruebas de la base en Postgres embebido (sin internet)
│   └── e2e/                          ← pruebas contra el Supabase real: backend.test.mjs (API), ui.test.mjs y admin.test.mjs (navegador)
└── datos/prospectos_mendoza.csv      ← los 50 prospectos ya relevados, listos para importar
```

## Modelo de datos

```
auth.users ──1:1── perfiles (nombre, estudio, firma, límite diario, días de seguimiento, indicaciones para la IA)
     │
     └──1:N── prospectos (nombre, rubro, zona, dirección, teléfono, email, instagram, que_tiene_hoy,
                │          web_actual, rating, reseñas, google_maps_url, estado, notas,
                │          ultimo_contacto, proximo_seguimiento, telefono_norm*, clave_nombre_dir*)
                ├──1:N── mensajes      (tipo whatsapp|email|seguimiento, asunto, cuerpo, generado_por, editado, enviado_at)
                └──1:N── interacciones (tipo enviado|respuesta|nota|cambio_estado|llamada, canal, detalle, fecha)
* columnas calculadas para deduplicar
```

**Estados:** `pendiente → contactado → respondio → cliente`. En cualquier momento se puede pasar a `no_interesado`.

### Reglas que viven en la base (no se pueden saltear desde el front)

| Regla | Dónde |
|---|---|
| Cada usuario ve y edita sólo lo suyo | RLS en las 4 tablas |
| El historial no se edita ni se borra | RLS de `interacciones`: sólo lectura y alta |
| Límite diario de envíos (configurable, 15 por defecto) | trigger `al_registrar_interaccion` |
| Opt-out: a un "no interesado" no se le registran envíos y sale de los seguimientos | triggers `al_registrar_interaccion` y `al_cambiar_estado` |
| No se puede registrar como enviado un texto idéntico a otro ya enviado | trigger `al_registrar_interaccion` |
| Deduplicado por teléfono normalizado o por nombre + dirección (por cuenta) | índices únicos + `importar_prospectos()` |
| Al registrar un envío: estado "contactado" y seguimiento a X días | trigger |
| Al registrar una respuesta: estado "respondió" y se cancela el seguimiento | trigger |

---

## Puesta en marcha (unos 15 minutos)

### 1. Supabase
1. Creá un proyecto en [supabase.com](https://supabase.com). El plan gratis alcanza.
2. **Base de datos:** en *SQL Editor*, pegá y corré los archivos de `supabase/migrations/` en orden.
   Con la CLI también sirve: `supabase link --project-ref TU_REF && supabase db push`.
3. **Auth:** dejá habilitado Email. Creá un código de invitación con el `insert` de más arriba.

### 2. Funciones (IA y Google Places)
```bash
npm i -g supabase            # o: brew install supabase/tap/supabase
supabase login
supabase link --project-ref TU_REF
cp supabase/functions/.env.example supabase/functions/.env   # completá las keys
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy generar-mensajes
supabase functions deploy buscar-places
supabase functions deploy registro --no-verify-jwt
```
- `ANTHROPIC_API_KEY` (o mejor: cargala desde Super admin → Claves): se saca en [console.anthropic.com](https://console.anthropic.com). Es opcional: sin esta key, los borradores salen de plantillas variadas.
- `GOOGLE_PLACES_API_KEY`: hace falta sólo para "Buscar en Google". Habilitá **Places API (New)** en Google Cloud. Los campos de web y teléfono se cobran como *Text Search Enterprise*, con 1.000 llamadas gratis por mes. Cada búsqueda consume entre 1 y 3 llamadas.

### 3. Frontend
```bash
cd web
cp .env.example .env.local    # completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (Project Settings → API)
npm install
npm run dev                   # http://localhost:5173
```
**Para publicarlo en Vercel:** importá el repo, elegí `web` como *Root directory* y cargá las dos variables `VITE_…`. El archivo `vercel.json` ya resuelve las rutas.

### 4. Primeros pasos
1. Creá tu cuenta con el código de invitación y completá **Ajustes**: nombre, estudio, firma y límite diario.
2. Andá a **Importar** y subí `datos/prospectos_mendoza.csv`. Las columnas se asocian solas.
3. En **Prospectos**, seleccioná algunos y tocá **Generar borradores**.
4. Abrí cada prospecto, revisá el texto y tocá **Abrir WhatsApp**. Enviás desde WhatsApp y después tocás **Sí, lo envié**.
5. El **Tablero** y **Seguimientos** te muestran a quién volver a escribir y cuándo.

---

## Pruebas

```bash
cd web && npm test                  # 20 pruebas de lógica: webs, teléfonos/WhatsApp, importación y dedupe, plantillas
cd tests/sql && npm i && npm test   # 49 pruebas de la base en Postgres embebido (RLS, límites, empresas, super admin, claves, asistente)

# Contra el Supabase real (crean usuarios de prueba @example.com):
export SUPABASE_URL=https://yggpzstnntjwcxayhcfp.supabase.co SUPABASE_ANON_KEY=<publishable> CODIGO_INVITACION=<código>
node tests/e2e/backend.test.mjs     # 49 comprobaciones: registro, aislamiento, importación, funciones, límites, opt-out, tablero
cd web && npm run build && npx vite preview --port 4173 &
APP_URL=http://localhost:4173 node tests/e2e/ui.test.mjs      # 50 comprobaciones en navegador (requiere Playwright)
APP_URL=http://localhost:4173 node tests/e2e/admin.test.mjs   # 38 comprobaciones del panel de super admin (respuestas de admin simuladas)
APP_URL=http://localhost:4173 node tests/e2e/asistente.test.mjs # 34 comprobaciones del chat (respuestas de Claude simuladas)
```

---

## Anti-spam: qué hace y qué no hace (a propósito)

- **No envía nada solo.** Los botones abren WhatsApp, Gmail, la app de mail o Instagram con el texto cargado, y el envío lo hace la persona. Recién después se confirma en Prospecta.
- **Límite diario** controlado por la base. La recomendación es 10 a 15 envíos por día desde un número real.
- **Nada de textos idénticos en masa:** si un texto ya se envió a otro negocio, no se puede volver a enviar sin cambiarlo. Además las plantillas y la IA varían el texto por prospecto.
- **Opt-out definitivo:** "No interesado" corta los envíos y los seguimientos.
- **Generar borradores en lote está permitido; enviar en lote, no.**
- **Fuentes de datos:** la API oficial de Google Places o tus propios archivos. No hay scraping.

### Si más adelante querés enviar por API (opcional, no incluido)
Hacelo sólo por canales oficiales y manteniendo la confirmación por lote:
- **Email:** Gmail API con OAuth de la cuenta del propio usuario (scope `gmail.send`). Conviene una nueva Edge Function `enviar-email` que reciba los `mensaje_id` aprobados en pantalla y respete el mismo límite diario: alcanza con insertar la interacción `enviado` antes de mandar, porque si el trigger la rechaza no se envía.
- **WhatsApp:** sólo con la **WhatsApp Business Platform (Cloud API)** oficial. El primer contacto tiene que ser con **plantillas aprobadas por Meta** y con opt-in del destinatario. Un mensaje libre a alguien que no te escribió no está permitido por la plataforma, así que para prospección en frío el camino correcto sigue siendo el envío manual.

Nunca uses librerías que automatizan WhatsApp Web ni envíos masivos desde Gmail personal: banean el número y queman la cuenta.
