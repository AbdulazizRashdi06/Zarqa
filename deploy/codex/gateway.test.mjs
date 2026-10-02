import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGateway, parseChat } from './gateway.mjs'

const body = () => ({ model: 'gpt-6-luna', messages: [{ role: 'system', content: 'Review this item' }, { role: 'user', content: [{ type: 'text', text: 'Blue umbrella' }] }], response_format: { type: 'json_schema', json_schema: { schema: { type: 'object', properties: { match: { type: 'boolean' } } } } } })
test('external images, different models and tool messages are rejected', () => {
  let b = body(); b.messages[1].content.push({ type: 'image_url', image_url: { url: 'https://example.com/private' } })
  assert.throws(() => parseChat(b))
  b = body(); b.model = 'other'; assert.throws(() => parseChat(b))
  b = body(); b.messages[1].role = 'tool'; assert.throws(() => parseChat(b))
})
test('inline photos are decoded without accessing URLs or filesystem paths', () => {
  const b = body(); b.messages[1].content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YWJj' } })
  const parsed = parseChat(b)
  assert.equal(parsed.images[0].bytes.toString(), 'abc')
  assert.equal(parsed.images[0].extension, 'jpg')
})
async function withServer(fn, runner, auth = async () => true) {
  const server = createGateway(runner, auth)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try { await fn(`http://127.0.0.1:${server.address().port}`) }
  finally { await new Promise(resolve => server.close(resolve)) }
}
const post = (base, request = body()) => fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
test('signed-out gateway refuses inference without invoking Codex', async () => {
  await withServer(async base => { assert.equal((await post(base)).status, 503) }, () => assert.fail('Runner must not be called'), async () => false)
})
test('structured review maps result and usage to the API client contract', async () => {
  await withServer(async base => {
    const response = await post(base); assert.equal(response.status, 200)
    const json = await response.json()
    assert.deepEqual(JSON.parse(json.choices[0].message.content), { match: true })
    assert.equal(json.usage.prompt_tokens, 120)
    assert.equal(json.usage.completion_tokens, 14)
  }, async input => { assert.equal(input.text, 'Blue umbrella'); return { parsed: { match: true }, usage: { input_tokens: 120, output_tokens: 10, reasoning_output_tokens: 4 } } })
})
test('private diagnostics never appear in inference errors', async () => {
  await withServer(async base => {
    const response = await post(base); assert.equal(response.status, 502)
    assert.doesNotMatch(await response.text(), /private-token|private-report/)
  }, async () => { throw new Error('private-token private-report') })
})
