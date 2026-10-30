// Alta de cuentas con código de invitación.
// Crea el usuario ya confirmado con la API de administración (no manda mails),
// así el registro funciona aunque el proyecto no tenga un servidor de correo propio.
// Es pública (verify_jwt = false): la protege el código de invitación.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cors, json } from '../_shared/supabase.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  try {
    const { email, password, nombre = '', codigo } = await req.json()
    const mail = String(email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return json({ error: 'Email inválido' }, 400)
    if (String(password ?? '').length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)
    if (!codigo) return json({ error: 'Falta el código de invitación' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })

    const cod = String(codigo).trim().toUpperCase()
    const { data: canje, error: eCod } = await admin.rpc('canjear_codigo', { p_codigo: cod })
    if (eCod) throw eCod
    if (!canje?.ok) {
      return json({ error: canje?.motivo === 'empresa' ? 'La empresa de este código está suspendida. Hablá con el administrador.' : 'Código de invitación inválido o agotado' }, 403)
    }

    const { error } = await admin.auth.admin.createUser({
      email: mail, password, email_confirm: true, user_metadata: { nombre: String(nombre).slice(0, 80), codigo: cod, empresa_id: canje.empresa_id ?? null },
    })
    if (error) {
      // devolver el uso si no se pudo crear (ej. email ya registrado)
      await admin.rpc('devolver_codigo', { p_codigo: cod })
      const yaExiste = /already|registered|exists/i.test(error.message)
      return json({ error: yaExiste ? 'Ya existe una cuenta con ese email' : error.message }, yaExiste ? 409 : 400)
    }
    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
