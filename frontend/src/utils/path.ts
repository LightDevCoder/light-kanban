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
