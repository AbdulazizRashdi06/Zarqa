import en from './en.json'

// All UI strings live in en.json. Arabic (and RTL) comes after the pilot as ar.json.
export type StringKey = keyof typeof en

/** Looks up a string and fills `{name}` placeholders. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const s: string = en[key]
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : s
}

/** For keys that vary by Lost/Found mode, e.g. tm('form.name', mode) → 'form.name.lost'. */
export function tm(prefix: string, mode: 'lost' | 'found'): string {
  return t(`${prefix}.${mode}` as StringKey)
}
