import { CURRENT, OFFLINE_ESTIMATE, RUNTIME } from "../config.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { chatJson } from "./openai.js";
import { usage } from "./reviewers/luna.js";

const SYSTEM = `Describe the item in these lost-and-found photos as structured attributes.
Only state what is visible. Use "" or [] when unsure. Colours: plain names (black, navy, silver...).
distinctiveMarks: stickers, engravings, keychains, cases, damage, name tags, anything that tells this item apart from a similar one.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["itemType", "colors", "brand", "distinctiveMarks"],
  properties: {
    itemType: { type: "string" },
    colors: { type: "array", items: { type: "string" } },
    brand: { type: "string" },
    distinctiveMarks: { type: "array", items: { type: "string" } },
  },
};

/** One vision call per report (paid once at intake, not per pair). Sets report.photoAttributes. */
// The call is kept on the report so the benchmark books it on that report's own cost,
// even when setup already ran it to index the report as a candidate.
export async function extractPhotoAttributes(report, ctx) {
  if (report.photoAttributes !== undefined) return report._photoCall ?? null;
  report._photoCall = await runExtraction(report, ctx);
  return report._photoCall;
}

async function runExtraction(report, ctx) {
  if (ctx.offline) {
    report.photoAttributes = null;
    return report.photos?.length ? { kind: "vision", estimated: true, ...OFFLINE_ESTIMATE.vision } : null;
  }
  const imagePaths = (report.photos || []).slice(0, CURRENT.photosPerReport).map((p) => path.resolve(ctx.dataDir, p)).filter((p) => existsSync(p));
  if (!imagePaths.length) {
    report.photoAttributes = null;
    return null;
  }
  try {
    const res = await chatJson({
      system: SYSTEM,
      text: `Report title: ${report.title || ""}`,
      imagePaths,
      imageDetail: RUNTIME.lunaImageDetail,
      schemaName: "photo_attributes",
      schema: SCHEMA,
      useCache: ctx.useCache,
    });
    report.photoAttributes = res.parsed;
    return { kind: "vision", ...usage(res) };
  } catch (err) {
    report.photoAttributes = null;
    return { kind: "vision", failed: true, error: err.message, inputTokens: 0, outputTokens: 0, latencyMs: 0 };
  }
}
