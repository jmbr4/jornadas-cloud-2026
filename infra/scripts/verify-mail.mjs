/**
 * Alta y comprobación de las identidades de SES.
 *
 * Verificar un remitente es una tarea de alta, se hace una vez y termina
 * cuando una persona abre un correo o publica unos registros DNS. Por eso
 * NO está en el stack de CDK: `AWS::SES::EmailIdentity` deja el despliegue
 * bloqueado hasta que la verificación se completa, y eso dejaría cada
 * despliegue de la API a merced de una acción humana.
 *
 *   npm run verify:mail -- hola@tudominio.com
 *
 * Con --recipient da de alta solo la dirección, sin tocar su dominio. Sirve
 * para habilitar DESTINATARIOS mientras la cuenta esté en el sandbox de SES,
 * donde solo se puede escribir a direcciones verificadas:
 *
 *   npm run verify:mail -- alguien@gmail.com --recipient
 *
 * Es idempotente: si las identidades ya existen, solo informa del estado.
 */
import {
  SESv2Client,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  GetAccountCommand,
} from '@aws-sdk/client-sesv2'

const address = process.argv[2] ?? process.env.MAIL_FROM
if (!address?.includes('@')) {
  console.error('Uso: npm run verify:mail -- hola@tudominio.com')
  process.exit(1)
}

const onlyRecipient = process.argv.includes('--recipient')
const domain = address.split('@')[1]
const ses = new SESv2Client({})

console.log(`Región: ${await ses.config.region()}\n`)

const addressState = await ensureIdentity(address)
const domainState = onlyRecipient ? null : await ensureIdentity(domain, true)

console.log('\n─────────────────────────────────────────────────────────')
console.log(`Dirección  ${address}`)
console.log(`           ${describe(addressState)}`)
if (!addressState?.VerifiedForSendingStatus) {
  console.log(`           → Abre el correo de AWS enviado a ${address}`)
  console.log('             ("Amazon Web Services – Email Address Verification")')
}

if (!onlyRecipient) {
  console.log(`\nDominio    ${domain}`)
  console.log(`           ${describe(domainState)}`)
}

const tokens = domainState?.DkimAttributes?.Tokens ?? []
if (tokens.length && domainState?.DkimAttributes?.Status !== 'SUCCESS') {
  console.log(`           → Publica estos 3 CNAME en el DNS de ${domain}:\n`)
  for (const token of tokens) {
    console.log(`             ${token}._domainkey.${domain}`)
    console.log(`               CNAME  ${token}.dkim.amazonses.com\n`)
  }
}

const { ProductionAccessEnabled, SendQuota } = await ses.send(new GetAccountCommand({}))
console.log('─────────────────────────────────────────────────────────')
console.log(
  ProductionAccessEnabled
    ? `Cuenta en producción · ${SendQuota?.Max24HourSend} correos/día`
    : `Cuenta en SANDBOX · solo puedes escribir a direcciones tambien verificadas\n` +
      `           (máx. ${SendQuota?.Max24HourSend}/día). Para escribir a cualquiera, pide acceso\n` +
      `           de producción en la consola de SES: tarda en torno a 24 h.`,
)

async function ensureIdentity(identity, dkim = false) {
  try {
    await ses.send(
      new CreateEmailIdentityCommand({
        EmailIdentity: identity,
        ...(dkim
          ? { DkimSigningAttributes: { NextSigningKeyLength: 'RSA_2048_BIT' } }
          : {}),
      }),
    )
    console.log(`  creada  ${identity}`)
  } catch (error) {
    if (error.name !== 'AlreadyExistsException') throw error
    console.log(`  ya existe  ${identity}`)
  }
  return ses.send(new GetEmailIdentityCommand({ EmailIdentity: identity })).catch(() => null)
}

function describe(state) {
  if (!state) return 'no existe'
  if (state.VerifiedForSendingStatus) return '✓ verificada, puede enviar'
  return `pendiente (DKIM: ${state.DkimAttributes?.Status ?? '—'})`
}
