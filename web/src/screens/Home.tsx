import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Camera, ChatBubble, Lock, Pin, TagIcon } from '../components/icons'
import { Avatar, BigButton, LuggageTag, MonoLabel, RoundButton, TearLine, Ticket, Wordmark, ZarqaBubble } from '../components/ui'
import { t, tm, type StringKey } from '../i18n'
import { isSensitiveText, partOfDay, type Mode } from '../lib/rules'
import s from './Home.module.css'

type Place = { name: string; aliases: string[] }

const accentOf = (mode: Mode) => (mode === 'lost' ? 'var(--tan)' : 'var(--sage)')

/** Today's date and the current time in campus time, as <input type=date|time> values. */
function muscatNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Muscat',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

function formatDate(date: string, today: string) {
  const d = new Date(`${date}T12:00:00`)
  const dayMonth = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
  return date === today ? `${t('form.today')} · ${dayMonth}` : dayMonth
}

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  const hour12 = ((h + 11) % 12) + 1
  return `~ ${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export default function Home() {
  // Placeholder user until sign-in lands (step 2).
  const firstName = 'there'
  const [mode, setMode] = useState<Mode>('lost')
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [locQuery, setLocQuery] = useState('')
  const [locOpen, setLocOpen] = useState(false)
  const [places, setPlaces] = useState<Place[]>([])
  const now = useMemo(() => muscatNow(), [])
  const [date, setDate] = useState(now.date)
  const [time, setTime] = useState(now.time)

  useEffect(() => {
    fetch('/api/locations')
      .then((r) => (r.ok ? r.json() : []))
      .then(setPlaces)
      .catch(() => setPlaces([]))
  }, [])

  const suggestions = useMemo(() => {
    const q = locQuery.trim().toLowerCase()
    const hits = q
      ? places.filter((p) => p.name.toLowerCase().includes(q) || p.aliases.some((a) => a.toLowerCase().includes(q)))
      : places
    return hits.slice(0, 5)
  }, [places, locQuery])

  const accent = accentOf(mode)
  const showCardNotice = isSensitiveText(category)

  return (
    <main className={s.page}>
      <header className={s.header}>
        <Wordmark />
        <div className={s.headerRight}>
          <RoundButton to="/chats" label={t('home.chats')}>
            <ChatBubble size={20} />
          </RoundButton>
          <Avatar name={firstName === 'there' ? 'Z' : firstName} to="/profile" label={t('home.profile')} ring />
        </div>
      </header>

      <div className={s.hello}>
        <span className={s.greeting}>
          {partOfDay()}, {firstName}
        </span>
        <h1 className={s.headline}>
          {tm('home.headA', mode)}
          <br />
          <span style={{ color: accent }}>{tm('home.headB', mode)}</span>
        </h1>
      </div>

      <Link to="/reports" className={s.reportsBar}>
        <span className={s.reportsIcon}>
          <TagIcon size={26} color="var(--ink)" />
        </span>
        <span className={s.reportsText}>
          <span className={s.reportsTitle}>{t('home.myReports')}</span>
          <span className={s.reportsMeta}>{t('home.reportsMeta', { active: 0 })}</span>
        </span>
        <span className={s.reportsArrow}>
          <ArrowRight size={20} color="var(--ink)" />
        </span>
      </Link>

      <div className={s.modes}>
        {(['lost', 'found'] as const).map((m, i) => {
          const on = m === mode
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              className={s.modeBtn}
              onClick={() => setMode(m)}
              style={{ transform: on ? `rotate(${m === 'lost' ? -3 : 3}deg)` : undefined }}
            >
              <LuggageTag
                className={s.modeTag}
                style={{ background: on ? accentOf(m) : 'var(--surface)', color: on ? 'var(--ink)' : 'var(--text-muted)' }}
              >
                <MonoLabel>TAG 0{i + 1}</MonoLabel>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span className={s.modeBig}>{t(`home.mode.${m}.big` as StringKey)}</span>
                  <span className={s.modeSmall}>{t(`home.mode.${m}.small` as StringKey)}</span>
                </span>
              </LuggageTag>
            </button>
          )
        })}
      </div>

      <div className={s.zarqa}>
        <ZarqaBubble mascot="thinking" alt="Zarqa thinking">
          {tm('home.zarqa', mode)}
        </ZarqaBubble>
      </div>

      <Ticket>
        <form className={s.form} onSubmit={(e) => e.preventDefault()}>
          <div className={s.formTop}>
            <span className={s.reportTag} style={{ background: accent }}>
              {tm('form.tag', mode)}
            </span>
            <MonoLabel color="var(--ink-muted)">{t('form.campus')}</MonoLabel>
          </div>

          <div className={s.field}>
            <div className={s.fieldLabel}>
              <span className={s.num}>01</span>
              {tm('form.photos', mode)}
              <span className={s.count}>0/4</span>
            </div>
            <div className={s.photos}>
              <button type="button" aria-label={t('form.addPhoto')} className={s.photoAdd} style={{ transform: 'rotate(-3deg)' }}>
                <Camera size={24} color="var(--ink)" />
                {tm('form.photoCta', mode)}
              </button>
              {[2, -1.5, 2.5].map((r) => (
                <div key={r} className={s.photoSlot} style={{ transform: `rotate(${r}deg)` }} />
              ))}
            </div>
          </div>

          <div className={s.field}>
            <label htmlFor="item-cat" className={s.fieldLabel}>
              <span className={s.num}>02</span>
              {t('form.category')}
            </label>
            <input
              id="item-cat"
              className={s.input}
              autoComplete="off"
              maxLength={60}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('form.category.placeholder')}
            />
            {showCardNotice && (
              <div className={s.notice} role="note">
                <Lock size={22} color="var(--tan)" />
                <div className={s.noticeBody}>
                  <MonoLabel color="var(--tan)">{t('form.cardNotice.title')}</MonoLabel>
                  <span>{t('form.cardNotice.body')}</span>
                </div>
              </div>
            )}
          </div>

          <div className={s.field}>
            <label htmlFor="item-name" className={s.fieldLabel}>
              <span className={s.num}>03</span>
              {tm('form.name', mode)}
            </label>
            <input
              id="item-name"
              className={s.input}
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tm('form.name.placeholder', mode)}
            />
          </div>

          <div className={s.field}>
            <label htmlFor="item-desc" className={s.fieldLabel}>
              <span className={s.num}>04</span>
              {t('form.description')}
            </label>
            <textarea
              id="item-desc"
              className={s.textarea}
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('form.description.placeholder')}
            />
          </div>

          <div className={s.field}>
            <label htmlFor="item-loc" className={s.fieldLabel}>
              <span className={s.num}>05</span>
              {tm('form.where', mode)}
            </label>
            <div className={s.locWrap}>
              <span className={s.locIcon}>
                <Pin size={20} color="var(--ink)" />
              </span>
              <input
                id="item-loc"
                type="search"
                className={s.locInput}
                autoComplete="off"
                maxLength={120}
                value={locQuery}
                onChange={(e) => {
                  setLocQuery(e.target.value)
                  setLocOpen(true)
                }}
                onFocus={() => setLocOpen(true)}
                onBlur={() => setTimeout(() => setLocOpen(false), 150)}
                placeholder={t('form.where.placeholder')}
              />
            </div>
            {locOpen && suggestions.length > 0 && (
              <div className={s.suggest}>
                {suggestions.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className={s.suggestItem}
                    onClick={() => {
                      setLocQuery(p.name)
                      setLocOpen(false)
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={s.field}>
            <span className={s.fieldLabel}>
              <span className={s.num}>06</span>
              {tm('form.when', mode)}
            </span>
            <div className={s.when}>
              <label className={s.whenBox}>
                <span className={s.whenLabel}>{t('form.date')}</span>
                <span className={s.whenValue}>{formatDate(date, now.date)}</span>
                <input type="date" className={s.whenNative} value={date} max={now.date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              </label>
              <label className={s.whenBox}>
                <span className={s.whenLabel}>{t('form.time')}</span>
                <span className={s.whenValue}>{formatTime(time)}</span>
                <input type="time" className={s.whenNative} value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
              </label>
            </div>
          </div>

          <TearLine />

          <BigButton type="submit" variant="dark" accent={accent} label={tm('form.submit', mode)} labelSize={28} />
        </form>
      </Ticket>
    </main>
  )
}
