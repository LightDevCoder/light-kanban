import { api, postJSON } from './client'

/** Opens the server's native folder dialog; resolves to '' when canceled. */
export function pickFolder(signal?: AbortSignal): Promise<{ path: string }> {
  return api<{ path: string }>('/api/fs/pick', { method: 'POST', signal })
}

/** Reveals a folder in the OS file manager on the server machine. */
export function openFolder(path: string): Promise<{ ok: string }> {
  return api<{ ok: string }>('/api/fs/open', postJSON({ path }))
}
