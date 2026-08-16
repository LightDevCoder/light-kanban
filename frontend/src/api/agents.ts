import { api } from './client'
import type { Agent } from '../types'

export function listAgents(): Promise<Agent[]> {
  return api<Agent[]>('/api/agents')
}
