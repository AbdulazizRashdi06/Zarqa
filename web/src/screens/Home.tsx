import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useSession } from '../auth/session'
import { AlertsNudge } from '../components/AlertsNudge'
import { ArrowRight, Camera, ChatBubble, Lock, Pin, TagIcon } from '../components/icons'
import { Avatar, BigButton, LuggageTag, MonoLabel, RoundButton, Sticker, Switch, TearLine, Ticket, Wordmark, ZarqaBubble } from '../components/ui'
import { t, tm, type StringKey } from '../i18n'
import { api, apiForm, ApiError } from '../lib/api'
import { muscatNow } from '../lib/dates'
import { shrinkPhoto } from '../lib/images'
import { isSensitiveText, partOfDay, type Mode } from '../lib/rules'
import type { HomeSummary, Report } from '../lib/types'
import s from './Home.module.css'

type Place = { name: string; aliases: string[] }

const MAX_PHOTOS = 4
const TILTS = [-3, 2, -1.5, 2.5]
type PickedPhoto = { blob: Blob; url: string }

const accentOf = (mode: Mode) => (mode === 'lost' ? 'var(--tan)' : 'var(--sage)')

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
  const { me } = useSession()
  const firstName = me?.firstName ?? ''
  const [mode, setMode] = useState<Mode>('lost')
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [locQuery, setLocQuery] = useState('')
  const [locOpen, setLocOpen] = useState(false)
  const [places, setPlaces] = useState<Place[]>([])
  const now = useMemo(() => muscatNow(), [])
  const [date, setDate] = useState(now.date)
  // When is optional: hidden until the user says they know. Time stays optional even then.
  const [knowsWhen, setKnowsWhen] = useState(false)
  const [time, setTime] = useState('')
  // A name picked from the campus list; typing again turns it back into free text.
  const [placeName, setPlaceName] = useState<string | null>(null)
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<HomeSummary | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api<HomeSummary>('/home').then(setSummary).catch(() => setSummary(null))
  }, [])

  async function addPhotos(files: FileList | null) {
    if (!files) return
    const room = MAX_PHOTOS - photos.length
    const picked = await Promise.all(
      [...files].slice(0, room).map(async (f) => {
        const blob = await shrinkPhoto(f)
        return { blob, url: URL.createObjectURL(blob) }
      }),
    )
    setPhotos((p) => [...p, ...picked])
  }

  function removePhoto(i: number) {
    setPhotos((p) => {
      URL.revokeObjectURL(p[i].url)
      return p.filter((_, j) => j !== i)
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const form = new FormData()
    form.set('kind', mode)
    form.set('category', category)
    form.set('title', title)
    form.set('description', description)
    if (placeName) form.set('locationName', placeName)
    else form.set('locationText', locQuery)
    if (knowsWhen) {
      form.set('eventDate', date)
      if (time) form.set('eventTime', time)
    }
    photos.forEach((p, i) => form.append('photos', p.blob, `photo-${i + 1}.jpg`))
    try {
      const report = await apiForm<Report>('/reports', form)
      photos.forEach((p) => URL.revokeObjectURL(p.url))
      navigate('/reports', { state: { posted: report.kind } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

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
        <Wordmark size={46} />
        <div className={s.headerRight}>
          <RoundButton to="/chats" label={t('home.chats')} badge={summary?.unreadChats}>
            <ChatBubble size={20} />
          </RoundButton>
          <Avatar name={firstName || 'Z'} photoUrl={me?.avatarUrl} to="/profile" label={t('home.profile')} ring />
        </div>
      </header>

      <div className={s.hello}>
        {/* Zarqa keeps watch beside the headline: looking out for lost things, pleased about found ones. */}
        <img
          src={mode === 'lost' ? '/mascot/home-searching.webp' : '/mascot/home-found-keys.webp'}
          alt=""
          aria-hidden="true"
          className={s.helloMascot}
        />
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
          <span className={s.reportsMeta}>
            {t('home.reportsMeta', { active: summary?.active ?? 0 })}
            {summary && summary.matchesWaiting > 0 && (
              <span style={{ color: 'var(--tan)' }}> · {t('home.reportsWaiting', { n: summary.matchesWaiting })}</span>
            )}
          </span>
        </span>
        <span className={s.reportsArrow}>
          <ArrowRight size={20} color="var(--ink)" />
        </span>
        {summary && summary.matchesWaiting > 0 && (
          <span className={s.reportsSticker}>
            <Sticker>{t('home.spotted')}</Sticker>
          </span>
        )}
      </Link>

      {me?.matchAlerts && <AlertsNudge />}

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
        <form className={s.form} onSubmit={submit} noValidate>
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
              <span className={s.count}>
                {photos.length}/{MAX_PHOTOS}
              </span>
            </div>
            <div className={s.photos}>
              {photos.map((p, i) => (
                <div key={p.url} className={s.photoSlot} style={{ transform: `rotate(${TILTS[i]}deg)`, borderStyle: 'solid' }}>
                  <img src={p.url} alt="" className={s.photoImg} />
                  <button type="button" className={s.photoRemove} aria-label={t('form.removePhoto')} onClick={() => removePhoto(i)}>
                    ×
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  aria-label={t('form.addPhoto')}
                  className={s.photoAdd}
                  style={{ transform: `rotate(${TILTS[photos.length]}deg)` }}
                  onClick={() => fileInput.current?.click()}
                >
                  <Camera size={24} color="var(--ink)" />
                  {tm('form.photoCta', mode)}
                </button>
              )}
              {Array.from({ length: Math.max(0, MAX_PHOTOS - photos.length - 1) }, (_, i) => (
                <div key={i} className={s.photoSlot} style={{ transform: `rotate(${TILTS[photos.length + 1 + i]}deg)` }} />
              ))}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  void addPhotos(e.target.files)
                  e.target.value = ''
                }}
              />
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
                  setPlaceName(null)
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
                      setPlaceName(p.name)
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
            <div className={s.fieldLabel}>
              <span className={s.num}>06</span>
              <span id="knows-when-label">{tm('form.when', mode)}</span>
              <span className={s.whenToggle}>
                <Switch checked={knowsWhen} onChange={setKnowsWhen} label={t('form.when.toggle')} />
              </span>
            </div>
            {knowsWhen && (
            <div className={s.when}>
              <label className={s.whenBox}>
                <span className={s.whenLabel}>{t('form.date')}</span>
                <span className={s.whenValue}>{formatDate(date, now.date)}</span>
                <input type="date" className={s.whenNative} value={date} max={now.date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              </label>
              <label className={s.whenBox}>
                <span className={s.whenLabel}>{t('form.time')}</span>
                <span className={s.whenValue} style={time ? undefined : { color: 'var(--ink-muted)' }}>
                  {time ? formatTime(time) : t('form.time.none')}
                </span>
                <input type="time" className={s.whenNative} value={time} onChange={(e) => setTime(e.target.value)} aria-label={t('form.time.pick')} />
                {time && (
                  <button type="button" className={s.whenClear} aria-label={t('form.time.clear')} onClick={() => setTime('')}>
                    ×
                  </button>
                )}
              </label>
            </div>
            )}
          </div>

          <TearLine />

          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <BigButton
            type="submit"
            variant="dark"
            accent={accent}
            label={busy ? t('form.posting') : tm('form.submit', mode)}
            labelSize={28}
            disabled={busy || !title.trim() || !category.trim()}
          />
        </form>
      </Ticket>
    </main>
  )
}
