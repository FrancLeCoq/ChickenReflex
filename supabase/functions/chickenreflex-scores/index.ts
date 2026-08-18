// ══════════════════════════════════════════════════════════════
//  chickenreflex-scores — Edge Function Supabase
//  Passe-plat verrouille devant les 3 RPC du classement Chicken Reflex.
//
//  POST { initData, action:'submit'|'board', mode?, limit?,
//         score?, hits?, misses?, best_ms?, avg_ms? }
//
//  Avant : le jeu appelait /rest/v1/rpc/* directement avec la cle
//  publishable, et envoyait lui-meme son player_id / player_name.
//  N'importe qui pouvait donc ecrire n'importe quel score sous
//  n'importe quelle identite.
//
//  Maintenant : l'identite n'est JAMAIS lue dans le corps de la
//  requete. Elle est derivee des initData Telegram verifiees par
//  HMAC-SHA256 avec BOT_TOKEN (methode officielle). Le player_id
//  reste 'tg:<id>', identique a l'ancien format, donc les lignes
//  existantes gardent leur proprietaire.
//
//  La LECTURE reste ouverte (podium visible hors Telegram, sans
//  ligne "moi"). Seule l'ECRITURE exige une signature valide.
// ══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_SCORE   = 10_000
const MAX_COUNT   = 10_000     // hits / misses
const MAX_MS      = 60_000     // temps de reaction plausible
const MAX_AGE_SEC = 24 * 3600  // fenetre anti-rejeu sur auth_date
const MODES       = ['easy', 'medium', 'hard']

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

/* ── HMAC helpers (Web Crypto) ─────────────────────────────── */
async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)))
}
function toHex(u8: Uint8Array): string {
  return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('')
}
/** comparaison a temps constant, pour ne pas fuir d'information par le timing */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verifie la signature d'un initData Telegram (methode bot token).
 * data_check_string = champs tries alphabetiquement, "cle=valeur" joints par \n.
 * On teste la variante avec et sans le champ "signature" (ajoute plus tard par
 * Telegram pour la validation Ed25519 tierce) : les deux exigent BOT_TOKEN,
 * donc accepter l'une ou l'autre n'ouvre aucune porte a un faussaire.
 */
async function verifyInitData(initData: string, token: string): Promise<boolean> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return false
  params.delete('hash')

  const secret = await hmac(new TextEncoder().encode('WebAppData'), token)
  const entries = Array.from(params.entries())
  const want = hash.toLowerCase()

  for (const withSig of [true, false]) {
    const pairs = withSig ? entries : entries.filter(([k]) => k !== 'signature')
    const dcs = pairs
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    if (sameHex(toHex(await hmac(secret, dcs)), want)) return true
  }
  return false
}

function authDateFresh(initData: string): boolean {
  const raw = new URLSearchParams(initData).get('auth_date')
  if (!raw) return false
  const age = Date.now() / 1000 - Number(raw)
  return Number.isFinite(age) && age >= -300 && age <= MAX_AGE_SEC
}

/** retire les caracteres de controle et les chevrons, borne la longueur */
function clean(s: string): string {
  return String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24)
}

/**
 * Identite derivee des initData VERIFIEES uniquement.
 * Meme format que l'ancien client ('tg:<id>') et meme preference de nom
 * (username sinon prenom + nom), pour ne pas orpheliner les lignes existantes.
 */
function parseUser(initData: string): { id: string; name: string } | null {
  try {
    const userStr = new URLSearchParams(initData).get('user')
    if (!userStr) return null
    const u = JSON.parse(userStr)
    if (u?.id === undefined || u?.id === null) return null
    const name = clean(u.username || [u.first_name, u.last_name].filter(Boolean).join(' '))
    return { id: 'tg:' + String(u.id), name: name || 'Poulet' }
  } catch { return null }
}

/** entier strict dans [0, max] — pas de coercition de chaine */
function intIn(v: unknown, max: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) return null
  return v
}
/** idem mais null/absent est une valeur legitime (partie sans aucun tap) */
function msOrNull(v: unknown): number | null | undefined {
  if (v === null || v === undefined) return null
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_MS) return undefined
  return v
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const headers = { 'Content-Type': 'application/json', ...CORS }

  try {
    const body = await req.json().catch(() => ({}))
    const action: string = body?.action === 'submit' ? 'submit' : 'board'
    const initData: string = typeof body?.initData === 'string' ? body.initData : ''

    const token = Deno.env.get('BOT_TOKEN') || ''
    let user: { id: string; name: string } | null = null
    let authFailed = false

    if (initData) {
      const signed = token ? await verifyInitData(initData, token) : false
      if (!token) {
        console.warn('chickenreflex-scores: BOT_TOKEN missing, refusing writes')
        authFailed = true
      } else if (!signed) {
        console.warn('chickenreflex-scores: initData signature rejected')
        authFailed = true
      } else if (!authDateFresh(initData)) {
        console.warn('chickenreflex-scores: initData too old')
        authFailed = true
      } else {
        user = parseUser(initData)
        if (!user) authFailed = true
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── ECRITURE : signature obligatoire ──────────────────────
    if (action === 'submit') {
      if (!user) {
        return new Response(JSON.stringify({
          ok: false,
          error: authFailed ? 'Invalid session' : 'Telegram required',
          authFailed,
        }), { status: 401, headers })
      }
      const mode = MODES.includes(body?.mode) ? body.mode : null
      const score  = intIn(body?.score,  MAX_SCORE)
      const hits   = intIn(body?.hits,   MAX_COUNT)
      const misses = intIn(body?.misses, MAX_COUNT)
      const bestMs = msOrNull(body?.best_ms)
      const avgMs  = msOrNull(body?.avg_ms)
      if (mode === null || score === null || hits === null || misses === null ||
          bestMs === undefined || avgMs === undefined) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid stats' }), { status: 400, headers })
      }

      const { data, error } = await supabase.rpc('submit_reflex_score', {
        p_player_id:   user.id,          // jamais lu dans la requete
        p_player_name: user.name,        // idem
        p_score:       score,
        p_hits:        hits,
        p_misses:      misses,
        p_best_ms:     bestMs,
        p_avg_ms:      avgMs,
        p_mode:        mode,
      })
      if (error) {
        console.error('submit_reflex_score error:', error.message)
        return new Response(JSON.stringify({ ok: false, error: 'Could not save score' }), { status: 500, headers })
      }
      return new Response(JSON.stringify({ ok: true, authFailed, result: data }), { headers })
    }

    // ── LECTURE : ouverte, "moi" seulement si signature valide ─
    const mode = MODES.includes(body?.mode) ? body.mode : 'easy'
    const limit = intIn(body?.limit, 50) ?? 10
    const { data, error } = await supabase.rpc('reflex_board', {
      p_mode: mode, p_limit: Math.max(limit, 1), p_player_id: user?.id ?? null,
    })
    if (error) {
      console.error('reflex_board error:', error.message)
      return new Response(JSON.stringify({ ok: false, error: 'Could not read board' }), { status: 500, headers })
    }
    return new Response(JSON.stringify({ ok: true, authFailed, result: data }), { headers })

  } catch (err) {
    console.error('chickenreflex-scores fatal:', String(err))
    return new Response(JSON.stringify({ ok: false, error: 'Server error' }), { status: 500, headers })
  }
})
