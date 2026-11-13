// Product rules shared with the server (keep in sync with Zarqa.Api).

/** Card/ID reports: photos never go to a model and stay private. Same regex as the server. */
// Arabic words take prefixes and suffixes (البطاقة, بطاقتي) and \b only knows ASCII, so they match as stems.
export const SENSITIVE_RE = /\b(cards?|ids?|i\.d|license|licence|passport|bank|atm|visa|mastercard|debit|credit|mulkiya|iqama)\b|بطاق|هوي[ةت]|جواز|رخص[ةت]|ملكي[ةت]|بنك|مصرف|صراف/i

export const isSensitiveText = (...texts: string[]) => texts.some((t) => SENSITIVE_RE.test(t))

export type Mode = 'lost' | 'found'

/** Greeting in campus time (Asia/Muscat), e.g. "Evening". */
export function partOfDay(now = new Date()): 'Morning' | 'Afternoon' | 'Evening' {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Muscat' }).format(now))
  if (hour >= 5 && hour < 12) return 'Morning'
  if (hour >= 12 && hour < 17) return 'Afternoon'
  return 'Evening'
}
