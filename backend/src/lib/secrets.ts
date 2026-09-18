import * as secretsManager from '@aws-sdk/client-secrets-manager'
import { config } from './config.js'

/**
 * Valores sensibles que las Lambdas leen de Secrets Manager.
 *
 * Una variable de entorno de Lambda no está oculta para quien la mira: quien
 * pueda ver la configuración de la función la lee en la consola. En Secrets
 * Manager hace falta un permiso aparte, cada lectura queda en CloudTrail y el
 * valor se puede cambiar sin volver a desplegar.
 *
 * La caché tiene caducidad, y eso importa: sin ella el valor se quedaría
 * pegado al contenedor, que bajo poco tráfico vive horas. Cambiar la lista de
 * administradores o rotar la clave exigiría redesplegar para forzar arranques
 * en frío. Con TTL, un cambio entra solo, como mucho, en unos minutos, y el
 * coste en llamadas es despreciable: una por contenedor y ventana.
 */
const TTL_MS = 5 * 60 * 1000

let client: secretsManager.SecretsManagerClient | null = null
const secrets = () => (client ??= new secretsManager.SecretsManagerClient({}))

interface Cached {
  value: Promise<string>
  /** Momento en que deja de servir, en milisegundos epoch. */
  expiresAt: number
}

const cache = new Map<string, Cached>()

/** Lee un secreto por ARN, como mucho una vez por ventana y contenedor. */
function read(arn: string): Promise<string> {
  const hit = cache.get(arn)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  const value = secrets()
    .send(new secretsManager.GetSecretValueCommand({ SecretId: arn }))
    .then((stored) => {
      const text = stored.SecretString
      if (!text) throw new Error(`El secreto ${arn} está vacío.`)
      return text
    })
    .catch((error: unknown) => {
      // Un fallo no se cachea: el siguiente intento vuelve a preguntar en vez
      // de arrastrar el error durante toda la ventana.
      cache.delete(arn)
      throw error
    })

  cache.set(arn, { value, expiresAt: Date.now() + TTL_MS })
  return value
}

/** Clave HMAC con la que se firman las sesiones. */
export function getSessionSecret(): Promise<string> {
  if (config.sessionSecretArn) return read(config.sessionSecretArn)

  if (!config.sessionSecret) {
    return Promise.reject(new Error('Falta SESSION_SECRET (o SESSION_SECRET_ARN).'))
  }
  return Promise.resolve(config.sessionSecret)
}

/**
 * Correos con permiso de administración.
 *
 * Si no hay de dónde leerlos, la lista queda vacía y no es administrador
 * nadie: el fallo seguro es el panel cerrado, no abierto.
 */
export async function getAdminEmails(): Promise<string[]> {
  const raw = config.adminEmailsArn
    ? await read(config.adminEmailsArn).catch(() => '')
    : config.adminEmails

  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes('@'))
}

/** Solo para tests: olvida lo cacheado. */
export const resetSecrets = (): void => {
  cache.clear()
}
