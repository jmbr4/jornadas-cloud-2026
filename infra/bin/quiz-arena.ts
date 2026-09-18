import { App } from 'aws-cdk-lib'
import { RetentionDays } from 'aws-cdk-lib/aws-logs'
import { ApiStack } from '../lib/api-stack.ts'
import { DataStack } from '../lib/data-stack.ts'
import { WebStack } from '../lib/web-stack.ts'
import { applyTags } from '../lib/tagging.ts'

const app = new App()

/** Lee `-c clave=valor` (o cdk.json), con valor por defecto. */
const context = (key: string, fallback: string): string => {
  const value: unknown = app.node.tryGetContext(key)
  return typeof value === 'string' && value !== '' ? value : fallback
}

const environment = context('environment', 'taller')
const prefix = `QuizArena-${environment}`

/**
 * El día 1 se despliega solo el frontend:
 *   cdk deploy QuizArena-taller-Web
 * El día 2 se añaden los datos y la API, y se enrutan junto al frontend:
 *   cdk deploy --all -c withApi=true
 */
const withApi = context('withApi', 'false') === 'true'

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-1',
}

const data = new DataStack(app, `${prefix}-Data`, {
  env,
  description: 'Quiz Arena — la tabla única de DynamoDB',
  // Con usuarios de verdad: -c destroyOnRemove=false, que además activa las
  // copias point-in-time.
  destroyOnRemove: context('destroyOnRemove', 'true') === 'true',
})

const api = new ApiStack(app, `${prefix}-Api`, {
  env,
  description: 'Quiz Arena — API Gateway y Lambdas (día 2)',
  // Mientras SES esté en sandbox, el token del enlace vuelve en la respuesta.
  returnMagicLinkToken: context('returnMagicLinkToken', 'true') === 'true',
  logRetention: RetentionDays.ONE_WEEK,
  // Tras CloudFront es el mismo origen y no hace falta CORS. Se activa solo
  // si se va a llamar a la API directamente (por ejemplo desde localhost).
  corsOrigins: withApi ? [] : ['*'],
  secondsPerQuestion: 20,
  speedBonusMax: 80,
  // Namespace de las métricas EMF. Las Lambdas no llaman a CloudWatch: lo
  // escriben en el log y CloudWatch las extrae de ahí.
  metricsNamespace: context('metricsNamespace', 'QuizArena'),
  table: data.table,
  // 20 req/s sostenidas, 40 de ráfaga. De sobra para un taller y suficiente
  // para que nadie use la API como cañón de correo.
  throttle: { rateLimit: Number(context('rateLimit', '20')), burstLimit: 40 },
  // Correo. Sin `mailFrom` no se envía nada y se sigue entrando con el token
  // de demostración:
  //   cdk deploy --all -c mailFrom=quiz@tudominio.com \
  //                    -c appUrl=https://dxxxx.cloudfront.net
  mailFrom: context('mailFrom', ''),
  // Enviar desde otra cuenta, la que ya tiene acceso de producción en SES:
  //   -c mailSenderRoleArn=arn:aws:iam::<cuenta>:role/QuizArenaSesSender
  mailSenderRoleArn: context('mailSenderRoleArn', ''),
  appUrl: context('appUrl', ''),
})

const domainName = context('domainName', '')
const certificateArn = context('certificateArn', '')

const web = new WebStack(app, `${prefix}-Web`, {
  env,
  description: 'Quiz Arena — S3 y CloudFront (día 1)',
  ...(withApi ? { apiDomainName: api.apiDomainName } : {}),
  // Dominio propio. El certificado se emite aparte (ACM en us-east-1) y aquí
  // solo se referencia:
  //   -c domainName=quiz.tudominio.com -c certificateArn=arn:aws:acm:us-east-1:...
  ...(domainName && certificateArn ? { domainName, certificateArn } : {}),
  // El bucket solo tiene el sitio compilado: se puede volver a subir siempre.
  destroyOnRemove: true,
})

applyTags(app, {
  project: 'QuizArena',
  environment,
  owner: context('owner', 'bettatech'),
  costCenter: context('costCenter', 'formacion'),
})

// Sin esto CloudFormation podría intentar crear la distribución antes que la
// API a la que apunta.
if (withApi) web.addDependency(api)
