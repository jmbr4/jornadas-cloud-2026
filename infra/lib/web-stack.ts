import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  HttpVersion,
  OriginRequestPolicy,
  PriceClass,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront'
import { HttpOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins'
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager'
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3'
import { BucketDeployment, CacheControl, Source } from 'aws-cdk-lib/aws-s3-deployment'
import type { Construct } from 'constructs'

export interface WebStackProps extends StackProps {
  /**
   * Dominio de la API. Si se pasa, la distribución enruta `/api/*` hacia ella
   * y el frontend puede usar `VITE_API_BASE_URL=/api`: mismo origen, cero CORS.
   * El día 1 se despliega sin esto.
   */
  apiDomainName?: string
  /** true en un taller: al destruir el stack se vacía y borra el bucket. */
  destroyOnRemove: boolean
  /**
   * Dominio propio y su certificado. Los dos o ninguno.
   *
   * El certificado NO se crea aquí: ACM valida por DNS y eso depende de que
   * alguien publique un registro — a menudo en otra cuenta. Un recurso que
   * espera a una persona no debe estar en el camino del despliegue, igual que
   * las identidades de SES. Se emite una vez y se pasa su ARN.
   */
  domainName?: string
  certificateArn?: string
}

const SITE = fileURLToPath(new URL('../../frontend/dist', import.meta.url))

/**
 * El frontend estático: bucket privado + CloudFront.
 *
 * El bucket NO es un "static website": no se publica, y solo CloudFront puede
 * leerlo a través de un Origin Access Control. Es la diferencia entre exponer
 * un bucket a internet y servirlo por CDN con control de acceso.
 */
export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props)

    if (!existsSync(SITE)) {
      throw new Error(
        `No existe ${SITE}. Compila el frontend antes de desplegar: npm run build:web`,
      )
    }

    const bucket = new Bucket(this, 'SiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: props.destroyOnRemove ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: props.destroyOnRemove,
    })

    const custom =
      props.domainName && props.certificateArn
        ? {
            domainNames: [props.domainName],
            certificate: Certificate.fromCertificateArn(
              this,
              'SiteCertificate',
              props.certificateArn,
            ),
          }
        : {}

    const distribution = new Distribution(this, 'Distribution', {
      comment: 'Quiz Arena — frontend del taller',
      defaultRootObject: 'index.html',
      ...custom,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          { function: this.spaFallback(), eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      httpVersion: HttpVersion.HTTP2_AND_3,
      // Solo Norteamérica y Europa: la clase de precios más barata.
      priceClass: PriceClass.PRICE_CLASS_100,
      // Sin `errorResponses` a propósito. Ver `spaFallback()`.
    })

    if (props.apiDomainName) {
      this.routeApi(distribution, props.apiDomainName)
    }

    this.deploySite(bucket, distribution)

    new CfnOutput(this, 'SiteUrl', {
      value: `https://${props.domainName ?? distribution.distributionDomainName}`,
      description: 'URL pública del frontend',
    })
    new CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'Destino del registro ALIAS/CNAME del dominio propio',
    })
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName })
    new CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'Para invalidar caché: aws cloudfront create-invalidation',
    })
  }

  /**
   * Resuelve las rutas de la SPA reescribiendo la petición, no capturando
   * errores.
   *
   * Lo evidente sería un *custom error response* 403/404 → `/index.html`.
   * Pero esa configuración es de TODA la distribución, no del comportamiento:
   * también se tragaría los 403 y 404 que devuelve la API en `/api/*` y se
   * los entregaría al navegador como una página HTML con código 200. El
   * cliente recibiría el index en vez de `{"message":"..."}` y ningún error
   * de la API se podría distinguir.
   *
   * Reescribiendo aquí, la regla vive solo en el comportamiento del sitio y
   * la API responde lo que tenga que responder.
   */
  private spaFallback(): CloudFrontFunction {
    return new CloudFrontFunction(this, 'SpaFallback', {
      comment: 'Sirve index.html en las rutas de la SPA',
      code: FunctionCode.fromInline(
        [
          'function handler(event) {',
          '  var request = event.request;',
          '  // Si la ruta no apunta a un fichero (no tiene extensión), es una',
          '  // ruta del router del navegador: se sirve el index y él decide.',
          "  if (request.uri.indexOf('.') === -1) request.uri = '/index.html';",
          '  return request;',
          '}',
        ].join('\n'),
      ),
    })
  }

  /**
   * Sube el sitio en dos tandas porque no todo se cachea igual:
   *
   *  - `assets/` lleva hash en el nombre de cada fichero. Si el contenido
   *    cambia, cambia el nombre, así que se puede cachear para siempre.
   *  - `index.html` NO lleva hash y es quien apunta a los assets nuevos. Si se
   *    cachea, el navegador sigue pidiendo la versión vieja después de cada
   *    despliegue.
   */
  private deploySite(bucket: Bucket, distribution: Distribution): void {
    new BucketDeployment(this, 'DeployAssets', {
      sources: [Source.asset(`${SITE}/assets`)],
      destinationBucket: bucket,
      destinationKeyPrefix: 'assets',
      cacheControl: [CacheControl.fromString('public, max-age=31536000, immutable')],
      prune: true,
    })

    new BucketDeployment(this, 'DeployRoot', {
      sources: [Source.asset(SITE, { exclude: ['assets/**'] })],
      destinationBucket: bucket,
      cacheControl: [CacheControl.fromString('no-cache')],
      // No borra assets/, que sube el despliegue anterior.
      prune: false,
      distribution,
      distributionPaths: ['/*'],
    })
  }

  /**
   * Cuelga la API de la misma distribución bajo `/api/*`.
   *
   * Mismo origen que el sitio, así que el navegador no hace preflight y no hay
   * CORS que configurar. La API no conoce el prefijo `/api`, de modo que una
   * CloudFront Function lo quita antes de llegar a API Gateway.
   */
  private routeApi(distribution: Distribution, apiDomainName: string): void {
    const stripPrefix = new CloudFrontFunction(this, 'StripApiPrefix', {
      comment: 'Quita /api antes de enviar la petición a API Gateway',
      code: FunctionCode.fromInline(
        [
          'function handler(event) {',
          '  var request = event.request;',
          "  request.uri = request.uri.replace(/^\\/api/, '') || '/';",
          '  return request;',
          '}',
        ].join('\n'),
      ),
    })

    distribution.addBehavior('/api/*', new HttpOrigin(apiDomainName), {
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: AllowedMethods.ALLOW_ALL,
      // Una API no se cachea…
      cachePolicy: CachePolicy.CACHING_DISABLED,
      // …y necesita que pase la cabecera Authorization. "ExceptHostHeader"
      // porque API Gateway rechaza las peticiones con un Host que no es el suyo.
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      functionAssociations: [
        { function: stripPrefix, eventType: FunctionEventType.VIEWER_REQUEST },
      ],
    })
  }
}
