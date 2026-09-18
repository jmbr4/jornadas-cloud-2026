import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { describeError } from './logger.js'
import { putMetrics } from './metrics.js'

/** Error con código HTTP: el único que se devuelve tal cual al cliente. */
export class HttpError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
  }
}

export const badRequest = (message: string) => new HttpError(400, message)
export const unauthorized = (message = 'Sesión no válida.') => new HttpError(401, message)
export const forbidden = (message = 'No tienes permiso.') => new HttpError(403, message)
export const notFound = (message = 'No encontrado.') => new HttpError(404, message)
export const conflict = (message: string) => new HttpError(409, message)

export const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
})

export const ok = (body: unknown) => json(200, body)
export const created = (body: unknown) => json(201, body)

/** Cuerpo JSON de la petición, ya parseado y validado como objeto. */
export function parseBody<T>(event: APIGatewayProxyEventV2): T {
  if (!event.body) throw badRequest('Falta el cuerpo de la petición.')
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      throw badRequest('El cuerpo debe ser un objeto JSON.')
    }
    return parsed as T
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw badRequest('El cuerpo no es JSON válido.')
  }
}

/** Parámetro de ruta obligatorio (`/sets/{setId}` -> `pathParam(event, 'setId')`). */
export function pathParam(event: APIGatewayProxyEventV2, name: string): string {
  const value = event.pathParameters?.[name]
  if (!value) throw badRequest(`Falta el parámetro de ruta ${name}.`)
  return decodeURIComponent(value)
}

export type Handler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>

/**
 * Envuelve un handler: traduce HttpError a su respuesta, registra la petición
 * y convierte cualquier otro fallo en un 500 sin filtrar detalles internos.
 *
 * La línea de cierre de cada petición es un documento EMF, así que **es el log
 * y es la métrica**: el mismo evento que cuenta qué pasó publica `Latency` y
 * `Faults` en CloudWatch. Dos líneas —una para leer y otra para medir— serían
 * el doble de ingesta contando lo mismo.
 */
export function withErrors(route: string, handler: Handler): Handler {
  return async (event) => {
    const started = Date.now()
    const requestId = event.requestContext?.requestId

    /**
     * Cierra la petición: una línea, con su log y sus dos métricas.
     *
     * `route` va como dimensión porque hay once rutas y no cambian; el
     * `requestId` va como propiedad porque hay uno por petición y convertirlo
     * en dimensión crearía una métrica nueva cada vez. Esa es toda la regla.
     *
     * No se emite un contador de peticiones: el número de muestras de
     * `Latency` ya lo es. En CloudWatch se pide con el estadístico
     * `SampleCount`, y sale gratis porque no es una métrica más.
     */
    const close = (
      level: 'info' | 'warn' | 'error',
      message: string,
      status: number,
      context: Record<string, unknown> = {},
    ) =>
      putMetrics({
        level,
        message,
        metrics: [
          { name: 'Latency', value: Date.now() - started, unit: 'Milliseconds' },
          // 0 y 1, no «1 solo cuando falla»: si únicamente se escribiera al
          // fallar, la métrica no tendría puntos mientras todo va bien y una
          // alarma no sabría distinguir «cero errores» de «nadie llamó».
          { name: 'Faults', value: status >= 500 ? 1 : 0, unit: 'Count' },
        ],
        dimensions: { route },
        properties: { requestId, status, ...context },
        total: true,
      })

    try {
      const response = await handler(event)
      const status = typeof response === 'object' ? (response.statusCode ?? 200) : 200
      close('info', 'request', status)
      return response
    } catch (error) {
      if (error instanceof HttpError) {
        close('warn', 'request rechazada', error.statusCode, { reason: error.message })
        return json(error.statusCode, { message: error.message })
      }

      close('error', 'request fallida', 500, describeError(error))
      return json(500, { message: 'Error interno.' })
    }
  }
}
