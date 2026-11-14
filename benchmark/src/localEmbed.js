// Local embedding model (transformers.js), used when no embeddings API is configured.
// all-MiniLM-L6-v2 is smaller and weaker than text-embedding-3-small, and its cosine
// values sit on a slightly different scale, so treat retrieval numbers as approximate.
// LOCAL_EMBEDDING_MODEL picks another transformers.js model, e.g. Xenova/multilingual-e5-small for Arabic text
// (all-MiniLM-L6-v2 was trained on English only).
export const LOCAL_EMBEDDING_MODEL = process.env.LOCAL_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";

let extractor;
export async function localEmbed(texts) {
  if (!extractor) {
    const { pipeline } = await import("@huggingface/transformers");
    extractor = await pipeline("feature-extraction", LOCAL_EMBEDDING_MODEL, { dtype: "q8" });
  }
  const out = [];
  for (let i = 0; i < texts.length; i += 64) {
    const t = await extractor(texts.slice(i, i + 64), { pooling: "mean", normalize: true });
    out.push(...t.tolist());
  }
  return out;
}
