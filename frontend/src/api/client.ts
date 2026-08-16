// Thin fetch wrapper: JSON in/out, throws Error with the server's message.

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(path, options)
  let body: unknown = null
  try {
    body = await resp.json()
  } catch {
    // non-JSON body (e.g. 204 No Content)
  }
  if (!resp.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `HTTP ${resp.status}`
    throw new Error(msg)
  }
  return body as T
}

export function postJSON(payload?: unknown): RequestInit {
  return payload === undefined
    ? { method: 'POST' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
}
