import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useSession } from '../auth/session'
import { AlertsNudge } from '../components/AlertsNudge'
import { ArrowRight, Camera, ChatBubble, Close, Lock, Pin, TagIcon } from '../components/icons'
import { Avatar, BigButton, LuggageTag, MonoLabel, RoundButton, Sticker, Switch, TearLine, Ticket, Wordmark } from '../components/ui'
import { t, tm, type StringKey } from '../i18n'
import { api, apiForm, ApiError } from '../lib/api'
import { muscatNow } from '../lib/dates'
import { clearDraft, loadFields, loadPhotos, saveFields, savePhotos } from '../lib/draft'
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

const toPicked = (blob: Blob): PickedPhoto => ({ blob, url: URL.createObjectURL(blob) })

export default function Home() {
  const { me } = useSession()
  const firstName = me?.firstName ?? ''
  const now = useMemo(() => muscatNow(), [])
  const draft = useMemo(() => loadFields(), [])
  const [mode, setMode] = useState<Mode>(draft.mode ?? 'lost')
  // One box: what it is plus every detail. The server and the matcher work from this one text.
  const [text, setText] = useState(draft.text ?? '')
  const [locQuery, setLocQuery] = useState(draft.locQuery ?? '')
  const [locOpen, setLocOpen] = useState(false)
  const [activeOpt, setActiveOpt] = useState(-1)
  const [places, setPlaces] = useState<Place[]>([])
  const [date, setDate] = useState(draft.date && draft.date <= now.date ? draft.date : now.date)
  // When is optional: hidden until the user says they know. Time stays optional even then.
  const [knowsWhen, setKnowsWhen] = useState(draft.knowsWhen ?? false)
  const [time, setTime] = useState(draft.time ?? '')
  // A name picked from the campus list; typing again turns it back into free text.
  const [placeName, setPlaceName] = useState<string | null>(draft.placeName ?? null)
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [photosLoaded, setPhotosLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<HomeSummary | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const textBox = useRef<HTMLTextAreaElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api<HomeSummary>('/home').then(setSummary).catch(() => setSummary(null))
  }, [])

  useEffect(() => {
    fetch('/api/locations')
      .then((r) => (r.ok ? r.json() : []))
      .then(setPlaces)
      .catch(() => setPlaces([]))
  }, [])

  // Bring back photos from an unfinished draft.
  useEffect(() => {
    let live = true
    loadPhotos().then((blobs) => {
      if (!live) return
      setPhotos((p) => (p.length ? p : blobs.slice(0, MAX_PHOTOS).map(toPicked)))
      setPhotosLoaded(true)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    saveFields({ mode, text, locQuery, placeName, knowsWhen, date, time })
  }, [mode, text, locQuery, placeName, knowsWhen, date, time])

  useEffect(() => {
    if (photosLoaded) void savePhotos(photos.map((p) => p.blob))
  }, [photos, photosLoaded])

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    const room = MAX_PHOTOS - photos.length
    try {
      const picked = await Promise.all([...files].slice(0, room).map(async (f) => toPicked(await shrinkPhoto(f))))
      setPhotos((p) => [...p, ...picked].slice(0, MAX_PHOTOS))
      setError('')
    } catch {
      setError(t('form.photoError'))
    }
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
    if (!text.trim()) {
      setError(t('form.text.missing'))
      textBox.current?.focus()
      return
    }
    setBusy(true)
    setError('')
    const form = new FormData()
    form.set('kind', mode)
    form.set('text', text)
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
      setPhotosLoaded(false)
      clearDraft()
      navigate('/reports', { state: { posted: report.kind } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const suggestions = useMemo(() => {
    const q = locQuery.trim().toLowerCase()
    const hits = q
      ? places.filter((p) => p.name.toLowerCase().includes(q) || p.aliases.some((a) => a.toLowerCase().includes(q)))
      : places
    return hits.slice(0, 5)
  }, [places, locQuery])

  const listOpen = locOpen && suggestions.length > 0

  function pickPlace(p: Place) {
    setLocQuery(p.name)
    setPlaceName(p.name)
    setLocOpen(false)
    setActiveOpt(-1)
  }

  function onLocKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!listOpen) {
        setLocOpen(true)
        setActiveOpt(e.key === 'ArrowDown' ? 0 : suggestions.length - 1)
        return
      }
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActiveOpt((i) => (i + step + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' && listOpen && activeOpt >= 0) {
      e.preventDefault()
      pickPlace(suggestions[activeOpt])
    } else if (e.key === 'Escape' && listOpen) {
      e.preventDefault()
      setLocOpen(false)
      setActiveOpt(-1)
    }
  }

  const accent = accentOf(mode)
  const showCardNotice = isSensitiveText(text)
  const waiting = summary?.matchesWaiting ?? 0
  const postsLeft = summary?.postsLeft

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
        <div className={s.helloText}>
          <span className={s.greeting}>
            {partOfDay()}
            {firstName && `, ${firstName}`}
          </span>
          <h1 className={s.headline}>
            {tm('home.headA', mode)}
            <br />
            <span style={{ color: accent }}>{tm('home.headB', mode)}</span>
          </h1>
        </div>
        {/* Zarqa keeps watch beside the headline: looking out for lost things, pleased about found ones. */}
        <img
          src={mode === 'lost' ? '/mascot/home-searching.webp' : '/mascot/home-found-keys.webp'}
          alt=""
          className={s.helloMascot}
        />
      </div>

      <div className={s.modes}>
        {(['lost', 'found'] as const).map((m) => {
          const on = m === mode
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              aria-label={t(`home.mode.${m}.small` as StringKey)}
              className={s.modeBtn}
              onClick={() => setMode(m)}
              style={{ transform: on ? `rotate(${m === 'lost' ? -2.5 : 2.5}deg)` : undefined }}
            >
              <LuggageTag
                className={s.modeTag}
                style={{ background: on ? accentOf(m) : 'var(--surface)', color: on ? 'var(--ink)' : 'var(--text-muted)' }}
              >
                <span className={s.modeBig} aria-hidden="true">
                  {t(`home.mode.${m}.big` as StringKey)}
                </span>
                <span className={s.modeSmall} aria-hidden="true">
                  {t(`home.mode.${m}.small` as StringKey)}
                </span>
              </LuggageTag>
            </button>
          )
        })}
      </div>

      <Link to="/reports" className={`${s.reportsChip} ${waiting > 0 ? s.reportsHot : ''}`}>
        <TagIcon size={20} color="var(--text)" />
        <span className={s.reportsTitle}>{t('home.myReports')}</span>
        {summary && (
          <span className={s.reportsCount} aria-label={t('home.reportsMeta', { active: summary.active })}>
            {summary.active}
          </span>
        )}
        {waiting > 0 && (
          <span className={s.reportsSticker}>
            <Sticker>{t('home.reportsWaiting', { n: waiting })}</Sticker>
          </span>
        )}
        <ArrowRight size={18} color="var(--text-muted)" />
      </Link>

      <div className={s.ticketWrap}>
        {/* Zarqa peeks over the ticket, camera ready, ready to snap the item. */}
        <img src="/mascot/home-camera-peek.webp" alt="" className={s.peek} />
      <Ticket>
        <form className={s.form} onSubmit={submit} noValidate>
          <div className={s.field}>
            <div className={s.fieldLabel}>
              <span id="photos-label">{tm('form.photos', mode)}</span>
              <span className={s.count}>
                {photos.length}/{MAX_PHOTOS}
              </span>
            </div>
            <div className={s.photos} role="group" aria-labelledby="photos-label">
              {photos.map((p, i) => (
                <div key={p.url} className={s.photoSlot} style={{ transform: `rotate(${TILTS[i]}deg)` }}>
                  <img src={p.url} alt={t('form.photoN', { n: i + 1 })} className={s.photoImg} />
                  <button type="button" className={s.photoRemove} aria-label={t('form.removePhoto')} onClick={() => removePhoto(i)}>
                    <span className={s.xDot}>
                      <Close size={14} />
                    </span>
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button type="button" aria-label={t('form.addPhoto')} className={s.photoAdd} style={{ transform: `rotate(${TILTS[photos.length]}deg)` }} onClick={() => fileInput.current?.click()}>
                  <Camera size={24} color="var(--ink)" />
                  <span aria-hidden="true">{tm('form.photoCta', mode)}</span>
                </button>
              )}
              {Array.from({ length: Math.max(0, MAX_PHOTOS - photos.length - 1) }, (_, i) => (
                <div key={i} aria-hidden="true" className={s.photoEmpty} style={{ transform: `rotate(${TILTS[photos.length + 1 + i]}deg)` }} />
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
            <label htmlFor="item-text" className={s.fieldLabel}>
              {tm('form.name', mode)}
            </label>
            <textarea
              ref={textBox}
              id="item-text"
              className={s.textarea}
              rows={3}
              maxLength={500}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (error === t('form.text.missing')) setError('')
              }}
              placeholder={tm('form.text.placeholder', mode)}
              aria-describedby="item-text-hint"
              aria-invalid={error === t('form.text.missing') || undefined}
            />
            <span id="item-text-hint" className={s.hint}>
              {t('form.text.hint')}
            </span>
            {showCardNotice && (
              <div className={s.notice} role="note">
                <Lock size={22} color="var(--tan)" />
                <div className={s.noticeBody}>
                  <MonoLabel color="var(--tan)">{tm('form.cardNotice.title', mode)}</MonoLabel>
                  <span>{tm('form.cardNotice.body', mode)}</span>
                </div>
              </div>
            )}
          </div>

          <div className={s.field}>
            <label htmlFor="item-loc" className={s.fieldLabel}>
              {tm('form.where', mode)}
            </label>
            <div className={s.locWrap}>
              <span className={s.locIcon}>
                <Pin size={20} color="var(--ink)" />
              </span>
              <input
                id="item-loc"
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={listOpen}
                aria-controls="item-loc-list"
                aria-activedescendant={listOpen && activeOpt >= 0 ? `item-loc-opt-${activeOpt}` : undefined}
                className={s.locInput}
                autoComplete="off"
                maxLength={120}
                value={locQuery}
                onChange={(e) => {
                  setLocQuery(e.target.value)
                  setPlaceName(null)
                  setLocOpen(true)
                  setActiveOpt(-1)
                }}
                onFocus={() => setLocOpen(true)}
                onBlur={() => {
                  setLocOpen(false)
                  setActiveOpt(-1)
                }}
                onKeyDown={onLocKey}
                placeholder={t('form.where.placeholder')}
              />
            </div>
            <ul id="item-loc-list" role="listbox" aria-label={t('form.where.list')} className={s.suggest} hidden={!listOpen}>
              {listOpen &&
                suggestions.map((p, i) => (
                  <li
                    key={p.name}
                    id={`item-loc-opt-${i}`}
                    role="option"
                    aria-selected={i === activeOpt}
                    className={`${s.suggestItem} ${i === activeOpt ? s.suggestActive : ''}`}
                    // mousedown keeps focus in the input, so the list doesn't close before the pick lands.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickPlace(p)}
                  >
                    {p.name}
                  </li>
                ))}
            </ul>
          </div>

          <div className={s.field}>
            <div className={s.fieldLabel}>
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
                <div className={s.whenBox}>
                  <label className={s.whenPick}>
                    <span className={s.whenLabel}>{t('form.time')}</span>
                    <span className={s.whenValue} style={time ? undefined : { color: 'var(--ink-muted)' }}>
                      {time ? formatTime(time) : t('form.time.none')}
                    </span>
                    <input type="time" className={s.whenNative} value={time} onChange={(e) => setTime(e.target.value)} aria-label={t('form.time.pick')} />
                  </label>
                  {time && (
                    <button type="button" className={s.whenClear} aria-label={t('form.time.clear')} onClick={() => setTime('')}>
                      <span className={s.xDot}>
                        <Close size={14} />
                      </span>
                    </button>
                  )}
                </div>
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
            disabled={busy || postsLeft === 0}
          />
          {postsLeft !== undefined && (
            <p className={s.limit}>{postsLeft === 0 ? t('form.limit.none') : t('form.limit', { n: postsLeft })}</p>
          )}
        </form>
      </Ticket>
      </div>


      {me?.matchAlerts && <AlertsNudge />}
    </main>
  )
}
