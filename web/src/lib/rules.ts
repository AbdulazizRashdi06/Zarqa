// Product rules shared with the server (keep in sync with Zarqa.Api).

/** Card/ID reports: photos never go to a model and stay private. Same regex as the server (Categories.cs). */
// Arabic words take prefixes and suffixes (البطاقة, بطاقتي) and \b only knows ASCII, so they match as stems. Informal spellings
// count too: ه for ة (هويه, رخصه), كرت/كارت for card (not ذكرت "I mentioned", شكرت "I thanked"), فيزا, باسبور.
export const SENSITIVE_RE =
  /\b(cards?|ids?|i\.d|license|licence|passport|bank|atm|visa|mastercard|debit|credit|mulkiya|iqama)\b|بطاق|هوي[ةته]|جواز|رخص[ةته]|ملكي[ةته]|بنك|مصرف|صراف|(^|[^ذش])كرت|كارت|فيزا|باسبور/i

/** Things called "card" or "bank" that aren't ID or bank cards. Only the phrase is removed: "SIM card and my ID" still counts. Same list as the server. */
export const NOT_CARD_RE = /\b(power ?banks?|(micro ?)?sd ?cards?|sim ?cards?|memory ?cards?|graphics ?cards?|flash ?cards?|playing ?cards?)\b/gi

/** Arabic vowel marks and tatweel, zero-width and direction marks, soft hyphen. Same list as the server. */
export const INVISIBLE_RE = /[ً-ٰٟـ­​-‏‪-‮⁠-⁩﻿]/g

const spots = (text: string) => SENSITIVE_RE.test(text.replace(NOT_CARD_RE, ' '))

/** Checked as typed and again with marks and invisible characters taken out ("بِطـاقة"), so the clean-up only ever finds more cards. */
export const isSensitiveText = (...texts: string[]) => texts.some((t) => spots(t) || spots(t.normalize('NFKC').replace(INVISIBLE_RE, '')))

export type Mode = 'lost' | 'found'

/** Greeting in campus time (Asia/Muscat), e.g. "Evening". */
export function partOfDay(now = new Date()): 'Morning' | 'Afternoon' | 'Evening' {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Muscat' }).format(now))
  if (hour >= 5 && hour < 12) return 'Morning'
  if (hour >= 12 && hour < 17) return 'Afternoon'
  return 'Evening'
}
