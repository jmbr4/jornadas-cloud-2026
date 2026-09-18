import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers'
import { config } from './config.js'
import { logger, describeError } from './logger.js'

/**
 * Envío del enlace de acceso con Amazon SES.
 *
 * Si hay `MAIL_SENDER_ROLE_ARN`, el cliente asume ese rol y la llamada a SES
 * la hace la cuenta dueña del rol: son su acceso de producción y su cuota los
 * que cuentan. Sin él, envía la propia Lambda con sus credenciales.
 *
 * El cliente se crea una vez por contenedor, no por petición: así las
 * credenciales temporales se reutilizan y se renuevan solas al caducar, en
 * vez de pedir unas nuevas a STS en cada envío.
 */
let client: SESv2Client | null = null

const ses = () =>
  (client ??= new SESv2Client({
    region: config.mailRegion,
    ...(config.mailSenderRoleArn
      ? {
          credentials: fromTemporaryCredentials({
            params: {
              RoleArn: config.mailSenderRoleArn,
              RoleSessionName: 'quiz-arena-mailer',
              DurationSeconds: 3600,
            },
          }),
        }
      : {}),
  }))

export interface MagicLinkMail {
  to: string
  token: string
  expiresInMinutes: number
}

/**
 * Manda el correo y devuelve true si salió. Si SES no está configurado
 * (`MAIL_FROM` vacío) no hace nada y devuelve false: así el backend sigue
 * siendo utilizable en local y en modo taller sin depender de SES.
 */
export async function sendMagicLink({
  to,
  token,
  expiresInMinutes,
}: MagicLinkMail): Promise<boolean> {
  if (!config.mailFrom) return false

  const url = magicLinkUrl(token)

  try {
    await ses().send(
      new SendEmailCommand({
        FromEmailAddress: config.mailFrom,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: 'Tu acceso a Quiz Arena', Charset: 'UTF-8' },
            Body: {
              // Siempre las dos versiones: hay clientes de correo que no
              // muestran HTML, y un correo solo-HTML puntúa peor en los
              // filtros de spam.
              Text: { Data: textBody(url, expiresInMinutes), Charset: 'UTF-8' },
              Html: { Data: htmlBody(url, expiresInMinutes), Charset: 'UTF-8' },
            },
          },
        },
      }),
    )
    logger.info('correo enviado', { to, viaRole: config.mailSenderRoleArn || 'propia cuenta' })
    return true
  } catch (error) {
    logger.error('no se ha podido enviar el correo', { to, ...describeError(error) })
    throw error
  }
}

export const magicLinkUrl = (token: string): string =>
  `${config.appUrl}/acceso?token=${encodeURIComponent(token)}`

const textBody = (url: string, minutes: number) =>
  [
    'Entra en Quiz Arena',
    '',
    'Abre este enlace para acceder:',
    url,
    '',
    `Caduca en ${minutes} minutos y sirve una sola vez.`,
    'Si no has pedido tú este acceso, puedes ignorar este correo.',
  ].join('\n')

/**
 * HTML de correo: estilos en línea y nada de CSS externo ni flexbox. Los
 * clientes de correo no son navegadores.
 */
const htmlBody = (url: string, minutes: number) => `<!doctype html>
<html lang="es">
<body style="margin:0;padding:32px;background:#161826;color:#e9e9ed;font-family:Inter,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
    <tr><td style="padding-bottom:24px;letter-spacing:.14em;font-size:13px;text-transform:uppercase;color:#e9e9ed;">
      &#9889; Quiz Arena
    </td></tr>
    <tr><td style="padding-bottom:12px;font-size:24px;line-height:1.2;">Entra y compite</td></tr>
    <tr><td style="padding-bottom:24px;font-size:14px;line-height:1.5;color:#b2b6ca;">
      Pulsa el bot&oacute;n para acceder. El enlace caduca en ${minutes} minutos y sirve una sola vez.
    </td></tr>
    <tr><td style="padding-bottom:24px;">
      <a href="${url}" style="display:inline-block;padding:12px 20px;border:1px solid #9184d9;border-radius:8px;color:#e7e5fe;text-decoration:none;font-size:15px;">
        Acceder a Quiz Arena
      </a>
    </td></tr>
    <tr><td style="padding-bottom:8px;font-size:12px;color:#75798c;">
      Si el bot&oacute;n no funciona, copia esta direcci&oacute;n en el navegador:
    </td></tr>
    <tr><td style="padding-bottom:24px;font-size:12px;word-break:break-all;">
      <a href="${url}" style="color:#d2cefd;">${url}</a>
    </td></tr>
    <tr><td style="border-top:1px solid #3f424d;padding-top:16px;font-size:12px;color:#75798c;">
      Si no has pedido t&uacute; este acceso, puedes ignorar este correo.
    </td></tr>
  </table>
</body>
</html>`
