import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link } from '../lib/nav'
import { useNavigate } from '../lib/transition'
import { clearReturnPath, signedOutFrom, useSession, type Me } from '../auth/session'
import { Camera, ChevronRight, SignOut } from '../components/icons'
import { ConfirmSheet, InlineError, UserText } from '../components/states'
import { Avatar, BackHeader, Switch } from '../components/ui'
import { t } from '../i18n'
import { api, apiForm, ApiError } from '../lib/api'
import { clearDraft } from '../lib/draft'
import { shrinkPhoto } from '../lib/images'
import { disablePushOnThisDevice, enablePush, pushState, refreshPush, type PushState } from '../lib/push'
import { useCountUp } from '../lib/useCountUp'
import s from './Profile.module.css'

type Stats = { posts: number; gotBack: number; helpedReturn: number }

// How long the final "Delete for good" step ignores taps after it appears.
const FINAL_STEP_PAUSE_MS = 600

const message = (e: unknown) => (e instanceof ApiError ? e.message : t('common.error'))

/** What this phone can do with alerts, in words, or null when it is all set. */
function deviceNote(device: PushState) {
  if (device === 'needs-install') return t('alerts.install')
  if (device === 'denied') return t('profile.alerts.denied')
  if (device === 'unsupported') return t('profile.alerts.unsupported')
  if (device === 'default') return t('profile.alerts.default')
  return null
}

export default function Profile() {
  const { me, setMe, signOut } = useSession()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsFailed, setStatsFailed] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [device, setDevice] = useState<PushState>(() => pushState())
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  // The one confirmation sheet: remove the photo, or the two steps of deleting the account.
  const [sheet, setSheet] = useState<null | 'photo' | 'delete' | 'deleteFinal'>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  // When the final deletion step appeared (or last ignored a tap): a double tap on "Continue" must not also delete.
  const finalTapAt = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  // The three numbers count up when they arrive.
  const posts = useCountUp(stats?.posts)
  const gotBack = useCountUp(stats?.gotBack)
  const helped = useCountUp(stats?.helpedReturn)

  const loadStats = useCallback(() => {
    setStatsFailed(false)
    api<Stats>('/me/stats')
      .then(setStats)
      .catch(() => setStatsFailed(true))
  }, [])

  useEffect(() => {
    // Load once on mount; state changes only after the request resolves.
    // oxlint-disable-next-line react/set-state-in-effect
    loadStats()
  }, [loadStats])

  // Permission can change in the browser's settings while Zarqa is in the background.
  useEffect(() => {
    const check = () => setDevice(pushState())
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [])

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  if (!me) return null
  const isStudent = me.email.endsWith('@student.gutech.edu.om')
  const busy = deleting || signingOut
  const longestWord = Math.max(5, ...(me.firstName ?? '').split(/[\s-]+/).map((w) => w.length))

  async function patch(body: Partial<Pick<Me, 'showFirstName' | 'matchAlerts'>>) {
    setSettingsError('')
    const before = me
    setMe({ ...me!, ...body })
    try {
      setMe(await api<Me>('/me', { method: 'PATCH', body }))
    } catch (e) {
      setMe(before)
      setSettingsError(message(e))
    }
  }

  // Asking for permission must follow a tap: the switch, or "Turn on for this phone".
  async function turnOnThisPhone() {
    if (pushBusy) return
    setPushBusy(true)
    setPushError('')
    try {
      setDevice(await enablePush())
    } catch (e) {
      setDevice(pushState())
      setPushError(e instanceof ApiError ? e.message : t('profile.alerts.failed'))
    } finally {
      setPushBusy(false)
    }
  }

  async function changePhoto(files: FileList | null) {
    const file = files?.[0]
    if (!file || photoBusy) return
    setPhotoError('')
    setPhotoBusy(true)
    setPhotoPreview(URL.createObjectURL(file))
    try {
      const form = new FormData()
      form.set('photo', await shrinkPhoto(file, 800), 'avatar.jpg')
      setMe(await apiForm<Me>('/me/avatar', form))
    } catch (e) {
      setPhotoError(message(e))
    } finally {
      setPhotoBusy(false)
      setPhotoPreview(null)
    }
  }

  async function removePhoto() {
    if (photoBusy) return
    setPhotoError('')
    setPhotoBusy(true)
    try {
      setMe(await api<Me>('/me/avatar', { method: 'DELETE' }))
      setSheet(null)
    } catch (e) {
      setPhotoError(message(e))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault()
    if (nameBusy) return
    setNameBusy(true)
    setNameError('')
    try {
      setMe(await api<Me>('/me', { method: 'PATCH', body: { firstName: name } }))
      setEditingName(false)
    } catch (err) {
      setNameError(message(err))
    } finally {
      setNameBusy(false)
    }
  }

  async function doSignOut() {
    if (busy) return
    setSigningOut(true)
    setSignOutError('')
    try {
      // signOut() also stops this phone's alerts and clears the report draft.
      await signOut()
      navigate('/signin', { replace: true })
    } catch (e) {
      // Still signed in on the server: say so rather than pretend.
      setSignOutError(e instanceof ApiError ? t('profile.signOutFailed') : t('common.error'))
      setSigningOut(false)
    }
  }

  async function deleteAccount() {
    if (deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      // Stop this phone getting the account's alerts while we still can (the account is about to go).
      await disablePushOnThisDevice().catch(() => undefined)
      await api('/me', { method: 'DELETE' })
      // An unfinished report (maybe a card photo) must not wait in this browser for the next person.
      clearDraft()
      // Like signing out: the next person to sign in in this tab starts on Home, not on this Profile.
      clearReturnPath()
      signedOutFrom(window.location.pathname + window.location.search)
      setMe(null)
      navigate('/signin', { replace: true })
    } catch (e) {
      setDeleteError(message(e))
      setDeleting(false)
      // The account is still here: this phone keeps getting its alerts (no-op unless alerts were allowed).
      void refreshPush()
    }
  }

  const note = me.matchAlerts ? deviceNote(device) : null

  return (
    <main className={s.page} aria-busy={busy || undefined}>
      <BackHeader label={t('profile.title').toUpperCase()} />

      <div className={s.who}>
        <div className={s.avatarWrap} data-busy={photoBusy || undefined}>
          <Avatar name={me.firstName ?? 'Z'} photoUrl={photoPreview ?? me.avatarUrl} size={88} />
          {photoBusy && (
            <span className={s.avatarBusy} role="status" aria-label={t('profile.photoUploading')}>
              <span className={s.spinner} aria-hidden="true" />
            </span>
          )}
          <button
            type="button"
            className={s.changePhoto}
            aria-label={t('profile.changePhoto')}
            disabled={photoBusy || busy}
            onClick={() => fileInput.current?.click()}
          >
            <Camera size={16} color="var(--ink)" />
          </button>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { void changePhoto(e.target.files); e.target.value = '' }} />
        </div>
        <div className={s.nameCol} style={{ '--chars': longestWord } as CSSProperties}>
          <UserText as="h1" className={s.name}>{me.firstName}</UserText>
          <span className={s.role}>{isStudent ? t('profile.student') : t('profile.staff')}</span>
          {!editingName && (
            <button
              type="button"
              className={s.textButton}
              disabled={busy}
              onClick={() => {
                setName(me.firstName ?? '')
                setNameError('')
                setEditingName(true)
              }}
            >
              {t('profile.editName')}
            </button>
          )}
        </div>
      </div>

      {editingName && (
        <form className={s.nameForm} onSubmit={saveName} noValidate>
          <label htmlFor="profile-name" className={s.section}>
            {t('welcome.label')}
          </label>
          <input
            id="profile-name"
            className={s.nameInput}
            autoComplete="given-name"
            maxLength={40}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!nameError}
            aria-describedby="profile-name-help"
          />
          <InlineError>{nameError}</InlineError>
          <span id="profile-name-help" className={s.rowSub}>{t('profile.editName.help')}</span>
          <div className={s.nameActions}>
            <button type="submit" className={s.saveButton} disabled={nameBusy || !name.trim()} aria-busy={nameBusy || undefined}>
              {nameBusy ? t('welcome.saving') : t('profile.editName.save')}
            </button>
            <button type="button" className={s.textButton} disabled={nameBusy} onClick={() => setEditingName(false)}>
              {t('profile.editName.cancel')}
            </button>
          </div>
        </form>
      )}

      <div className={s.photoNote}>
        <span className={s.rowSub}>{t(me.showFirstName ? 'profile.photoSeen' : 'profile.photoHidden')}</span>
        {me.avatarUrl && (
          <button
            type="button"
            className={s.textButton}
            disabled={photoBusy || busy}
            onClick={() => {
              setPhotoError('')
              setSheet('photo')
            }}
          >
            {t('profile.removePhoto')}
          </button>
        )}
      </div>
      {sheet !== 'photo' && <InlineError>{photoError}</InlineError>}

      <div className={s.stats}>
        {statsFailed ? (
          <div className={s.statsFailed} role="alert">
            <span>{t('profile.statsFailed')}</span>
            <button type="button" className={s.retry} onClick={loadStats}>
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <>
            <div className={s.stat}>
              <span className={s.statNum}>{posts ?? '–'}</span>
              <span className={s.statLabel}>{t('profile.posts')}</span>
            </div>
            <div className={`${s.stat} ${s.statMid}`}>
              <span className={s.statNum}>{gotBack ?? '–'}</span>
              <span className={s.statLabel}>{t('profile.gotBack')}</span>
            </div>
            <div className={s.stat}>
              <span className={`${s.statNum} ${s.statHelped}`}>{helped ?? '–'}</span>
              <span className={s.statLabel}>{t('profile.helped')}</span>
            </div>
          </>
        )}
      </div>

      {(me.isRsa || me.isAdmin) && (
        <div className={s.settings}>
          <span className={s.section}>{t('profile.staffTools')}</span>
          {me.isRsa && (
            <Link to="/rsa" className={`${s.link} ${s.staffLink}`}>
              <span className={s.rowTitle}>{t('profile.rsa')}</span>
              <ChevronRight size={18} color="var(--tan-light)" />
            </Link>
          )}
          {me.isAdmin && (
            <Link to="/admin" className={`${s.link} ${s.staffLink}`}>
              <span className={s.rowTitle}>{t('profile.admin')}</span>
              <ChevronRight size={18} color="var(--tan-light)" />
            </Link>
          )}
        </div>
      )}

      <div className={s.settings}>
        <span className={s.section}>{t('profile.settings')}</span>
        <div className={s.rowGroup}>
          <div className={s.row}>
            <span className={s.rowText}>
              <span className={s.rowTitle}>{t('profile.alerts')}</span>
              <span className={s.rowSub}>{t('profile.alerts.sub')}</span>
            </span>
            <Switch
              checked={me.matchAlerts}
              onChange={(v) => {
                void patch({ matchAlerts: v })
                if (v && pushState() === 'default') void turnOnThisPhone()
              }}
              label={t('profile.alerts')}
            />
          </div>
          {note && (
            <div className={s.deviceNote} role="status">
              <span>{note}</span>
              {device === 'default' && (
                <button type="button" className={s.saveButton} disabled={pushBusy} aria-busy={pushBusy || undefined} onClick={() => void turnOnThisPhone()}>
                  {t('profile.alerts.turnOn')}
                </button>
              )}
            </div>
          )}
          <InlineError className={s.rowError}>{pushError}</InlineError>
        </div>
        <div className={s.row}>
          <span className={s.rowText}>
            <span className={s.rowTitle}>{t('profile.showName')}</span>
            <span className={s.rowSub}>{t('profile.showName.sub')}</span>
          </span>
          <Switch checked={me.showFirstName} onChange={(v) => patch({ showFirstName: v })} label={t('profile.showName')} />
        </div>
        <InlineError className={s.rowError}>{settingsError}</InlineError>
        <div className={s.row}>
          <span className={s.rowText}>
            <span className={s.rowTitle}>{t('profile.language')}</span>
            <span className={s.rowSub}>{t('profile.language.sub')}</span>
          </span>
          <span className={s.lang}>EN</span>
        </div>
        <Link to="/tips" className={s.link}>
          <span className={s.rowTitle}>{t('profile.tips')}</span>
          <ChevronRight size={18} color="var(--chevron)" />
        </Link>
        <Link to="/help" className={s.link}>
          <span className={s.rowTitle}>{t('profile.help')}</span>
          <ChevronRight size={18} color="var(--chevron)" />
        </Link>
        <Link to="/privacy" className={s.link}>
          <span className={s.rowTitle}>{t('profile.privacy')}</span>
          <ChevronRight size={18} color="var(--chevron)" />
        </Link>
        <Link to="/terms" className={s.link} style={{ borderBottom: 'none' }}>
          <span className={s.rowTitle}>{t('profile.terms')}</span>
          <ChevronRight size={18} color="var(--chevron)" />
        </Link>
      </div>

      <div className={s.bottom}>
        <InlineError>{signOutError}</InlineError>
        <button type="button" className={s.signOut} disabled={busy} aria-busy={signingOut || undefined} onClick={() => void doSignOut()}>
          {signingOut ? <span className={s.spinner} aria-hidden="true" /> : <SignOut size={20} />}
          {t(signingOut ? 'profile.signingOut' : 'profile.signOut')}
        </button>
        <button
          type="button"
          className={s.deleteLink}
          disabled={busy}
          onClick={() => {
            setDeleteError('')
            setSheet('delete')
          }}
        >
          {t('profile.delete')}
        </button>
      </div>

      {/* Deleting takes two steps (the owner's two confirmations): what goes and what stays, then "for good". */}
      <ConfirmSheet
        open={sheet !== null}
        title={t(sheet === 'photo' ? 'profile.removePhoto.title' : sheet === 'deleteFinal' ? 'profile.deleteFinal.title' : 'profile.deleteSheet.title')}
        body={t(sheet === 'photo' ? 'profile.removePhoto.body' : sheet === 'deleteFinal' ? 'profile.deleteFinal.body' : 'profile.deleteSheet.body')}
        confirmLabel={
          sheet === 'photo'
            ? t('profile.removePhoto.go')
            : sheet === 'deleteFinal'
              ? t(deleting ? 'profile.deleting' : 'profile.deleteFinal.go')
              : t('profile.deleteSheet.next')
        }
        cancelLabel={t(sheet === 'photo' ? 'profile.removePhoto.keep' : 'profile.deleteSheet.keep')}
        busy={sheet === 'photo' ? photoBusy : deleting}
        error={sheet === 'photo' ? photoError : deleteError}
        onConfirm={() => {
          if (sheet === 'photo') void removePhoto()
          else if (sheet === 'deleteFinal') {
            // The button sits where "Continue" was: a tap within 600 ms of the step appearing (or of an ignored tap,
            // so a held Enter or a burst of taps never gets through) is the first confirmation's, not this one's.
            const now = performance.now()
            if (now - finalTapAt.current < FINAL_STEP_PAUSE_MS) finalTapAt.current = now
            else void deleteAccount()
          } else {
            finalTapAt.current = performance.now()
            setSheet('deleteFinal')
          }
        }}
        onCancel={() => setSheet(null)}
      />
    </main>
  )
}
