import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { AttributeType, BillingMode, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb'
import type { Construct } from 'constructs'

export interface DataStackProps extends StackProps {
  /**
   * true en un taller: `cdk destroy` se lleva también los datos y se ahorra
   * el coste de las copias.
   *
   * Con usuarios de verdad tiene que ser **false**: la tabla queda con
   * `RETAIN` (destruir el stack no borra los datos) y se activa
   * point-in-time recovery, que permite restaurar a cualquier segundo de los
   * últimos 35 días.
   */
  destroyOnRemove: boolean
}

/**
 * La tabla única de Quiz Arena, en su propio stack.
 *
 * Separada del cómputo a propósito: las Lambdas se redespliegan muchas veces
 * al día y los datos tienen que sobrevivir a eso. Un stack aparte hace que sea
 * imposible borrar la tabla por accidente al tocar el backend.
 *
 * El mapa de claves está en `db/src/keys.ts`, y el porqué en `db/README.md`.
 */
export class DataStack extends Stack {
  readonly table: Table

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props)

    this.table = new Table(this, 'Table', {
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      // On-demand: un taller tiene tráfico a ráfagas y así no se paga
      // capacidad parada entre sesión y sesión.
      billingMode: BillingMode.PAY_PER_REQUEST,
      // Clave propiedad de AWS: cifrado en reposo sin coste y sin clave que
      // gestionar. AWS_MANAGED y CUSTOMER_MANAGED cifran igual pero añaden
      // cargos de KMS por petición, que aquí no compran nada.
      encryption: TableEncryption.DEFAULT,
      // Los enlaces mágicos se borran solos al caducar. El borrado por TTL no
      // cuesta capacidad de escritura: es la forma barata de no acumular
      // basura que se pagaría para siempre.
      timeToLiveAttribute: 'expiresAtEpoch',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: !props.destroyOnRemove },
      removalPolicy: props.destroyOnRemove ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    })

    // El índice que ordena las marcas por puntuación. En la tabla base la sort
    // key de una marca es el usuario, así que ordenar por puntos es justo lo
    // que la tabla no sabe hacer: de ahí el GSI.
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: AttributeType.NUMBER },
    })

    new CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'Tabla única (TABLE_NAME de las Lambdas, y del script de carga)',
    })
  }
}
