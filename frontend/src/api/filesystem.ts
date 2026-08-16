import { api, postJSON } from './client'

export interface DirsResponse {
  path: string
  dirs: string[]
}

export function browseDirs(path: string): Promise<DirsResponse> {
  const q = path ? `?path=${encodeURIComponent(path)}` : ''
  return api<DirsResponse>(`/api/fs/dirs${q}`)
}

/** Opens the server's native folder dialog; resolves to '' when canceled. */
export function pickFolder(): Promise<{ path: string }> {
  return api<{ path: string }>('/api/fs/pick', { method: 'POST' })
}

/** Reveals a folder in the OS file manager on the server machine. */
export function openFolder(path: string): Promise<{ ok: string }> {
  return api<{ ok: string }>('/api/fs/open', postJSON({ path }))
}
