import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGateway, parseChat, isUsageLimit, userMessage, readResult } from './gateway.mjs'

const body = () => ({ model: 'opus', messages: [{ role: 'system', content: 'Review this pair' }, { role: 'user', content: [{ type: 'text', text: 'Blue umbrella' }] }], response_format: { type: 'json_schema', json_schema: { schema: { type: 'object', properties: { match: { type: 'boolean' } } } } } })
test('external images, other models, tool messages and unknown effort levels are rejected', () => {
  let b = body(); b.messages[1].content.push({ type: 'image_url', image_url: { url: 'https://example.com/private' } })
  assert.throws(() => parseChat(b))
  b = body(); b.model = 'gpt-6-luna'; assert.throws(() => parseChat(b))
  b = body(); b.messages[1].role = 'tool'; assert.throws(() => parseChat(b))
  b = body(); b.reasoning_effort = 'max'; assert.throws(() => parseChat(b))
  b = body(); delete b.response_format; assert.throws(() => parseChat(b))
})
test('inline photos become image blocks in the one message Claude Code reads; effort defaults to high', () => {
  const b = body(); b.messages[1].content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YWJj' } })
  const parsed = parseChat(b)
  assert.equal(parsed.reasoningEffort, 'high')
  const line = JSON.parse(userMessage(parsed))
  assert.equal(line.type, 'user')
  assert.deepEqual(line.message.content, [{ type: 'text', text: 'Blue umbrella' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'YWJj' } }])
})
test('the answer is read from the result line only, and an error result never yields an answer', () => {
  const ok = [JSON.stringify({ type: 'system', subtype: 'init' }), 'not json', JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: { match: true }, usage: { input_tokens: 2, output_tokens: 9 } })]
  assert.deepEqual(readResult(ok), { parsed: { match: true }, usage: { input_tokens: 2, output_tokens: 9 } })
  assert.throws(() => readResult([JSON.stringify({ type: 'assistant' })]))
  assert.throws(() => readResult([JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'plain words' })]))
  try { readResult([JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, api_error_status: 429 })]); assert.fail('must throw') }
  catch (e) { assert.equal(e.usageLimit, true) }
  try { readResult([JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'private-report text' })]); assert.fail('must throw') }
  catch (e) { assert.equal(e.usageLimit, false); assert.doesNotMatch(e.message, /private-report/) }
})
async function withServer(fn, runner, auth = async () => true) {
  const server = createGateway(runner, auth)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try { await fn(`http://127.0.0.1:${server.address().port}`) }
  finally { await new Promise(resolve => server.close(resolve)) }
}
const post = (base, request = body()) => fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
test('a signed-out gateway refuses a review without starting Claude Code', async () => {
  await withServer(async base => { assert.equal((await post(base)).status, 503) }, () => assert.fail('Runner must not be called'), async () => false)
})
test('a review maps the answer and token counts to the API client contract', async () => {
  await withServer(async base => {
    const response = await post(base); assert.equal(response.status, 200)
    const json = await response.json()
    assert.deepEqual(JSON.parse(json.choices[0].message.content), { match: true })
    assert.equal(json.usage.prompt_tokens, 4002)
    assert.equal(json.usage.completion_tokens, 150)
    assert.equal(json.usage.prompt_tokens_details.cached_tokens, 3000)
  }, async input => { assert.equal(input.text, 'Blue umbrella'); return { parsed: { match: true }, usage: { input_tokens: 2, cache_creation_input_tokens: 1000, cache_read_input_tokens: 3000, output_tokens: 150 } } })
})
test('private diagnostics never appear in review errors', async () => {
  await withServer(async base => {
    const response = await post(base); assert.equal(response.status, 502)
    assert.doesNotMatch(await response.text(), /private-token|private-report/)
  }, async () => { throw new Error('private-token private-report') })
})
test('a plan limit answers 429 and says nothing else', async () => {
  assert.equal(isUsageLimit({ is_error: true, result: 'You have hit your usage limit' }), true)
  assert.equal(isUsageLimit({ is_error: true, result: 'Something else broke' }), false)
  await withServer(async base => {
    const response = await post(base); assert.equal(response.status, 429)
    assert.deepEqual(await response.json(), { error: 'Claude usage limit reached' })
  }, async () => { throw Object.assign(new Error('private-report'), { usageLimit: true }) })
})
test('extra reviews wait their turn instead of failing', async () => {
  let running = 0, peak = 0
  const server = createGateway(async () => { running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 30)); running--; return { parsed: { match: true }, usage: {} } }, async () => true, { maxRunning: 2 })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const statuses = await Promise.all(Array.from({ length: 6 }, () => post(base).then(r => r.status)))
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200])
    assert.equal(peak, 2)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
