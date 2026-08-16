// Workspace path helpers. Cards show only the basename; the full path lives
// in the drawer / edit form.

/** basename of a workspace path, tolerant of / and \ separators. */
export function workspaceName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  if (!trimmed) return path
  const parts = trimmed.split(/[\\/]/).filter(Boolean)
  const last = parts[parts.length - 1]
  // Windows drive root like "C:" — there is no meaningful basename.
  if (!last || /^[A-Za-z]:$/.test(last)) return trimmed
  return last
}

/** A path the server will accept as absolute (POSIX or Windows). */
export function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)
}

/** Parent of an absolute path ('' = show roots). Handles C:\ and / styles. */
export function parentOf(path: string): string {
  if (!path) return ''
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  parts.pop()
  if (!parts.length) return ''
  if (/^[A-Za-z]:$/.test(parts[0])) return parts[0] + ':\\'
  return '/' + parts.join('/')
}
