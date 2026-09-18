import { useMockApi } from '../config'
import type { QuizArenaApi } from './api'
import { MockApi } from './mock/mockApi'
import { HttpApi } from './http/httpApi'

/**
 * Único punto donde se decide de dónde salen los datos.
 * Sin VITE_API_BASE_URL => mock en memoria. Con ella => backend real.
 */
export const api: QuizArenaApi = useMockApi ? new MockApi() : new HttpApi()

export { ApiError } from './api'
export type { QuizArenaApi } from './api'
