import { Tags } from 'aws-cdk-lib'
import type { IConstruct } from 'constructs'

/**
 * Esquema de etiquetado.
 *
 * Se aplica al App entero, así que lo hereda todo lo que CDK cree.
 *
 * IMPORTANTE para el día de costes: etiquetar no basta. Hay que activar cada
 * clave como *cost allocation tag* en Billing → Cost allocation tags, y desde
 * ese momento tarda en torno a 24 h en aparecer desglosado en Cost Explorer.
 * Si se etiqueta el mismo día que se analizan los costes, el informe sale
 * vacío: hay que hacerlo el primer día.
 */
export interface WorkshopTags {
  /** Qué aplicación es. Separa este gasto del resto de la cuenta. */
  project: string
  /** dev | pre | pro — o el nombre del taller. */
  environment: string
  /** A quién preguntar. */
  owner: string
  /** Centro de coste al que imputar. */
  costCenter: string
}

export function applyTags(scope: IConstruct, tags: WorkshopTags): void {
  Tags.of(scope).add('Project', tags.project)
  Tags.of(scope).add('Environment', tags.environment)
  Tags.of(scope).add('Owner', tags.owner)
  Tags.of(scope).add('CostCenter', tags.costCenter)
  Tags.of(scope).add('ManagedBy', 'CDK')
}
