import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cached } from "./cache.js";

// Runs a model through the official Codex CLI, signed in with the user's ChatGPT account.
// Codex wraps every request in its own agent instructions (~12k input tokens). To report
// what a direct API call would use, a trivial "baseline" call is measured once and its
// input tokens are subtracted. Latency is kept as measured and includes CLI start-up.

const CODEX_JS = path.join(process.env.APPDATA || "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js");

function runCodex(model, prompt, imagePaths, schema) {
  return new Promise(async (resolve, reject) => {
    const dir = await mkdtemp(path.join(tmpdir(), "lostra-codex-"));
    const schemaFile = path.join(dir, "schema.json");
    const lastFile = path.join(dir, "last.txt");
    const args = [CODEX_JS, "exec", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "-s", "read-only", "-C", dir, "-m", model, "--json", "-o", lastFile];
    if (schema) {
      await writeFile(schemaFile, JSON.stringify(schema));
      args.push("--output-schema", schemaFile);
    }
    for (const img of imagePaths) args.push("-i", img);
    args.push("-"); // prompt from stdin: no quoting or length limits

    const started = performance.now();
    const child = spawn(process.execPath, args, { cwd: dir, windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill(), 180_000);
    child.on("error", reject);
    child.on("close", async () => {
      clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - started);
      try {
        const events = stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
        const failed = events.find((e) => e.type === "turn.failed" || e.type === "error");
        const usage = events.find((e) => e.type === "turn.completed")?.usage;
        if (!usage) throw new Error(`Codex call failed: ${failed ? JSON.stringify(failed).slice(0, 400) : stderr.slice(-400)}`);
        const text = (await readFile(lastFile, "utf8")).trim();
        resolve({ text, usage, latencyMs });
      } catch (err) {
        reject(err);
      } finally {
        rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    });
    child.stdin.end(prompt);
  });
}

let baselinePromise;
/** Codex's own overhead for a trivial prompt, measured once per model and cached on disk. */
export function codexBaseline(model) {
  baselinePromise ??= cached("codex-baseline", { model, v: 1 }, async () => {
    const r = await runCodex(model, "Reply with exactly the word: ok", [], null);
    return { inputTokens: r.usage.input_tokens, overheadLatencyMs: r.latencyMs };
  });
  return baselinePromise;
}

/**
 * Structured call through Codex. Returns the same shape as chatJson:
 * {parsed, inputTokens, cachedInputTokens, outputTokens, latencyMs, fromCache, rawCodexInputTokens}.
 */
export async function codexJson({ model, system, text, imagePaths, schema, useCache = true }) {
  const prompt =
    `${system}\n\nAnswer only with the JSON object described by the output schema. ` +
    `Do not run commands, read files or browse; everything you need is below${imagePaths.length ? " and in the attached images" : ""}.\n\n${text}`;
  const imageNames = imagePaths.map((p) => path.basename(p)); // photo files are named by content hash
  return cached(
    "codex",
    { model, prompt, imageNames, schema },
    async () => {
      const base = await codexBaseline(model);
      const r = await runCodex(model, prompt, imagePaths, schema);
      return {
        parsed: JSON.parse(r.text),
        inputTokens: Math.max(0, r.usage.input_tokens - base.inputTokens),
        cachedInputTokens: 0,
        outputTokens: (r.usage.output_tokens || 0) + (r.usage.reasoning_output_tokens || 0),
        rawCodexInputTokens: r.usage.input_tokens,
        codexOverheadMs: base.overheadLatencyMs,
        latencyMs: r.latencyMs, // includes Codex CLI start-up; see codexOverheadMs
      };
    },
    { enabled: useCache },
  );
}
