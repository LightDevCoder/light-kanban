import type { Dict } from './zh'

// Flat dictionary key union — the zh dictionary is the schema, en must match
// (tsc enforces it). Components use this type to keep t() key-safe.
export type I18nKey = keyof Dict
