import { createMagicLinkToken, isAdminEmail, isValidEmail } from '../../lib/auth.js'
import { config } from '../../lib/config.js'
import { badRequest, ok, parseBody, withErrors } from '../../lib/http.js'
import { describeError, logger } from '../../lib/logger.js'
import { sendMagicLink } from '../../lib/mailer.js'
import { putMetrics } from '../../lib/metrics.js'
import { getRepository } from '../../repository/factory.js'

interface Body {
  email?: string
}

/**
 * POST /auth/magic-link
 *
 * Emite un enlace de acceso de un solo uso. No revela si el correo existe:
 * la respuesta es la misma haya usuario o no, para no filtrar quién está dado
 * de alta.
 */
export const handler = withErrors('POST /auth/magic-link', async (event) => {
  const body = parseBody<Body>(event)
  const email = (body.email ?? '').trim().toLowerCase()

  if (!isValidEmail(email)) {
    throw badRequest('Escribe un correo válido para recibir el enlace.')
  }

  // El atajo del modo taller NUNCA se aplica a una cuenta de administración.
  //
  // Devolver el token en la respuesta es una comodidad para poder entrar sin
  // SES, pero significa que cualquiera puede pedir el token de cualquiera. En
  // una cuenta normal eso ya es malo; en la del administrador sería regalar
  // el panel de contenido a quien pase por ahí. Para esas direcciones el
  // enlace viaja solo por correo, se use o no el atajo para el resto.
  const demoAllowed = config.returnMagicLinkToken && !(await isAdminEmail(email))

  const repository = getRepository()
  const token = createMagicLinkToken()
  const expiresAt = new Date(Date.now() + config.magicLinkMinutes * 60_000).toISOString()

  await repository.saveMagicLink({ token, email, expiresAt })

  // El enlace se guarda antes de enviarlo: si SES falla, el usuario puede
  // reintentar y no queda un correo apuntando a un enlace que no existe.
  let sent = false
  try {
    sent = await sendMagicLink({
      to: email,
      token,
      expiresInMinutes: config.magicLinkMinutes,
    })
  } catch (error) {
    // La respuesta es la misma haya salido el correo o no.
    //
    // Devolver un error aquí convertiría esta ruta en un oráculo: comparando
    // respuestas se podría averiguar qué direcciones están verificadas en SES
    // y, sobre todo, cuál es la de administración (la única que nunca recibe
    // el token de demostración). El fallo se registra, que es donde tiene que
    // verse, y además lo cuentan las métricas de SES.
    logger.error('el correo no ha salido', { email, ...describeError(error) })
  }

  // La métrica que de verdad querrás alarmar. `MailFailures` se escribe
  // siempre, con 0 o con 1: una métrica que solo aparece cuando algo va mal
  // deja la alarma en INSUFFICIENT_DATA justo cuando todo funciona, y nadie
  // sabe si es que no falla o es que no se está midiendo.
  //
  // Sin dimensiones a propósito: el correo o sale o no sale, y agrupar por
  // dirección sería crear una métrica de pago por cada persona que entra.
  putMetrics({
    message: 'enlace mágico emitido',
    metrics: [
      { name: 'MagicLinksIssued', value: 1, unit: 'Count' },
      { name: 'MailFailures', value: sent || !config.mailFrom ? 0 : 1, unit: 'Count' },
    ],
    properties: { email, expiresAt, sent, demoAllowed },
  })

  return ok({
    sentTo: email,
    expiresInMinutes: config.magicLinkMinutes,
    // Solo en modo taller y nunca para un administrador. Con SES en marcha,
    // el token va por correo y no sale jamás por la API.
    ...(demoAllowed ? { demoToken: token } : {}),
  })
})
