// Phone-layout screenshots of the running dev app (390×844 at 2×, like the design mockups).
//
//   node scripts/phone-shot.mjs --login <email> <code> --state <file>      sign in once, save the session
//   node scripts/phone-shot.mjs --state <file> --out <png> [--path /] [--click "FOUND"] [--full]
//
// The dev servers must be running (web on :5173, api on :5284).
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const base = opt('--base') ?? 'http://localhost:5173'
const state = opt('--state')

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  storageState: args.includes('--login') ? undefined : state,
})
const page = await context.newPage()

if (args.includes('--login')) {
  const i = args.indexOf('--login')
  const [email, code] = [args[i + 1], args[i + 2]]
  await page.goto(base)
  const status = await page.evaluate(
    async ([email, code]) =>
      (await fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) })).status,
    [email, code],
  )
  if (status !== 200) throw new Error(`sign-in failed: HTTP ${status}`)
  await context.storageState({ path: state })
  console.log(`signed in, session saved to ${state}`)
} else {
  await page.goto(base + (opt('--path') ?? '/'))
  await page.waitForLoadState('networkidle')
  const click = opt('--click')
  if (click) await page.getByRole('button', { name: new RegExp(click) }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: opt('--out'), fullPage: args.includes('--full') })
  console.log(`saved ${opt('--out')}`)
}
await browser.close()
