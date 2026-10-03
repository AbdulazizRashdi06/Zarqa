import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useSession, type Me } from '../auth/session'
import { Camera, ChevronRight, SignOut } from '../components/icons'
import { Avatar, BackHeader, Switch } from '../components/ui'
import { t } from '../i18n'
import { api, apiForm, ApiError } from '../lib/api'
import { shrinkPhoto } from '../lib/images'
import { enablePush, pushState } from '../lib/push'
import s from './Profile.module.css'

type Stats = { posts: number; gotBack: number; helpedReturn: number }

export default function Profile() {
  const { me, setMe, signOut } = useSession()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api<Stats>('/me/stats').then(setStats).catch(() => setStats(null))
  }, [])

  if (!me) return null
  const isStudent = me.email.endsWith('@student.gutech.edu.om')

  async function patch(body: Partial<Pick<Me, 'showFirstName' | 'matchAlerts'>>) {
    setError('')
    const before = me
    setMe({ ...me!, ...body })
    try {
      setMe(await api<Me>('/me', { method: 'PATCH', body }))
    } catch (e) {
      setMe(before)
      setError(e instanceof ApiError ? e.message : t('common.error'))
    }
  }

  async function changePhoto(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setError('')
    const form = new FormData()
    form.set('photo', await shrinkPhoto(file, 800), 'avatar.jpg')
    try {
      setMe(await apiForm<Me>('/me/avatar', form))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'))
    }
  }

  async function deleteAccount() {
    if (deleting || !window.confirm(t('profile.deleteConfirm')) || !window.confirm(t('profile.deleteFinal'))) return
    setDeleting(true)
    setError('')
    try {
      await api('/me', { method: 'DELETE' })
      setMe(null)
      navigate('/signin', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'))
    } finally { setDeleting(false) }
  }

  return (
    <main className={s.page}>
      <BackHeader label={t('profile.title').toUpperCase()} />

      <div className={s.who}>
        <div className={s.avatarWrap}>
          <Avatar name={me.firstName ?? 'Z'} photoUrl={me.avatarUrl} size={88} />
          <button type="button" className={s.changePhoto} aria-label={t('profile.changePhoto')} onClick={() => fileInput.current?.click()}>
            <Camera size={16} color="var(--ink)" />
          </button>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { void changePhoto(e.target.files); e.target.value = '' }} />
        </div>
        <div className={s.nameCol}>
          <h1 className={s.name}>{me.firstName}</h1>
          <span className={s.role}>{isStudent ? t('profile.student') : t('profile.staff')}</span>
        </div>
      </div>

      <div className={s.stats}>
        <div className={s.stat}>
          <span className={s.statNum}>{stats?.posts ?? '–'}</span>
          <span className={s.statLabel}>{t('profile.posts')}</span>
        </div>
        <div className={`${s.stat} ${s.statMid}`}>
          <span className={s.statNum}>{stats?.gotBack ?? '–'}</span>
          <span className={s.statLabel}>{t('profile.gotBack')}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statNum} style={{ color: 'var(--tan)' }}>{stats?.helpedReturn ?? '–'}</span>
          <span className={s.statLabel}>{t('profile.helped')}</span>
        </div>
      </div>

      <div className={s.settings}>
        <span className={s.section}>{t('profile.settings')}</span>
        <div className={s.row}>
          <span className={s.rowText}>
            <span className={s.rowTitle}>{t('profile.alerts')}</span>
            <span className={s.rowSub}>{t('profile.alerts.sub')}</span>
          </span>
          <Switch
            checked={me.matchAlerts}
            onChange={(v) => {
              void patch({ matchAlerts: v })
              // Turning alerts on is a tap: the moment the browser allows asking for push permission.
              if (v && pushState() === 'default') void enablePush().catch(() => undefined)
            }}
            label={t('profile.alerts')}
          />
        </div>
        <div className={s.row}>
          <span className={s.rowText}>
            <span className={s.rowTitle}>{t('profile.showName')}</span>
            <span className={s.rowSub}>{t('profile.showName.sub')}</span>
          </span>
          <Switch checked={me.showFirstName} onChange={(v) => patch({ showFirstName: v })} label={t('profile.showName')} />
        </div>
        <div className={s.link}>
          <span className={s.rowTitle}>{t('profile.language')}</span>
          <span className={s.lang}>EN</span>
        </div>
        <Link to="/tips" className={s.link}>
          <span className={s.rowTitle}>{t('profile.tips')}</span>
          <ChevronRight size={18} color="var(--chevron)" />
        </Link>
        <Link to="/help" className={s.link} style={{ borderBottom: 'none' }}>
          <span className={s.rowTitle}>{t('profile.help')}</span>
          <ChevronRight size={18} color="var(--chevron)" />
        </Link>
        {me.isAdmin && (
          <Link to="/admin" className={s.link} style={{ borderTop: '1px solid var(--line)' }}>
            <span className={s.rowTitle}>{t('profile.admin')}</span>
            <ChevronRight size={18} color="var(--chevron)" />
          </Link>
        )}
      </div>

      {error && <p className={s.error}>{error}</p>}

      <button
        type="button"
        className={s.signOut}
        onClick={() => signOut().then(() => navigate('/signin', { replace: true }))}
      >
        <SignOut size={20} />
        {t('profile.signOut')}
      </button>
      <button type="button" className={s.deleteLink} disabled={deleting} onClick={deleteAccount}>
        {t(deleting ? 'profile.deleting' : 'profile.delete')}
      </button>
    </main>
  )
}
