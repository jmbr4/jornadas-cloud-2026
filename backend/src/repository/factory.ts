import { config } from '../lib/config.js'
import type { QuizRepository } from './index.js'
import { MemoryRepository } from './memory/memoryRepository.js'
import { DynamoRepository } from '../../../db/src/dynamoRepository.js'

let instance: QuizRepository | null = null

/**
 * Única función que decide la implementación. Se cachea entre invocaciones
 * porque el contenedor de Lambda se reutiliza: el cliente de la base de datos
 * se crea una vez por contenedor, no una vez por petición.
 *
 * Cuando exista la implementación de DynamoDB, aquí entra su rama.
 */
export function getRepository(): QuizRepository {
  if (instance) return instance

  switch (config.repository) {
    case 'dynamodb':
      instance = new DynamoRepository(config.tableName)
      return instance
    case 'memory':
    default:
      instance = new MemoryRepository()
      return instance
  }
}

/** Solo para tests: fuerza una implementación concreta. */
export function setRepository(repository: QuizRepository | null): void {
  instance = repository
}
