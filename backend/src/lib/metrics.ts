/**
 * Métricas de CloudWatch sin llamar a CloudWatch: EMF.
 *
 * EMF (*Embedded Metric Format*) es un JSON con un nodo `_aws` que le dice a
 * CloudWatch: «de esta línea de log, estos campos son métricas y estos otros
 * son las dimensiones por las que agruparlas». La Lambda solo escribe por
 * stdout; CloudWatch extrae las métricas del log group por su cuenta.
 *
 * Por qué así y no con `PutMetricData`:
 *
 *  - **No es una llamada de red.** `PutMetricData` es una petición HTTP dentro
 *    del handler: suma latencia a la respuesta, puede fallar y hay que
 *    decidir si se espera a ella o no. Escribir una línea no hace nada de eso.
 *  - **No hace falta permiso de CloudWatch.** Basta `logs:PutLogEvents`, que
 *    toda Lambda ya tiene. No se toca ninguna política de IAM.
 *  - **La métrica y su contexto viajan juntos.** El mismo evento que produce
 *    el número guarda al lado el `requestId`, el `userId` o la ruta. Cuando la
 *    gráfica hace un pico, Logs Insights te dice de quién era ese pico. Con
 *    `PutMetricData` el número vive en un sitio y la explicación en otro.
 *
 * El precio de esto es el de siempre: **cada combinación única de
 * (métrica × conjunto de dimensiones) es una métrica personalizada**, y se
 * factura. De ahí la regla que impone este módulo: lo que tiene pocos valores
 * posibles va como dimensión (la ruta, el set); lo que tiene uno por petición
 * —`requestId`, `userId`, `attemptId`— va como propiedad. Las propiedades
 * siguen siendo consultables en Logs Insights y no cuestan por cardinalidad.
 *
 * Especificación completa:
 * https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html
 */

import { writeLine, type Level } from './logger.js'

/** Las unidades que usamos. La lista entera está en la especificación. */
export type MetricUnit = 'Count' | 'Milliseconds' | 'Seconds' | 'Percent' | 'None'

export interface Metric {
  name: string
  value: number
  unit?: MetricUnit
}

export interface MetricsInput {
  /** Qué se mide. Los valores no finitos se descartan. */
  metrics: Metric[]
  /**
   * Por qué se agrupa. **Baja cardinalidad, siempre**: cada valor distinto de
   * cada dimensión crea una métrica más en la factura.
   */
  dimensions?: Record<string, string>
  /**
   * Contexto que acompaña al número. Alta cardinalidad permitida: no genera
   * métricas, solo campos que Logs Insights puede consultar.
   */
  properties?: Record<string, unknown>
  /**
   * Además del corte por dimensiones, publicar la serie sin ninguna.
   *
   * La especificación permite un conjunto de dimensiones vacío, y eso da el
   * agregado de toda la API en una sola línea de la gráfica. Cuesta una
   * métrica más por nombre, no una por ruta.
   */
  total?: boolean
  /** Flujo en el que se escribe. Lo mismo que en el logger. */
  level?: Level
  /** Texto legible, para que la línea siga sirviendo como log. */
  message?: string
}

/** Namespace de la métrica. CDK lo inyecta; en local vale el de por defecto. */
const NAMESPACE = process.env.METRICS_NAMESPACE || 'QuizArena'

/** Interruptor para callar en local (`METRICS_ENABLED=false`). */
const ENABLED = process.env.METRICS_ENABLED !== 'false'

/** Una dimensión vacía o larguísima invalida el documento entero. */
const usableDimension = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 1024

/**
 * Escribe un documento EMF: una línea que es log y métrica a la vez.
 *
 * No se acumula nada en memoria ni se vacía al final: una llamada, una línea.
 * Un documento admite hasta 100 métricas y 30 dimensiones, muy por encima de
 * lo que usa esta aplicación.
 */
export function putMetrics({
  metrics,
  dimensions = {},
  properties = {},
  total = false,
  level = 'info',
  message,
}: MetricsInput): void {
  if (!ENABLED) return

  const values = metrics.filter((metric) => Number.isFinite(metric.value))
  if (values.length === 0) return

  const pairs = Object.entries(dimensions).filter(([, value]) => usableDimension(value))

  // `[["Route"], []]` publica la serie por ruta y el total de la API. Si no
  // hay dimensiones, el conjunto vacío es el único que tiene sentido.
  const sets: string[][] = []
  if (pairs.length > 0) sets.push(pairs.map(([key]) => key))
  if (total || pairs.length === 0) sets.push([])

  writeLine(level, {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: NAMESPACE,
          Dimensions: sets,
          Metrics: values.map(({ name, unit }) => ({
            Name: name,
            ...(unit ? { Unit: unit } : {}),
          })),
        },
      ],
    },
    level,
    ...(message ? { message } : {}),
    timestamp: new Date().toISOString(),
    // Las propiedades primero y los números después: así una propiedad mal
    // nombrada nunca puede pisar el valor de una métrica o de una dimensión,
    // que es lo que dejaría el documento sin sentido.
    ...properties,
    ...Object.fromEntries(pairs),
    ...Object.fromEntries(values.map(({ name, value }) => [name, value])),
  })
}

/** Atajo para el caso de una sola métrica. */
export const putMetric = (
  metric: Metric,
  rest: Omit<MetricsInput, 'metrics'> = {},
): void => putMetrics({ metrics: [metric], ...rest })
