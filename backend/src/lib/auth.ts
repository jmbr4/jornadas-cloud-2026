import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { config } from './config.js'
import { forbidden, unauthorized } from './http.js'
import { getAdminEmails, getSessionSecret } from './secrets.js'

/**
 * Sesiones sin dependencias: un JWT-like firmado con HMAC-SHA256.
 *
 * Formato: base64url(payload) + "." + base64url(hmac). Suficiente y legible
 * para el taller. En producción esto sería Cognito o un JWT firmado con KMS,
 * y la verificación viviría en un Lambda authorizer en vez de en cada handler.
 */

export interface SessionPayload {
  userId: string
  email: string
  /** Epoch en segundos. */
  exp: number
}

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

const sign = async (data: string) =>
  createHmac('sha256', await getSessionSecret()).update(data).digest('base64url')

export async function createSessionToken(userId: string, email: string): Promise<string> {
  const payload: SessionPayload = {
    userId,
    email,
    exp: Math.floor(Date.now() / 1000) + config.sessionHours * 3600,
  }
  const body = encode(payload)
  return `${body}.${await sign(body)}`
}

/** Devuelve el payload si la firma es válida y no ha caducado; si no, null. */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  const expected = await sign(body)
  // Comparación en tiempo constante: no filtrar información por el tiempo.
  const given = Buffer.from(signature)
  const want = Buffer.from(expected)
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null
    if (!payload.userId || !payload.email) return null
    return payload
  } catch {
    return null
  }
}

/** Token de un solo uso para el enlace mágico. */
export const createMagicLinkToken = (): string => randomBytes(32).toString('base64url')

/**
 * Extrae y valida la sesión de la cabecera `Authorization: Bearer <token>`.
 * Lanza 401 si falta o no es válida.
 */
export async function requireSession(
  event: APIGatewayProxyEventV2,
): Promise<SessionPayload> {
  const header = event.headers?.['authorization'] ?? event.headers?.['Authorization']
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) throw unauthorized('Falta la cabecera Authorization.')

  const session = await verifySessionToken(token)
  if (!session) throw unauthorized('La sesión ha caducado o no es válida.')
  return session
}

/** ¿Este correo está en la lista de administradores? */
export const isAdminEmail = async (email: string): Promise<boolean> =>
  (await getAdminEmails()).includes(email.trim().toLowerCase())

/**
 * Como `requireSession`, pero además exige permiso de administración.
 * Sin `ADMIN_EMAILS` configurado no es administrador nadie: el panel queda
 * cerrado por defecto en vez de abierto por defecto.
 */
export async function requireAdmin(
  event: APIGatewayProxyEventV2,
): Promise<SessionPayload> {
  const session = await requireSession(event)
  if (!(await isAdminEmail(session.email))) {
    throw forbidden('Necesitas permisos de administración.')
  }
  return session
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const isValidEmail = (email: string) => EMAIL.test(email)

/** Longitud y caracteres admitidos en un handle público. */
const HANDLE = /^[a-z0-9_]{3,20}$/

/**
 * Normaliza y valida un handle elegido por la persona.
 *
 * Minúsculas, sin la arroba y sin acentos ni espacios: así dos handles que se
 * leen igual no pueden ser distintos, y comparar por igualdad basta para
 * garantizar que es único.
 */
export function normalizeHandle(raw: string): string | null {
  const clean = raw
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  return HANDLE.test(clean) ? clean : null
}

/** Nombre visible: se admite casi cualquier cosa, pero acotada. */
export function normalizeName(raw: string): string | null {
  const clean = raw.trim().replace(/\s+/g, ' ')
  return clean.length >= 2 && clean.length <= 40 ? clean : null
}
