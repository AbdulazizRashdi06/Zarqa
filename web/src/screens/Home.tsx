import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation, useNavigate as useRouterNavigate } from 'react-router'
import { Link } from '../lib/nav'
import { useNavigate } from '../lib/transition'
import { useSession } from '../auth/session'
import { AlertsNudge } from '../components/AlertsNudge'
import { ArrowRight, Camera, ChatBubble, Close, Lock, Pin, TagIcon } from '../components/icons'
import { InlineError } from '../components/states'
import { Avatar, BigButton, LuggageTag, MonoLabel, RoundButton, Sticker, Switch, TearLine, Ticket, Wordmark } from '../components/ui'
import { zarqaMotion } from '../components/zarqaMotion'
import { t, tm, type StringKey } from '../i18n'
import { api, apiForm, ApiError } from '../lib/api'
import { muscatNow } from '../lib/dates'
import { clearDraft, loadFields, loadPhotos, saveFields, savePhotos, type DraftFields } from '../lib/draft'
import { readPhoto } from '../lib/images'
import { isSensitiveText, partOfDay, type Mode } from '../lib/rules'
import type { HomeSummary, Report } from '../lib/types'
import s from './Home.module.css'

type Place = { name: string; aliases: string[] }

const MAX_PHOTOS = 4
const MAX_TEXT = 500
// The counter shows up once the description gets close to the limit.
const COUNT_FROM = 400
const TILTS = [-3, 2, -1.5, 2.5]
type PickedPhoto = { blob: Blob; url: string }

const accentOf = (mode: Mode) => (mode === 'lost' ? 'var(--tan)' : 'var(--sage)')

function formatDate(date: string, today: string) {
  // Today's date is in the picker; the box just says TODAY so it stays on one line.
  if (date === today) return t('form.today')
  const d = new Date(`${date}T12:00:00`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
}

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  const hour12 = ((h + 11) % 12) + 1
  return `~ ${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** The server refuses dates more than a year back, so the picker stops there too. */
const yearBefore = (date: string) => `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`

/** location.state.repost from "Post it again", checked field by field (it may be partial). */
function readRepost(state: unknown): Partial<DraftFields> | null {
  const r = (state as { repost?: unknown } | null)?.repost
  if (!r || typeof r !== 'object') return null
  const v = r as Record<string, unknown>
  const str = (x: unknown) => (typeof x === 'string' ? x : undefined)
  return {
    mode: v.mode === 'lost' || v.mode === 'found' ? v.mode : undefined,
    text: str(v.text)?.slice(0, MAX_TEXT),
    locQuery: str(v.locQuery)?.slice(0, 120),
    placeName: str(v.placeName) ?? null,
    knowsWhen: false,
  }
}

const toPicked =(blob: Blob): PickedPhoto => ({ blob, url: URL.createObjectURL(blob) })

const coarsePointer = () => window.matchMedia?.('(pointer: coarse)').matches ?? false
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

export default function Home() {
  const { me, refresh } = useSession()
  const firstName = me?.firstName ?? ''
  // The draft belongs to this account: another account on the same browser never sees it.
  const owner = me?.id ?? ''
  const now = useMemo(() => muscatNow(), [])
  // "Post it again" from a report page hands its text over once; it wins over a stored draft.
  const location = useLocation()
  const [repost] = useState(() => readRepost(location.state))
  const draft = useMemo(() => {
    const stored = loadFields(owner)
    return repost ?? stored
  }, [owner, repost])
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
  const [dropAtRsa, setDropAtRsa] = useState(draft.dropAtRsa ?? false)
  const [time, setTime] = useState(draft.time ?? '')
  // A name picked from the campus list; typing again turns it back into free text.
  const [placeName, setPlaceName] = useState<string | null>(draft.placeName ?? null)
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [photosLoaded, setPhotosLoaded] = useState(false)
  // Photos being read and shrunk: each gets a placeholder tile, and posting waits for them.
  const [pending, setPending] = useState(0)
  const [photoNote, setPhotoNote] = useState('')
  // Came back to an unfinished form: say so, with a way to start over.
  const [restored, setRestored] = useState(!repost && Boolean(draft.text || draft.locQuery))
  const [busy, setBusy] = useState(false)
  // An error is about the form as it was sent: once anything in it changes (or consent is given), it no longer shows.
  const formKey = JSON.stringify([mode, text, locQuery, placeName, knowsWhen, date, time, dropAtRsa, photos.map((p) => p.url), me?.needsConsent])
  const [sendError, setSendError] = useState({ message: '', formKey: '' })
  const error = sendError.formKey === formKey ? sendError.message : ''
  const setError = (message: string) => setSendError({ message, formKey })
  const [textMissing, setTextMissing] = useState(false)
  const [summary, setSummary] = useState<HomeSummary | null>(null)
  // Counts that restart a small animation: the headline when Lost/Found flips, Zarqa's camera when a photo lands.
  const [flips, setFlips] = useState(0)
  const [snaps, setSnaps] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const textBox = useRef<HTMLTextAreaElement>(null)
  const photoGroup = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const timeInput = useRef<HTMLInputElement>(null)
  const locLabel = useRef<HTMLLabelElement>(null)
  const navigate = useNavigate()
  const routerNavigate = useRouterNavigate()

  const loadSummary = useCallback(() => {
    // A failed refresh keeps the counts we had.
    api<HomeSummary>('/home')
      .then(setSummary)
      .catch(() => undefined)
  }, [])

  // Load once, then again whenever the app comes back to the front (an installed app is resumed, not reloaded).
  useEffect(() => {
    loadSummary()
    let last = Date.now()
    const onShow = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 5000) return
      last = Date.now()
      loadSummary()
    }
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('pageshow', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('pageshow', onShow)
    }
  }, [loadSummary])

  useEffect(() => {
    fetch('/api/locations')
      .then((r) => (r.ok ? r.json() : []))
      .then(setPlaces)
      .catch(() => setPlaces([]))
  }, [])

  // The repost is one-shot: clear it so a reload or Back doesn't fill the form again. No page slide: same page.
  const hasRepostState = Boolean((location.state as { repost?: unknown } | null)?.repost)
  useEffect(() => {
    if (hasRepostState) void routerNavigate(location.pathname, { replace: true, state: null })
  }, [hasRepostState, location.pathname, routerNavigate])

  // Bring back photos from an unfinished draft (not under a repost: those photos belong to another report's draft).
  useEffect(() => {
    let live = true
    ;(repost ? Promise.resolve([] as Blob[]) : loadPhotos(owner)).then((blobs) => {
      if (!live) return
      if (blobs.length) setRestored(true)
      setPhotos((p) => (p.length ? p : blobs.slice(0, MAX_PHOTOS).map(toPicked)))
      setPhotosLoaded(true)
    })
    return () => {
      live = false
    }
  }, [owner, repost])

  useEffect(() => {
    saveFields(owner, { mode, text, locQuery, placeName, knowsWhen, date, time, dropAtRsa })
  }, [owner, mode, text, locQuery, placeName, knowsWhen, date, time, dropAtRsa])

  useEffect(() => {
    if (photosLoaded) void savePhotos(owner, photos.map((p) => p.blob))
  }, [owner, photos, photosLoaded])

  // The description grows with its text (up to a cap), instead of a three-line window.
  useLayoutEffect(() => {
    const box = textBox.current
    if (!box) return
    box.style.height = 'auto'
    box.style.height = `${Math.min(box.scrollHeight + 2, 320)}px`
  }, [text])

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    const all = [...files]
    const take = all.slice(0, Math.max(0, MAX_PHOTOS - photos.length - pending))
    setPhotoNote(all.length > take.length ? t('form.photosDropped') : '')
    if (!take.length) return
    setPending((n) => n + take.length)
    // A file the browser can't draw (not a photo, broken, HEIC on some phones) is refused here, not after posting.
    const results = await Promise.all(take.map((f) => readPhoto(f).then(toPicked, () => null)))
    setPending((n) => n - take.length)
    const picked = results.filter((p): p is PickedPhoto => p !== null)
    if (picked.length) {
      setPhotos((p) => [...p, ...picked].slice(0, MAX_PHOTOS))
      setSnaps((n) => n + 1)
    }
    if (picked.length < take.length) setPhotoNote(t('form.photoError'))
  }

  function removePhoto(url: string, moveFocus = true) {
    setPhotos((p) => {
      URL.revokeObjectURL(url)
      return p.filter((x) => x.url !== url)
    })
    if (!moveFocus) return
    // The button that was pressed is gone: focus the next photo's Remove, or Add.
    const i = photos.findIndex((x) => x.url === url)
    requestAnimationFrame(() => {
      const next = photoGroup.current?.querySelectorAll<HTMLButtonElement>('[data-remove]')[i]
      ;(next ?? addButton.current)?.focus()
    })
  }

  function startOver() {
    photos.forEach((p) => URL.revokeObjectURL(p.url))
    setPhotos([])
    setText('')
    setLocQuery('')
    setPlaceName(null)
    setKnowsWhen(false)
    setDate(now.date)
    setTime('')
    setDropAtRsa(false)
    setTextMissing(false)
    setPhotoNote('')
    setRestored(false)
    clearDraft()
    requestAnimationFrame(() => addButton.current?.focus())
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!text.trim()) {
      setTextMissing(true)
      textBox.current?.focus()
      return
    }
    if (pending > 0) {
      setError(t('form.photosBusy'))
      return
    }
    // No report before consent is recorded (the server refuses it too): the consent sheet is open over this form.
    if (me?.needsConsent) {
      setError(t('form.consentFirst'))
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
    if (mode === 'found' && dropAtRsa) form.set('dropAtRsa', 'true')
    photos.forEach((p, i) => form.append('photos', p.blob, `photo-${i + 1}.jpg`))
    try {
      const report = await apiForm<Report>('/reports', form)
      photos.forEach((p) => URL.revokeObjectURL(p.url))
      setPhotosLoaded(false)
      clearDraft()
      // A drop-off goes straight to its code, which the finder shows at the RSA desk.
      if (report.dropCode) navigate(`/reports/${report.id}`, { state: { posted: 'rsa' } })
      else navigate('/reports', { state: { posted: report.kind } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
      // Refused for missing consent (the Terms changed during the session): reloading the session brings up
      // the consent sheet over this form, so they can agree and post straight away.
      if (err instanceof ApiError && err.status === 403) void refresh()
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
    } else if (e.key === 'Enter') {
      // Enter (or the keyboard's Done) never posts from here: the When and RSA questions are still below.
      e.preventDefault()
      if (listOpen && activeOpt >= 0) pickPlace(suggestions[activeOpt])
      else if (listOpen && locQuery.trim()) pickPlace(suggestions[0])
      else {
        setLocOpen(false)
        e.currentTarget.blur()
      }
    } else if (e.key === 'Escape' && listOpen) {
      e.preventDefault()
      setLocOpen(false)
      setActiveOpt(-1)
    }
  }

  // On a phone the keyboard covers the lower half: lift the place field to the top so its list shows.
  function liftPlaceField() {
    if (!coarsePointer()) return
    setTimeout(() => locLabel.current?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }), 250)
  }

  const accent = accentOf(mode)
  const showCardNotice = isSensitiveText(text)
  const waiting = summary?.matchesWaiting ?? 0
  const postsLeft = summary?.postsLeft
  const slotsUsed = photos.length + pending

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
            {firstName && (
              <>
                , <bdi>{firstName}</bdi>
              </>
            )}
          </span>
          <h1 key={mode} className={s.headline} data-enter={flips ? 'headline' : undefined} style={{ animationDuration: '280ms' }}>
            {tm('home.headA', mode)}
            <br />
            <span style={{ color: accent }}>{tm('home.headB', mode)}</span>
          </h1>
        </div>
        {/* Zarqa keeps watch beside the headline: looking out for lost things, pleased about found ones. */}
        {/* Both are always there, so flipping Lost/Found swaps her without a flash, and a quick double flip just reverses. */}
        {(['lost', 'found'] as const).map((m) => (
          <img
            key={m}
            src={m === 'lost' ? '/mascot/home-searching.webp' : '/mascot/home-found-keys.webp'}
            alt=""
            data-on={m === mode}
            className={`${s.helloMascot} ${zarqaMotion('breathe', false)}`}
          />
        ))}
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
              onClick={() => {
                if (m === mode) return
                setMode(m)
                setFlips((n) => n + 1)
              }}
              style={{ rotate: on ? `${m === 'lost' ? -2.5 : 2.5}deg` : undefined }}
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

      {/* Alerts matter once something is posted: ask then, where it's seen, not below the whole form. */}
      {me?.matchAlerts && (summary?.active ?? 0) > 0 && <AlertsNudge />}

      <Link to="/reports" className={`${s.reportsChip} ${waiting > 0 ? s.reportsHot : ''}`}>
        <TagIcon size={20} color="var(--text)" />
        <span className={s.reportsTitle}>{t('home.myReports')}</span>
        {summary && (
          <span className={s.reportsCount} data-enter="pop">
            <span aria-hidden="true">{summary.active}</span>
            <span className="visually-hidden">{t('home.reportsMeta', { active: summary.active })}</span>
          </span>
        )}
        {waiting > 0 && (
          <span className={s.reportsSticker} data-enter="sticker" style={{ '--delay': '250ms' }}>
            <Sticker>{t(waiting === 1 ? 'home.reportsWaiting' : 'home.reportsWaitingMany', { n: waiting })}</Sticker>
          </span>
        )}
        <ArrowRight size={18} color="var(--text-muted)" />
      </Link>

      <div className={s.ticketWrap}>
        {/* Zarqa peeks over the ticket, camera ready, ready to snap the item. */}
        {/* She rises from behind the paper when Home opens, and snaps her camera when a photo lands. */}
        <img key={snaps} src="/mascot/home-camera-peek.webp" alt="" className={`${s.peek} ${snaps ? s.peekSnap : ''}`} />
        {snaps > 0 && <span key={`flash-${snaps}`} aria-hidden="true" className={s.flash} />}
      <Ticket>
        <form className={s.form} onSubmit={submit} noValidate>
          {/* At the limit: say so before they fill anything in, not only next to the greyed button. */}
          {postsLeft === 0 && <InlineError onPaper>{t('form.limit.none')}</InlineError>}
          {restored && (
            <div className={s.draftRow} role="status">
              <span>{t('form.draft.restored')}</span>
              <button type="button" className={s.draftClear} onClick={startOver}>
                {t('form.draft.clear')}
              </button>
            </div>
          )}
          <div className={s.field}>
            <div className={s.fieldLabel}>
              <span id="photos-label">{tm('form.photos', mode)}</span>
              <span className={s.count}>
                {slotsUsed}/{MAX_PHOTOS}
              </span>
            </div>
            <div ref={photoGroup} className={s.photos} role="group" aria-labelledby="photos-label">
              {photos.map((p, i) => (
                <div key={p.url} className={`${s.photoSlot} ${photosLoaded ? s.photoNew : ''}`} style={{ transform: `rotate(${TILTS[i]}deg)` }}>
                  <img
                    src={p.url}
                    alt={t('form.photoN', { n: i + 1 })}
                    className={s.photoImg}
                    onError={() => {
                      // A restored or picked file that won't draw: drop it rather than show a broken tile.
                      removePhoto(p.url, false)
                      setPhotoNote(t('form.photoError'))
                    }}
                  />
                  <button
                    type="button"
                    data-remove
                    className={s.photoRemove}
                    aria-label={t('form.removePhoto', { n: i + 1 })}
                    onClick={() => removePhoto(p.url)}
                  >
                    <span className={s.xDot}>
                      <Close size={14} />
                    </span>
                  </button>
                </div>
              ))}
              {Array.from({ length: pending }, (_, i) => (
                <div key={`pending-${i}`} role="img" aria-label={t('form.photoLoading')} className={s.photoPending} style={{ transform: `rotate(${TILTS[photos.length + i]}deg)` }}>
                  <span className={s.photoSpinner} aria-hidden="true" />
                </div>
              ))}
              {slotsUsed < MAX_PHOTOS && (
                <button
                  ref={addButton}
                  type="button"
                  aria-label={t('form.addPhoto')}
                  className={s.photoAdd}
                  style={{ transform: `rotate(${TILTS[slotsUsed]}deg)` }}
                  onClick={() => fileInput.current?.click()}
                >
                  <Camera size={24} color="var(--ink)" />
                  <span aria-hidden="true">{tm('form.photoCta', mode)}</span>
                </button>
              )}
              {Array.from({ length: Math.max(0, MAX_PHOTOS - slotsUsed - 1) }, (_, i) => (
                <div key={i} aria-hidden="true" className={s.photoEmpty} style={{ transform: `rotate(${TILTS[slotsUsed + 1 + i]}deg)` }} />
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
            <InlineError onPaper>{photoNote}</InlineError>
          </div>

          <div className={s.field}>
            <div className={s.fieldLabel}>
              <label htmlFor="item-text">{tm('form.name', mode)}</label>
              {text.length >= COUNT_FROM && (
                <span className={s.count}>{t('form.text.count', { n: text.length, max: MAX_TEXT })}</span>
              )}
            </div>
            <textarea
              ref={textBox}
              id="item-text"
              dir="auto"
              className={s.textarea}
              rows={3}
              maxLength={MAX_TEXT}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setTextMissing(false)
              }}
              placeholder={tm('form.text.placeholder', mode)}
              aria-describedby={textMissing ? 'item-text-error' : 'item-text-hint'}
              aria-invalid={textMissing || undefined}
            />
            {/* Right under the box, so it's still in view when the keyboard opens. */}
            {textMissing ? (
              <InlineError onPaper id="item-text-error" className={s.fieldError}>
                {t('form.text.missing')}
              </InlineError>
            ) : (
              <span id="item-text-hint" className={s.hint}>
                {t('form.text.hint')}
              </span>
            )}
            {showCardNotice && (
              <div className={s.notice} role="note" data-enter="pop">
                <Lock size={22} color="var(--tan)" />
                <div className={s.noticeBody}>
                  <MonoLabel color="var(--tan)">{tm('form.cardNotice.title', mode)}</MonoLabel>
                  <span className={s.noticeLead}>{tm('form.cardNotice.body', mode)}</span>
                  {/* Always shown, photo or not: they should know what happens to a card photo before they add one. */}
                  <span>{tm('form.cardNotice.photo', mode)}</span>
                </div>
              </div>
            )}
          </div>

          <div className={s.field}>
            <label ref={locLabel} htmlFor="item-loc" className={`${s.fieldLabel} ${s.locLabel}`}>
              {tm('form.where', mode)}
            </label>
            <div className={s.locWrap}>
              <span className={s.locIcon}>
                <Pin size={20} color="var(--ink)" />
              </span>
              <input
                id="item-loc"
                type="text"
                dir="auto"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={listOpen}
                aria-controls="item-loc-list"
                aria-activedescendant={listOpen && activeOpt >= 0 ? `item-loc-opt-${activeOpt}` : undefined}
                className={s.locInput}
                autoComplete="off"
                enterKeyHint="done"
                maxLength={120}
                value={locQuery}
                onChange={(e) => {
                  setLocQuery(e.target.value)
                  setPlaceName(null)
                  setLocOpen(true)
                  setActiveOpt(-1)
                }}
                onFocus={() => {
                  setLocOpen(true)
                  liftPlaceField()
                }}
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
            {/* The whole row is the label, so tapping the question flips the switch too. */}
            <label className={s.fieldLabel}>
              <span id="knows-when-label">{tm('form.when', mode)}</span>
              <span className={s.whenToggle}>
                <span className={s.switchState} aria-hidden="true">
                  {knowsWhen ? t('form.when.on') : t('form.when.off')}
                </span>
                <Switch checked={knowsWhen} onChange={setKnowsWhen} label={`${tm('form.when', mode)} ${t('form.when.toggle')}`} />
              </span>
            </label>
            {knowsWhen && (
              <div className={s.when} data-enter style={{ animationDuration: '260ms' }}>
                <label className={s.whenBox}>
                  <span className={s.whenLabel}>{t('form.date')}</span>
                  <span className={s.whenValue}>{formatDate(date, now.date)}</span>
                  <input
                    type="date"
                    className={s.whenNative}
                    value={date}
                    min={yearBefore(now.date)}
                    max={now.date}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                  />
                </label>
                <div className={`${s.whenBox} ${time ? s.whenBoxClear : ''}`}>
                  <label className={s.whenPick}>
                    <span className={s.whenLabel}>{t('form.time')}</span>
                    <span className={s.whenValue} style={time ? undefined : { color: 'var(--ink-muted)' }}>
                      {time ? formatTime(time) : t('form.time.none')}
                    </span>
                    <input
                      ref={timeInput}
                      type="time"
                      className={s.whenNative}
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      aria-label={t('form.time.pick')}
                    />
                  </label>
                  {time && (
                    <button
                      type="button"
                      className={s.whenClear}
                      aria-label={t('form.time.clear')}
                      onClick={() => {
                        setTime('')
                        timeInput.current?.focus({ preventScroll: true })
                      }}
                    >
                      <span className={s.xDot}>
                        <Close size={14} />
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {mode === 'found' && (
            <div className={s.field}>
              <label className={s.fieldLabel}>
                <span id="drop-rsa-label">{t('form.rsa')}</span>
                <span className={s.whenToggle}>
                  <Switch checked={dropAtRsa} onChange={setDropAtRsa} label={t('form.rsa')} />
                </span>
              </label>
              {dropAtRsa && <span className={s.hint} data-enter style={{ animationDuration: '260ms' }}>{t('form.rsa.note')}</span>}
            </div>
          )}

          <TearLine />

          {error && (
            <p key={error} className={s.error} role="alert" data-shake>
              {error}
            </p>
          )}
          <BigButton
            type="submit"
            variant="dark"
            accent={accent}
            label={busy ? t('form.posting') : tm('form.submit', mode)}
            busy={busy}
            labelSize={28}
            disabled={busy || postsLeft === 0}
          />
          {postsLeft !== undefined && (
            <p className={s.limit}>{postsLeft === 0 ? t('form.limit.none') : t('form.limit', { n: postsLeft })}</p>
          )}
        </form>
      </Ticket>
      </div>
    </main>
  )
}
