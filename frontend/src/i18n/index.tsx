import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import zh, { type Dict } from './zh'
import en from './en'

export type Lang = 'zh' | 'en'

const DICTS: Record<Lang, Dict> = { zh, en }
const STORAGE_KEY = 'lk-lang'

function detect(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'zh' || saved === 'en') return saved
  return String(navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

type FlatKey = Exclude<keyof Dict, 'wizard'>

interface I18nCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: FlatKey, vars?: Record<string, string | number>) => string
  wizardSteps: Dict['wizard']['steps']
}

const Ctx = createContext<I18nCtx | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detect)

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l)
    setLangState(l)
  }, [])

  const value = useMemo<I18nCtx>(() => {
    const dict = DICTS[lang]
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    document.title = dict.docTitle
    return {
      lang,
      setLang,
      t: (key, vars) => {
        let s: string = dict[key] ?? zh[key] ?? key
        if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', String(vars[k]))
        return s
      },
      wizardSteps: dict.wizard.steps,
    }
  }, [lang, setLang])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useI18n outside I18nProvider')
  return ctx
}
