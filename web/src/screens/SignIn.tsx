import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Link } from '../lib/nav'
import { useNavigate } from '../lib/transition'
import { useBack } from '../lib/back'
import { returnPath, useSession, type Me } from '../auth/session'
import { clearSignIn, liveCodeAddress, loadSignIn, loadTick, saveSignIn, saveTick } from '../auth/signinDraft'
import { ConsentCheck } from '../components/ConsentCheck'
import { BigButton, MonoLabel, Wordmark, ZarqaBubble } from '../components/ui'
import { zarqaMotion } from '../components/zarqaMotion'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import { CONSENT_VERSION } from '../lib/consent'
import s from './SignIn.module.css'

const RESEND_AFTER = 30

export default function SignIn() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const back = useBack()
  const [email, setEmail] = useState(() => loadSignIn().email ?? '')
  const [accepted, setAccepted] = useState(loadTick)
  const [sentTo, setSentTo] = useState(() => liveCodeAddress() ?? '')
  // Opened again (reload, the app relaunched after a trip to the mail app) while the last code still works:
  // straight back to the code boxes.
  const [resumed, setResumed] = useState(() => params.get('step') !== 'code' && !!liveCodeAddress())
  const [testCode, setTestCode] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState<'email' | 'consent' | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(() => {
    const { sentAt } = loadSignIn()
    return typeof sentAt === 'number' ? Math.max(0, RESEND_AFTER - Math.floor((Date.now() - sentAt) / 1000)) : 0
  })
  const emailRef = useRef<HTMLInputElement>(null)

  // The code step has its own history entry (?step=code), so the phone's Back returns to the email form.
  const step = sentTo && (params.get('step') === 'code' || resumed) ? 'code' : 'email'

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  // Back on the email form from the code boxes: the cursor waits in the address.
  const lastStep = useRef(step)
  useEffect(() => {
    if (lastStep.current === 'code' && step === 'email') emailRef.current?.focus()
    lastStep.current = step
  }, [step])

  function toCodeStep() {
    setResumed(false)
    navigate('/signin?step=code', { dir: 'forward' })
  }

  function fieldError(message: string, field: 'email' | 'consent' | null) {
    setError(message)
    setInvalid(field)
    if (field === 'consent') {
      const box = document.getElementById('consent')
      box?.scrollIntoView({ block: 'center' })
      box?.focus()
    } else emailRef.current?.focus()
  }

  /** Sends a code to the typed address (email step) or again to the same one (Resend). True when sent. */
  async function sendCode(e?: FormEvent): Promise<boolean> {
    e?.preventDefault()
    if (busy) return false
    const resend = step === 'code'
    const address = resend ? sentTo : email.trim()
    if (!resend) {
      if (!address) {
        fieldError(t('signin.needEmail'), 'email')
        return false
      }
      if (!accepted) {
        fieldError(t('signin.needConsent'), 'consent')
        return false
      }
    }
    setBusy(true)
    setError('')
    setInvalid(null)
    try {
      const r = await api<{ email: string; testCode?: string }>('/auth/request-code', { body: { email: address } })
      setSentTo(r.email)
      saveSignIn({ sentTo: r.email, sentAt: Date.now() })
      setTestCode(r.testCode ?? null)
      setCooldown(RESEND_AFTER)
      if (!resend) toCodeStep()
      return true
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('common.error')
      if (!resend && err instanceof ApiError && err.status === 429) {
        // Codes already went to this address and still work: go and type one instead of waiting.
        setSentTo(address)
        setError(message)
        toCodeStep()
      } else if (!resend) fieldError(message, err instanceof ApiError && err.status === 400 ? 'email' : null)
      else setError(message)
      return false
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
        resending={busy}
        resend={() => sendCode()}
        back={() => {
          setError('')
          if (resumed) setResumed(false)
          else back('/signin')
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
      <p className={s.intro} data-enter style={{ '--delay': '420ms' }}>
        {t('signin.intro')}
      </p>

      <form className={s.form} onSubmit={sendCode} noValidate data-enter style={{ '--delay': '440ms' }}>
        <label htmlFor="email" className={s.label}>
          {t('signin.emailLabel')}
        </label>
        <input
          ref={emailRef}
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          className={s.input}
          placeholder="name@student.gutech.edu.om"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            saveSignIn({ email: e.target.value })
            if (invalid === 'email') setInvalid(null)
          }}
          aria-invalid={invalid === 'email'}
          aria-describedby={error ? 'signin-error' : 'email-help'}
        />
        <ConsentCheck
          checked={accepted}
          invalid={invalid === 'consent'}
          onChange={(v) => {
            setAccepted(v)
            saveTick(v)
            if (v && invalid === 'consent') {
              setInvalid(null)
              setError('')
            }
          }}
        />
        {error && (
          <p key={error} id="signin-error" className={s.error} role="alert" data-shake>
            {error}
          </p>
        )}
        <div style={{ marginTop: 8 }}>
          <BigButton type="submit" label={busy ? t('signin.sending') : t('signin.send')} busy={busy} disabled={busy} />
        </div>
        {/* The same rule as a failed address would repeat it: one line at a time. */}
        {!error && (
          <p id="email-help" className={s.help}>
            {t('signin.help')}
          </p>
        )}
        {!error && liveCodeAddress() && (
          <button
            type="button"
            className={`${s.linkBtn} ${s.haveCode}`}
            onClick={() => {
              setSentTo(liveCodeAddress() ?? '')
              toCodeStep()
            }}
          >
            {t('signin.haveCode')}
          </button>
        )}
      </form>

      <nav className={s.links} aria-label="About" data-enter style={{ '--delay': '500ms' }}>
        <Link to="/help">{t('signin.helpLink')}</Link>
      </nav>
    </main>
  )
}

function CodeStep({
  email,
  testCode,
  cooldown,
  resending,
  resend,
  back,
  resendError,
}: {
  email: string
  testCode: string | null
  cooldown: number
  resending: boolean
  resend: () => Promise<boolean>
  back: () => void
  resendError: string
}) {
  const { setMe, refresh } = useSession()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [resent, setResent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
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
    setResent(false)
    let signedIn = false
    try {
      // The code step is only reachable with the consent box ticked, so this records it with the sign-in.
      await api('/auth/verify', { body: { email, code: value, consentVersion: CONSENT_VERSION } })
      signedIn = true
      clearSignIn()
      const me = await api<Me>('/me')
      navigate(me.firstName ? (returnPath() ?? '/') : '/welcome', { replace: true, dir: 'forward', prepare: () => setMe(me) })
    } catch (err) {
      if (signedIn) {
        // The code worked; only loading the account failed. The session takes it from here (or says it can't
        // reach Zarqa and keeps trying): retyping the spent code would only say it expired.
        await refresh()
        return
      }
      setError(err instanceof ApiError ? err.message : t('common.error'))
      setBlocked(err instanceof ApiError && err.status === 403)
      setCode('')
      sayNo()
      inputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  function onChange(value: string) {
    // Pasting "482 913" or the whole subject line works: only the digits count.
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) verify(digits)
  }

  async function onResend() {
    setError('')
    setResent(false)
    if (await resend()) {
      setCode('')
      setResent(true)
      inputRef.current?.focus()
    }
  }

  const shownError = error || resendError

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
            <span
              key={i}
              aria-hidden="true"
              className={`${s.box} ${focused && i === Math.min(code.length, 5) ? s.boxActive : ''} ${code[i] ? s.boxFilled : ''}`}
            >
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
            autoFocus
            value={code}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-invalid={!!error}
            aria-describedby={shownError ? 'code-error' : undefined}
          />
        </div>
        {shownError && (
          <p id="code-error" className={s.error} role="alert">
            {shownError}
          </p>
        )}
        {resent && !shownError && (
          <p className={s.resent} role="status">
            {t('signin.code.resent', { email })}
          </p>
        )}
        <div style={{ marginTop: 8 }}>
          <BigButton type="submit" label={busy ? t('signin.code.checking') : t('signin.code.go')} busy={busy} disabled={busy || code.length !== 6} />
        </div>
        <div className={s.row}>
          <button type="button" className={s.linkBtn} onClick={back}>
            {t('signin.code.otherEmail')}
          </button>
          {/* A banned account: another code won't help, the Help page will. */}
          {blocked ? (
            <Link to="/help" className={s.linkBtn}>
              {t('signin.helpLink')}
            </Link>
          ) : (
            <button type="button" className={s.linkBtn} onClick={() => void onResend()} disabled={resending || cooldown > 0} aria-busy={resending || undefined}>
              {resending ? t('signin.sending') : cooldown > 0 ? t('signin.code.resendIn', { s: cooldown }) : t('signin.code.resend')}
            </button>
          )}
        </div>
      </form>

      <ZarqaBubble mascot="wink" alt="Zarqa winking" width={64} quiet>
        {t('signin.code.zarqa')}
      </ZarqaBubble>
    </main>
  )
}
