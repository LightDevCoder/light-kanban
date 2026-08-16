// Display-only short id. The real id is a 32-char hex string used by the
// API; cards show a compact LK-XXXX token derived from its prefix.
export function shortId(id: string): string {
  return 'LK-' + id.replace(/[^a-f0-9]/gi, '').slice(0, 4).toUpperCase()
}
