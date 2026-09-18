import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { HttpApi, HttpMethod, CorsHttpMethod, type CfnStage } from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { Architecture, Code, Function as LambdaFunction, Runtime } from 'aws-cdk-lib/aws-lambda'
import {
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam'
import {
  Alarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  MathExpression,
  Metric,
  SingleValueWidget,
  Stats,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { Secret } from 'aws-cdk-lib/aws-secretsmanager'
import type { Table } from 'aws-cdk-lib/aws-dynamodb'
import type { Construct } from 'constructs'

export interface ApiStackProps extends StackProps {
  /** Modo taller: devuelve el token del enlace en la respuesta (sin SES). */
  returnMagicLinkToken: boolean
  /** Días que se guardan los logs. En un taller, pocos: cuestan dinero. */
  logRetention: RetentionDays
  /** Orígenes permitidos por CORS. Vacío = sin CORS (API tras CloudFront). */
  corsOrigins: string[]
  secondsPerQuestion: number
  speedBonusMax: number
  /** Techo de peticiones por segundo del stage, y ráfaga admitida. */
  throttle: { rateLimit: number; burstLimit: number }
  /**
   * Namespace de las métricas EMF que escriben las Lambdas.
   *
   * Las funciones no llaman a CloudWatch: escriben una línea de log con un
   * nodo `_aws` y CloudWatch extrae de ahí la métrica. Por eso esto es una
   * variable de entorno y no un permiso de IAM.
   */
  metricsNamespace: string
  /** La tabla única. Cada función recibe permiso solo sobre lo que necesita. */
  table: Table
  /**
   * Remitente verificado en SES. Vacío = no se envían correos y hace falta
   * `returnMagicLinkToken` para poder entrar.
   */
  mailFrom: string
  /**
   * Rol a asumir en otra cuenta para enviar. Vacío = envía esta misma cuenta
   * con su propia identidad verificada.
   */
  mailSenderRoleArn: string
  /**
   * Base pública del sitio, para el enlace del correo.
   *
   * Llega por contexto y no desde el stack web a propósito: el stack web ya
   * depende de este para enrutar /api/*, y pedirle a cambio su URL cerraría
   * un ciclo entre los dos stacks. Se pasa a mano y se acabó el problema.
   */
  appUrl: string
}

interface FunctionSpec {
  name: string
  method: string
  path: string
  entry: string
  auth: boolean
  /** Acceso que necesita a la tabla. De aquí sale su política de IAM. */
  access: 'read' | 'write'
  /** Si necesita permiso para enviar correo con SES. */
  sendsEmail: boolean
  /** Si necesita consultar quién es administrador. */
  readsAdmins: boolean
}

/** El mismo manifiesto que usa el empaquetado: una sola fuente de rutas. */
const MANIFEST = fileURLToPath(new URL('../../backend/functions.json', import.meta.url))
const BUNDLES = fileURLToPath(new URL('../../backend/dist/functions', import.meta.url))

/**
 * API Gateway (HTTP API) con una Lambda por ruta.
 *
 * Una función por ruta, y no un monolito con un router dentro, para que cada
 * una tenga su propio rol de IAM, sus propias métricas y su propio log group.
 * Cuando exista DynamoDB, cada función recibirá permiso solo sobre lo que
 * realmente toca.
 */
export class ApiStack extends Stack {
  readonly httpApi: HttpApi

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)

    const { functions } = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
      functions: FunctionSpec[]
    }

    this.httpApi = new HttpApi(this, 'HttpApi', {
      apiName: `${id}-http`,
      description: 'Quiz Arena — API del taller',
      ...(props.corsOrigins.length > 0
        ? {
            corsPreflight: {
              allowOrigins: props.corsOrigins,
              allowHeaders: ['authorization', 'content-type'],
              allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
              maxAge: Duration.hours(1),
            },
          }
        : {}),
    })

    // El secreto lo genera AWS y no pasa por aquí: no está en el repositorio,
    // ni en la plantilla, ni en la línea de comandos del despliegue. Las
    // Lambdas lo leen al arrancar en frío.
    const sessionSecret = new Secret(this, 'SessionSecret', {
      secretName: `${id}/session-secret`,
      description: 'Clave HMAC con la que se firman las sesiones de Quiz Arena',
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    })

    // La lista de administradores tampoco viaja como variable de entorno: en
    // la consola de Lambda se vería de un vistazo. Un correo no es un secreto
    // criptográfico, pero aquí queda fuera de la vista, con un permiso propio
    // y con cada lectura registrada en CloudTrail.
    //
    // Nace con un valor generado al azar, que no se parece a ningún correo:
    // hasta que alguien ponga la lista de verdad, no es administrador nadie.
    // El fallo seguro es el panel cerrado.
    const adminEmails = new Secret(this, 'AdminEmails', {
      secretName: `${id}/admin-emails`,
      description: 'Correos con permiso de administración, separados por comas',
    })

    const environment: Record<string, string> = {
      SESSION_SECRET_ARN: sessionSecret.secretArn,
      ADMIN_EMAILS_ARN: adminEmails.secretArn,
      SECONDS_PER_QUESTION: String(props.secondsPerQuestion),
      SPEED_BONUS_MAX: String(props.speedBonusMax),
      RETURN_MAGIC_LINK_TOKEN: String(props.returnMagicLinkToken),
      METRICS_NAMESPACE: props.metricsNamespace,
      REPOSITORY: 'dynamodb',
      TABLE_NAME: props.table.tableName,
      MAIL_FROM: props.mailFrom,
      MAIL_SENDER_ROLE_ARN: props.mailSenderRoleArn,
      APP_URL: props.appUrl,
    }

    // La función que envía correo tiene un rol con nombre fijo, no el
    // autogenerado con sufijo aleatorio: la cuenta de enfrente necesita poder
    // nombrarlo exactamente en su política de confianza.
    const mailerRole = new Role(this, 'MailerRole', {
      roleName: `${id}-mailer`,
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: 'Rol de la Lambda que envía el enlace de acceso',
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    })

    // Las identidades de SES NO se crean aquí a propósito. Ver `npm run verify:mail`.
    //
    // `AWS::SES::EmailIdentity` deja el despliegue en CREATE_IN_PROGRESS hasta
    // que la identidad queda verificada — es decir, hasta que una persona abre
    // un correo o publica unos registros DNS. Metido en este stack, cada
    // despliegue de la API quedaría rehén de eso, y si se agota el plazo,
    // CloudFormation revierte. Verificar un remitente es una tarea de alta que
    // se hace una vez; redesplegar Lambdas es algo de todos los días. No
    // pertenecen al mismo ciclo de vida.

    for (const spec of functions) {
      // Log group explícito: así la retención es parte de la plantilla y se
      // borra con el stack. Sin esto, Lambda crea el grupo por su cuenta, no
      // caduca nunca y sigue costando cuando el taller ha terminado.
      const logGroup = new LogGroup(this, `${spec.name}-logs`, {
        logGroupName: `/aws/lambda/${id}-${spec.name}`,
        retention: props.logRetention,
        removalPolicy: RemovalPolicy.DESTROY,
      })

      const fn = new LambdaFunction(this, spec.name, {
        functionName: `${id}-${spec.name}`,
        description: `${spec.method} ${spec.path}`,
        runtime: Runtime.NODEJS_22_X,
        // Graviton: mismo rendimiento, alrededor de un 20 % más barato.
        architecture: Architecture.ARM_64,
        handler: 'index.handler',
        code: Code.fromAsset(`${BUNDLES}/${spec.name}`),
        memorySize: 256,
        timeout: Duration.seconds(10),
        environment,
        logGroup,
        ...(spec.sendsEmail ? { role: mailerRole } : {}),
      })

      // Menos privilegio por función: las que solo leen no pueden escribir.
      // Se ve muy bien en la consola de IAM, rol por rol.
      if (spec.access === 'write') props.table.grantReadWriteData(fn)
      else props.table.grantReadData(fn)

      // Solo lo necesitan las que firman o comprueban una sesión. Las dos
      // rutas públicas de entrada no lo hacen... salvo auth-verify, que la
      // emite.
      if (spec.auth || spec.name === 'auth-verify') sessionSecret.grantRead(fn)
      if (spec.readsAdmins) adminEmails.grantRead(fn)

      // Solo la función que manda el enlace puede enviar correo.
      //
      // Con un rol de otra cuenta, aquí basta con poder asumirlo: el permiso
      // de SES vive en la política de ESE rol, en la cuenta que es dueña de
      // la identidad. Sin él, el permiso se concede aquí sobre la identidad
      // verificada en esta misma cuenta.
      if (spec.sendsEmail && props.mailSenderRoleArn) {
        fn.addToRolePolicy(
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['sts:AssumeRole'],
            resources: [props.mailSenderRoleArn],
          }),
        )
      } else if (spec.sendsEmail && props.mailFrom) {
        fn.addToRolePolicy(
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['ses:SendEmail'],
            resources: this.identityArns(props.mailFrom),
          }),
        )
      }

      this.httpApi.addRoutes({
        path: spec.path,
        methods: [spec.method as HttpMethod],
        integration: new HttpLambdaIntegration(`${spec.name}-integration`, fn),
      })
    }

    this.addAccessLogs(id, props.logRetention)
    this.addThrottling(props.throttle)
    this.addDashboard(id, props.metricsNamespace)

    new CfnOutput(this, 'AdminEmailsSecret', {
      value: adminEmails.secretName,
      description: 'Pon aquí la lista de administradores (nace cerrado)',
    })

    new CfnOutput(this, 'ApiUrl', {
      value: this.httpApi.apiEndpoint,
      description: 'URL base de la API (VITE_API_BASE_URL si no va tras CloudFront)',
    })
  }

  /**
   * El panel del día 3, construido sobre las métricas EMF de las Lambdas.
   *
   * Aquí no se crea ninguna métrica: las crea CloudWatch al leer las líneas
   * `_aws` que escribe `backend/src/lib/metrics.ts`. Este stack solo dice
   * cómo mirarlas. Por eso el panel aparece vacío hasta que alguien juega —
   * una métrica de EMF no existe hasta que se emite por primera vez.
   *
   * Las gráficas por set usan `SEARCH`, no una lista de sets: los sets los
   * carga `npm run seed` después de desplegar, así que la plantilla no puede
   * conocerlos. `SEARCH` resuelve en el momento de pintar y recoge también
   * los que se añadan mañana.
   */
  private addDashboard(id: string, namespace: string): void {
    const total = (metricName: string, statistic: string) =>
      new Metric({ namespace, metricName, statistic, period: Duration.minutes(5) })

    const bySet = (metricName: string, statistic: string, label: string) =>
      new MathExpression({
        expression: `SEARCH('{"${namespace}",setId} MetricName="${metricName}"', '${statistic}', 300)`,
        label,
        usingMetrics: {},
        period: Duration.minutes(5),
      })

    const byRoute = (metricName: string, statistic: string, label: string) =>
      new MathExpression({
        expression: `SEARCH('{"${namespace}",route} MetricName="${metricName}"', '${statistic}', 300)`,
        label,
        usingMetrics: {},
        period: Duration.minutes(5),
      })

    const dashboard = new Dashboard(this, 'Dashboard', {
      dashboardName: `${id}-panel`,
      defaultInterval: Duration.hours(3),
    })

    dashboard.addWidgets(
      // El número de peticiones no es una métrica: es el SampleCount de la
      // latencia. Medir la duración de algo ya cuenta cuántas veces pasó.
      new SingleValueWidget({
        title: 'De un vistazo',
        width: 24,
        height: 4,
        metrics: [
          total('Latency', Stats.SAMPLE_COUNT).with({ label: 'Peticiones' }),
          total('Latency', Stats.p(99)).with({ label: 'Latencia p99 (ms)' }),
          total('Faults', Stats.SUM).with({ label: 'Errores 5xx' }),
          total('AttemptScore', Stats.SAMPLE_COUNT).with({ label: 'Partidas terminadas' }),
          total('AnswerAccuracy', Stats.AVERAGE).with({ label: 'Aciertos (%)' }),
        ],
      }),
    )

    dashboard.addWidgets(
      new GraphWidget({
        title: 'Latencia de la API (ms)',
        width: 12,
        left: [
          total('Latency', Stats.AVERAGE).with({ label: 'media' }),
          total('Latency', Stats.p(90)).with({ label: 'p90' }),
          total('Latency', Stats.p(99)).with({ label: 'p99' }),
        ],
      }),
      new GraphWidget({
        title: 'Latencia p99 por ruta (ms)',
        width: 12,
        left: [byRoute('Latency', 'p99', 'p99')],
      }),
    )

    dashboard.addWidgets(
      new GraphWidget({
        title: 'Aciertos por set (%)',
        width: 12,
        leftYAxis: { min: 0, max: 100 },
        left: [bySet('AnswerAccuracy', 'Average', 'aciertos')],
      }),
      new GraphWidget({
        title: 'Puntuación media por set',
        width: 12,
        left: [bySet('AttemptScore', 'Average', 'puntos')],
      }),
    )

    dashboard.addWidgets(
      new GraphWidget({
        title: 'Enlaces de acceso',
        width: 12,
        left: [
          total('MagicLinksIssued', Stats.SUM).with({ label: 'emitidos' }),
          total('MailFailures', Stats.SUM).with({ label: 'correos fallidos' }),
        ],
      }),
      new GraphWidget({
        title: 'Errores 5xx por ruta',
        width: 12,
        left: [byRoute('Faults', 'Sum', 'fallos')],
      }),
    )

    // Una métrica que no dispara nada es un adorno. Esta es la que importa:
    // si el correo no sale, nadie entra, y la API responde 200 igual.
    //
    // `NOT_BREACHING` y no `MISSING` porque la métrica se emite con 0 cada vez
    // que alguien pide un enlace: un hueco significa que no ha entrado nadie,
    // no que el sistema esté roto.
    //
    // Sin acción de SNS a propósito: suscribir un correo exige que alguien
    // confirme desde su bandeja, y eso no cabe en un despliegue. En el taller
    // se ve el cambio a ALARM en la consola; en producción, aquí iría un
    // `addAlarmAction(new SnsAction(topic))`.
    new Alarm(this, 'MailFailuresAlarm', {
      alarmName: `${id}-correo-no-sale`,
      alarmDescription: 'El enlace de acceso no está saliendo por SES',
      metric: new Metric({
        namespace,
        metricName: 'MailFailures',
        statistic: Stats.SUM,
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })

    new CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards/dashboard/${dashboard.dashboardName}`,
      description: 'Panel de CloudWatch con las métricas EMF (día 3)',
    })
  }

  /**
   * ARNs de identidad que autorizan a enviar desde `mailFrom`.
   *
   * SES acepta dos formas de verificar un remitente, y el ARN es distinto en
   * cada una: la dirección suelta (`identity/quiz@ejemplo.com`) o el dominio
   * entero (`identity/ejemplo.com`, que cubre cualquier buzón de ese dominio).
   * Como no sabemos cuál habrán usado, se conceden ambas: si una no existe,
   * simplemente nunca llega a aplicarse.
   */
  private identityArns(mailFrom: string): string[] {
    const identity = (name: string) =>
      this.formatArn({ service: 'ses', resource: 'identity', resourceName: name })

    const domain = mailFrom.split('@').pop() ?? mailFrom
    return [...new Set([mailFrom, domain])].map(identity)
  }

  /** Dominio del endpoint por defecto, para usarlo como origen de CloudFront. */
  get apiDomainName(): string {
    return `${this.httpApi.apiId}.execute-api.${this.region}.${this.urlSuffix}`
  }

  /**
   * Techo de peticiones en el stage.
   *
   * Sin esto, cualquiera puede llamar a `/auth/magic-link` en bucle con
   * direcciones ajenas: gasta tu cuota de SES, te quema la reputación de
   * remitente y convierte tu API en una herramienta para molestar a terceros.
   * Un límite global es tosco pero para de golpe lo peor; el siguiente paso
   * sería un límite por dirección IP con WAF, y por correo en la propia
   * aplicación.
   */
  private addThrottling(throttle: { rateLimit: number; burstLimit: number }): void {
    const stage = this.httpApi.defaultStage?.node.defaultChild as CfnStage | undefined
    if (!stage) return
    stage.defaultRouteSettings = {
      throttlingRateLimit: throttle.rateLimit,
      throttlingBurstLimit: throttle.burstLimit,
    }
  }

  /**
   * Logs de acceso del stage. No vienen activados por defecto, y son la mitad
   * de la historia el día de observabilidad: la Lambda cuenta qué hizo el
   * código, esto cuenta qué llegó a la puerta (incluido lo que nunca llegó a
   * ejecutar una función: 404, 403, límites).
   */
  private addAccessLogs(id: string, retention: RetentionDays): void {
    const accessLogs = new LogGroup(this, 'AccessLogs', {
      logGroupName: `/aws/apigateway/${id}`,
      retention,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const stage = this.httpApi.defaultStage?.node.defaultChild as CfnStage | undefined
    if (!stage) return

    stage.accessLogSettings = {
      destinationArn: accessLogs.logGroupArn,
      // JSON, para que Logs Insights pueda consultar campo a campo.
      format: JSON.stringify({
        requestId: '$context.requestId',
        ip: '$context.identity.sourceIp',
        method: '$context.httpMethod',
        route: '$context.routeKey',
        status: '$context.status',
        latencyMs: '$context.responseLatency',
        integrationStatus: '$context.integration.status',
        integrationErrorMessage: '$context.integrationErrorMessage',
      }),
    }
  }
}
