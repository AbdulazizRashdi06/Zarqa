import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from '../lib/nav'
import { useNavigate } from '../lib/transition'
import { useSession, type Me } from '../auth/session'
import { BigButton, MonoLabel, Wordmark, ZarqaBubble } from '../components/ui'
import { zarqaMotion } from '../components/zarqaMotion'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import s from './SignIn.module.css'

const RESEND_AFTER = 30

export default function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [testCode, setTestCode] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const r = await api<{ email: string; testCode?: string }>('/auth/request-code', { body: { email } })
      setSentTo(r.email)
      setTestCode(r.testCode ?? null)
      setStep('code')
      setCooldown(RESEND_AFTER)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'code') {
    return (
      <CodeStep
        email={sentTo}
        testCode={testCode}
        cooldown={cooldown}
        resend={() => sendCode()}
        back={() => {
          setStep('email')
          setError('')
        }}
        resendError={error}
      />
    )
  }

  return (
    <main className={s.page}>
      {/* She slides in from the edge, then keeps scanning the horizon: a slow sway from the mascot skill's preset. */}
      <div className={s.hero}>
        <img src="/mascot/lookout.webp" fetchPriority="high" alt="Zarqa shading her eyes, looking far into the distance" className={zarqaMotion('sway', false)} />
      </div>

      {/* The first screen anyone sees, once per phone: the headline arrives line by line. */}
      <h1 className={s.title}>
        <span className={s.line} data-enter="headline" style={{ '--delay': '80ms' }}>
          {t('signin.h1')}
        </span>{' '}
        <span className={s.line} data-enter="headline" style={{ '--delay': '170ms' }}>
          <span className={s.outline}>{t('signin.h2')}</span>
        </span>{' '}
        <span className={s.line} data-enter="headline" style={{ '--delay': '260ms' }}>
          <img src="/logo.webp" alt={t('signin.h3')} className={s.titleLogo} />
        </span>
      </h1>

      <p className={s.legend} data-enter style={{ '--delay': '380ms' }}>
        {t('signin.legend')}
      </p>

      <form className={s.form} onSubmit={sendCode} noValidate data-enter style={{ '--delay': '440ms' }}>
        <label htmlFor="email" className={s.label}>
          {t('signin.emailLabel')}
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          className={s.input}
          placeholder="name@gutech.edu.om"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!error}
          aria-describedby="email-help"
        />
        {error && (
          <p key={error} className={s.error} role="alert" data-shake>
            {error}
          </p>
        )}
        <div style={{ marginTop: 8 }}>
          <BigButton type="submit" label={busy ? t('signin.sending') : t('signin.send')} busy={busy} disabled={busy || !email.trim()} />
        </div>
        <p id="email-help" className={s.help}>
          {t('signin.help')}
        </p>
      </form>

      <nav className={s.links} aria-label="About" data-enter style={{ '--delay': '500ms' }}>
        <Link to="/terms">{t('signin.terms')}</Link>
        <Link to="/privacy">{t('signin.privacy')}</Link>
        <Link to="/help">{t('signin.helpLink')}</Link>
      </nav>
    </main>
  )
}

function CodeStep({
  email,
  testCode,
  cooldown,
  resend,
  back,
  resendError,
}: {
  email: string
  testCode: string | null
  cooldown: number
  resend: () => void
  back: () => void
  resendError: string
}) {
  const { setMe } = useSession()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxes = useRef<HTMLDivElement>(null)

  /** Wrong code: the boxes shake their head, and the phone buzzes where it can. */
  function sayNo() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    boxes.current?.animate(
      [{ translate: '0' }, { translate: '-8px 0' }, { translate: '7px 0' }, { translate: '-4px 0' }, { translate: '2px 0' }, { translate: '0' }],
      { duration: 360, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    )
    navigator.vibrate?.(30)
  }

  async function verify(value: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api('/auth/verify', { body: { email, code: value } })
      const me = await api<Me>('/me')
      navigate(me.firstName ? '/' : '/welcome', { replace: true, dir: 'forward', prepare: () => setMe(me) })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
      setCode('')
      sayNo()
      inputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  function onChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) verify(digits)
  }

  return (
    <main className={s.page}>
      <div className={s.top}>
        <Wordmark size={26} />
      </div>

      {testCode && (
        <div className={s.testMode} role="note">
          <MonoLabel color="var(--ink)">{t('signin.test.title')}</MonoLabel>
          <span>{t('signin.test.body')}</span>
          <BigButton variant="dark" label={t('signin.test.use', { code: testCode })} labelSize={22} disabled={busy} onClick={() => verify(testCode)} />
        </div>
      )}

      <h1 className={s.codeTitle} style={{ marginTop: testCode ? 0 : 40 }} data-enter="headline">
        {t('signin.code.h1')}
        <br />
        <span style={{ color: 'var(--tan)' }}>{t('signin.code.h2')}</span>
      </h1>
      <p className={s.sentTo} data-enter style={{ '--i': 2 }}>
        {t('signin.code.sentTo')} <b>{email}</b>
      </p>

      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault()
          if (code.length === 6) verify(code)
        }}
      >
        <label htmlFor="code" className={s.label}>
          {t('signin.code.label')}
        </label>
        <div className={s.code} ref={boxes}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} aria-hidden="true" className={`${s.box} ${i === Math.min(code.length, 5) ? s.boxActive : ''} ${code[i] ? s.boxFilled : ''}`}>
              {/* Each digit pops into its box as it is typed. */}
              {code[i] && <span className={s.digit}>{code[i]}</span>}
            </span>
          ))}
          <input
            ref={inputRef}
            id="code"
            className={s.codeInput}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={!!error}
          />
        </div>
        {(error || resendError) && (
          <p className={s.error} role="alert">
            {error || resendError}
          </p>
        )}
        <div style={{ marginTop: 8 }}>
          <BigButton type="submit" label={busy ? t('signin.code.checking') : t('signin.code.go')} busy={busy} disabled={busy || code.length !== 6} />
        </div>
        <div className={s.row}>
          <button type="button" className={s.linkBtn} onClick={back}>
            {t('signin.code.otherEmail')}
          </button>
          <button type="button" className={s.linkBtn} onClick={resend} disabled={cooldown > 0}>
            {cooldown > 0 ? t('signin.code.resendIn', { s: cooldown }) : t('signin.code.resend')}
          </button>
        </div>
      </form>

      <ZarqaBubble mascot="wink" alt="Zarqa winking" width={64} quiet>
        {t('signin.code.zarqa')}
      </ZarqaBubble>
    </main>
  )
}
