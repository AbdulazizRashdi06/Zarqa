// Explicit opt-in live phone browser smoke test. Only creates/deletes its own fixtures.
// --models waits for a real model decision; default mode inserts a synthetic match.
import { chromium, expect } from '../web/node_modules/@playwright/test/index.mjs'
import { execFile } from 'node:child_process'
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { mkdirSync, readFileSync } from 'node:fs'
if (!process.argv.includes('--live')) throw new Error('Use --live to test tryzarqa.com with disposable fixtures')
const strings = JSON.parse(readFileSync(new URL('../web/src/i18n/en.json', import.meta.url)))
const t = key => strings[key]
const url = 'https://tryzarqa.com'
const realModels = process.argv.includes('--models')
const run = async script => {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const child = execFile('ssh', ['-i', `${homedir()}/.ssh/zarqa_vps`, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'deploy@173.249.40.122', 'bash -s'], { encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve(stdout))
        child.stdin.end(script)
      })
      return result.trim()
    } catch (error) {
      if (attempt >= 2 || error.code !== 255) throw error
      console.log('SSH connection interrupted; retrying in 15 seconds.')
      await new Promise(resolve => setTimeout(resolve, 15000))
    }
  }
}
const sql = query => run(`cd /opt/zarqa\ndocker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T postgres psql -X -v ON_ERROR_STOP=1 -qAt -U zarqa -d zarqa <<'SQL'\n${query}\nSQL\n`)
const browser = await chromium.launch()
const contexts = []
const emails = []
mkdirSync('test-results', { recursive: true })
async function signIn(role) {
  const email = `smoke.${Date.now()}.${role}@gutech.edu.om`
  emails.push(email)
  const code = String(randomInt(1000000)).padStart(6, '0'), salt = randomBytes(16)
  const hash = `${salt.toString('base64')}.${createHash('sha256').update(salt).update(`${email}\n${code}`).digest('base64')}`
  await sql(`INSERT INTO login_codes (id,email,code_hash,expires_at,attempts,created_at) VALUES (gen_random_uuid(),'${email}','${hash}',now()+interval '5 minutes',0,now());`)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  contexts.push(context)
  const page = await context.newPage()
  // Avoid sending sign-in mail: the normal verification endpoint consumes the DB fixture.
  await page.route('**/api/auth/request-code', r => r.fulfill({ json: { email } }))
  await page.goto(`${url}/signin`)
  await page.locator('#email').fill(email)
  await page.getByRole('button', { name: t('signin.send'), exact: true }).click()
  await page.locator('#code').fill(code)
  await page.waitForURL('**/welcome')
  await page.locator('#first-name').fill(`Smoke ${role}`)
  await page.getByRole('button', { name: t('welcome.go'), exact: true }).click()
  await page.waitForURL(url + '/')
  const res = await context.request.get(`${url}/api/me`)
  const me = await res.json()
  // Reserved invalid domain ensures automatic claim emails cannot reach a real person.
  await sql(`UPDATE users SET email='${me.id}@example.invalid',match_alerts=false WHERE id='${me.id}';`)
  return { page, context, id: me.id }
}
async function post(user, kind) {
  const p = user.page
  if (kind === 'found') await p.getByRole('button', { name: /TAG 02/ }).click()
  await p.locator('#item-cat').fill('Other')
  await p.locator('#item-name').fill('Smoke test blue umbrella')
  await p.locator('#item-desc').fill('Synthetic launch check. Blue umbrella with a yellow star sticker.')
  await p.locator('#item-loc').fill('Library')
  await p.locator('#item-name').click()
  const posted = p.waitForResponse(r => r.url() === `${url}/api/reports` && r.request().method() === 'POST')
  await p.getByRole('button', { name: t(`form.submit.${kind}`), exact: true }).click()
  const res = await posted
  if (!res.ok()) throw new Error(`Post ${kind}: ${res.status()}`)
  await p.waitForURL('**/reports')
  return (await res.json()).id
}
try {
  for (const path of ['terms', 'privacy', 'help', 'tips']) {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const p = await c.newPage(); await p.goto(`${url}/${path}`)
    await expect(p.getByRole('heading', { name: t(`info.${path}.title`), exact: true })).toBeVisible()
    await c.close()
  }
  const owner = await signIn('owner'), finder = await signIn('finder')
  const lost = await post(owner, 'lost'), found = await post(finder, 'found')
  let match
  if (realModels) {
    console.log('Waiting for the real embedding, Luna and Jev pipeline...')
    const deadline = Date.now() + 240000
    while (Date.now() < deadline) {
      const reports = await (await owner.context.request.get(`${url}/api/reports/mine`)).json()
      match = reports.find(r => r.id === lost)?.matchId
      if (match) break
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    if (!match) {
      const jobs = await sql(`SELECT json_build_object('attempts',attempts,'finished',completed_at IS NOT NULL,'hasError',last_error IS NOT NULL) FROM match_jobs WHERE report_id IN ('${lost}','${found}');`)
      console.log('Test job status:', jobs)
      throw new Error('No real match appeared within four minutes')
    }
    const decision = await sql(`SELECT decided_by || ' score=' || final_score FROM matches WHERE id='${match}' AND lost_id='${lost}' AND found_id='${found}';`)
    if (!decision.startsWith('Debate')) throw new Error(`Expected direct Jev debate; got ${decision}`)
    console.log('Real model match:', decision)
  } else {
    match = randomUUID()
    await sql(`INSERT INTO matches (id,lost_id,found_id,prescore,final_score,decided_by,reasons,status,created_at) VALUES ('${match}','${lost}','${found}',0.9,0.9,'LunaFallback',ARRAY['Synthetic smoke-test fixture; not a model result'],'Suggested',now());`)
  }
  await owner.page.goto(`${url}/matches/${match}`)
  await expect(owner.page.getByRole('button', { name: t('match.mine'), exact: true })).toBeVisible()
  await owner.page.screenshot({ path: 'test-results/live-match-phone.png', fullPage: true })
  await owner.page.getByRole('button', { name: t('match.mine'), exact: true }).click()
  await owner.page.waitForURL('**/chats/*')
  const chatUrl = owner.page.url()
  await finder.page.goto(chatUrl)
  await owner.page.locator('#chat-input').fill('Synthetic check: meeting at the library.')
  await owner.page.getByRole('button', { name: t('chat.send'), exact: true }).click()
  await expect(finder.page.getByText('Synthetic check: meeting at the library.', { exact: true })).toBeVisible({ timeout: 15000 })
  await owner.page.getByRole('button', { name: t('chat.suggestTime'), exact: true }).click()
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  await owner.page.getByLabel(t('form.date'), { exact: true }).fill(tomorrow)
  await owner.page.getByLabel(t('form.time'), { exact: true }).fill('12:00')
  await owner.page.getByLabel(t('chat.plan.place'), { exact: true }).fill('Library entrance')
  await owner.page.getByRole('button', { name: t('chat.plan.send'), exact: true }).click()
  await finder.page.getByRole('button', { name: t('chat.handover.confirm'), exact: true }).click({ timeout: 15000 })
  await expect(finder.page.getByText(t('chat.handover.confirmed'), { exact: true })).toBeVisible()
  await owner.page.getByRole('button', { name: t('chat.gotItBack'), exact: true }).click()
  await expect(owner.page.getByRole('dialog')).toBeVisible()
  await owner.page.getByRole('dialog').locator('img').evaluate(img => img.decode())
  await owner.page.screenshot({ path: 'test-results/live-returned-phone.png', fullPage: true })
  const stats = await (await owner.context.request.get(`${url}/api/me/stats`)).json()
  const helped = await (await finder.context.request.get(`${url}/api/me/stats`)).json()
  if (stats.gotBack !== 1 || helped.helpedReturn !== 1) throw new Error('Return stats did not update')
  console.log(`PASS: public pages, real code verification, two reports, ${realModels ? 'real Jev debate' : 'synthetic'} match, claim, chat, confirmed handover, return and both stats at 390x844.`)
  // Also exercise the new deletion UI against the real endpoint.
  await owner.page.goto(`${url}/profile`)
  let confirmations = 0
  owner.page.on('dialog', async d => { confirmations++; await d.accept() })
  await owner.page.getByRole('button', { name: t('profile.delete'), exact: true }).click()
  await owner.page.waitForURL('**/signin')
  if (confirmations !== 2) throw new Error('Expected two deletion confirmations')
  console.log('PASS: live account deletion required two confirmations and returned to sign-in.')
} finally {
  let failed = false
  for (const c of contexts) {
    const response = await c.request.delete(`${url}/api/me`)
    if (![204, 401].includes(response.status())) { failed = true; console.error('Fixture cleanup failed:', response.status()) }
    await c.close()
  }
  for (const email of emails) await sql(`DELETE FROM login_codes WHERE email='${email}';`)
  await browser.close()
  if (failed) throw new Error('Some fixture accounts need cleanup')
}
