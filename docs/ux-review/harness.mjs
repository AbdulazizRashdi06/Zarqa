// Shared screenshot harness for the UX review. Import from a script placed anywhere under web/.ux-review/:
//   import { launch, shot, axe, ME } from '../harness.mjs'   (adjust the relative path)
// The app runs at BASE (Vite dev). Every /api call is answered from `mocks`; nothing reaches a real server.
import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const BASE = process.env.UX_BASE || 'http://localhost:5173'
export const ME = { id: 'u-owner', email: 'maryam@student.gutech.edu.om', firstName: 'Maryam', suggestedFirstName: null, showFirstName: true,
  matchAlerts: false, locale: 'en', avatarUrl: null, isAdmin: false, isRsa: false, needsConsent: false }

/**
 * mocks: { '/me/stats': json, 'POST /reports': { status: 400, json: { error: '…' } }, '/reports/*': (route, req) => … , … }
 * Keys are paths under /api, optionally prefixed by a method; '*' matches one path segment, '**' the rest.
 * A value is JSON (200), or { status, json, delayMs }, or a function(route, request). me: null means signed out (401).
 * Returns { browser, context, page, unmocked } - `unmocked` lists API calls that had no mock (they get 404).
 */
export async function launch({ width = 390, height = 844, reducedMotion = false, me = ME, mocks = {}, delayMs = 0, offline = false, deviceScaleFactor = 2 } = {}) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, serviceWorkers: 'block', reducedMotion: reducedMotion ? 'reduce' : 'no-preference', hasTouch: width < 700, isMobile: width < 700 })
  const page = await context.newPage()
  const unmocked = []
  const table = { '/me': me === null ? { status: 401, json: {} } : me, '/me/stats': { posts: 0, gotBack: 0, helpedReturn: 0 }, ...mocks }
  const rx = k => new RegExp('^' + k.split('**').map(part => part.split('*').map(lit => lit.replace(/[^A-Za-z0-9/_-]/g, c => '[' + c + ']')).join('[^/]+')).join('.*') + '$')
  const entries = Object.entries(table).map(([k, v]) => { const m = k.match(/^(GET|POST|PATCH|DELETE) (.*)$/); return { method: m?.[1], rx: rx(m ? m[2] : k), v, specific: (m ? 1000 : 0) + k.length - (k.includes('*') ? 500 : 0) } }).sort((a, b) => b.specific - a.specific)
  await page.route('**/api/**', async (route, request) => {
    const url = new URL(request.url()); const path = url.pathname.replace(/^\/api/, '')
    const hit = entries.find(e => (!e.method || e.method === request.method()) && e.rx.test(path))
    if (!hit) { unmocked.push(`${request.method()} ${path}${url.search}`); return route.fulfill({ status: 404, json: { error: 'Not found.' } }) }
    if (typeof hit.v === 'function') return hit.v(route, request)
    const isSpec = hit.v && typeof hit.v === 'object' && !Array.isArray(hit.v) && ('status' in hit.v || 'delayMs' in hit.v) && ('json' in hit.v || 'status' in hit.v)
    const spec = isSpec ? hit.v : { json: hit.v }
    const wait = spec.delayMs ?? delayMs
    if (wait) await new Promise(r => setTimeout(r, wait))
    if (spec.status === 204) return route.fulfill({ status: 204 })
    return route.fulfill({ status: spec.status ?? 200, json: spec.json ?? {} })
  })
  if (offline) await context.setOffline(true)
  return { browser, context, page, unmocked }
}

/** Screenshot after animations settle. `file` is a path; parent folders are created. */
export async function shot(page, file, { fullPage = true, settle = 1300 } = {}) {
  mkdirSync(dirname(file), { recursive: true })
  await page.waitForTimeout(settle)
  await page.screenshot({ path: file, fullPage })
  return file
}

/** axe-core scan, WCAG 2.2 AA tags. Returns [{ id, impact, help, nodes: [selector…] }]. */
export async function axe(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  return violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.target.join(' ')) }))
}

/** Interactive elements smaller than `min` px in either dimension (WCAG 2.5.8 is 24; comfortable touch is 44). */
export async function smallTargets(page, min = 44) {
  return page.evaluate(min => [...document.querySelectorAll('a[href], button, input, select, textarea, [role=button], [role=tab], [role=checkbox], summary, label')]
    .map(el => { const r = el.getBoundingClientRect(); return { tag: el.tagName.toLowerCase(), text: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || '').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) } })
    .filter(t => t.w > 0 && t.h > 0 && (t.w < min || t.h < min)), min)
}
