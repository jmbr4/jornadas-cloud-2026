/**
 * Log estructurado en JSON.
 *
 * CloudWatch Logs Insights sabe consultar campos de un JSON por su nombre
 * (`fields @timestamp, level, route, Latency | filter level = "error"`), así que
 * escribir objetos en lugar de frases es lo que hace útil el día de logs.
 *
 * Las métricas (`lib/metrics.ts`) escriben por aquí también: un documento EMF
 * no es más que una de estas líneas con un nodo `_aws` dentro.
 */

export type Level = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  requestId?: string
  route?: string
  userId?: string
  [key: string]: unknown
}

/**
 * Una línea JSON en el flujo que le toca.
 *
 * En Lambda los dos flujos acaban en el mismo log group, así que separar
 * `error` no cambia dónde se guarda: cambia lo que ves en local y lo que
 * marca como error cualquier herramienta que lea de stderr.
 */
export const writeLine = (level: Level, payload: Record<string, unknown>): void => {
  const line = JSON.stringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

const write = (level: Level, message: string, context: LogContext = {}) =>
  writeLine(level, {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  })

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
}

/** Serializa un error sin volcar el stack entero en producción. */
export const describeError = (error: unknown) =>
  error instanceof Error
    ? { errorName: error.name, errorMessage: error.message, stack: error.stack }
    : { errorMessage: String(error) }
