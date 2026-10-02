import { RUNTIME } from "../config.js";

/** POST JSON with retries on 429/5xx/network errors. Throws with the response body on other failures. */
export async function postJson(url, body, headers, { attempts = 4 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(RUNTIME.requestTimeoutMs),
      });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      lastErr = new Error(`${url} → HTTP ${res.status}: ${text.slice(0, 500)}`);
      if (res.status !== 429 && res.status < 500) throw lastErr;
    } catch (err) {
      lastErr = err;
      if (err.message?.includes("HTTP 4") && !err.message.includes("HTTP 429")) throw err;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i + Math.random() * 250));
  }
  throw lastErr;
}
