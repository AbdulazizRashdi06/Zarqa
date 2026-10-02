import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useSession, type Me } from '../auth/session'
import { BigButton, MonoLabel, Wordmark, ZarqaBubble } from '../components/ui'
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
      <div className={s.top} style={{ justifyContent: 'flex-end' }}>
        <MonoLabel color="var(--text-muted)">GUTECH · MUSCAT</MonoLabel>
      </div>

      <img src="/mascot/lookout.png" alt="Zarqa shading her eyes, looking far into the distance" className={s.hero} />

      <h1 className={s.title}>
        {t('signin.h1')}
        <br />
        <span className={s.outline}>{t('signin.h2')}</span>
        <br />
        <img src="/logo.png" alt={t('signin.h3')} className={s.titleLogo} />
      </h1>

      <p className={s.legend}>{t('signin.legend')}</p>

      <form className={s.form} onSubmit={sendCode} noValidate>
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
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div style={{ marginTop: 8 }}>
          <BigButton type="submit" label={busy ? t('signin.sending') : t('signin.send')} disabled={busy || !email.trim()} />
        </div>
        <p id="email-help" className={s.help}>
          {t('signin.help')}
        </p>
      </form>

      <nav className={s.links} aria-label="About">
        <a href="#">{t('signin.terms')}</a>
        <a href="#">{t('signin.privacy')}</a>
        <a href="#">{t('signin.helpLink')}</a>
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

  async function verify(value: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api('/auth/verify', { body: { email, code: value } })
      const me = await api<Me>('/me')
      setMe(me)
      navigate(me.firstName ? '/' : '/welcome', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
      setCode('')
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
        <MonoLabel color="var(--text-muted)">GUTECH · MUSCAT</MonoLabel>
      </div>

      {testCode && (
        <div className={s.testMode} role="note">
          <MonoLabel color="var(--ink)">{t('signin.test.title')}</MonoLabel>
          <span>{t('signin.test.body')}</span>
          <BigButton variant="dark" label={t('signin.test.use', { code: testCode })} labelSize={22} disabled={busy} onClick={() => verify(testCode)} />
        </div>
      )}

      <h1 className={s.codeTitle} style={{ marginTop: testCode ? 0 : 40 }}>
        {t('signin.code.h1')}
        <br />
        <span style={{ color: 'var(--tan)' }}>{t('signin.code.h2')}</span>
      </h1>
      <p className={s.sentTo}>
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
        <div className={s.code}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} aria-hidden="true" className={`${s.box} ${i === Math.min(code.length, 5) ? s.boxActive : ''}`}>
              {code[i] ?? ''}
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
          <BigButton type="submit" label={busy ? t('signin.code.checking') : t('signin.code.go')} disabled={busy || code.length !== 6} />
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
