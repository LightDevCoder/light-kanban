// Deterministic hash → hue, used for avatar fallback and workspace dots.

export function hashHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 360
}

export function workspaceColor(path: string): string {
  return `hsl(${hashHue(path)} 55% 55%)`
}

export function avatarColor(id: string): string {
  return `hsl(${hashHue(id)} 60% 45%)`
}
