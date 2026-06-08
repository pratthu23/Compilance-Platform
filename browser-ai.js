const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let extractorPromise = null;

function status(message) {
  window.dispatchEvent(new CustomEvent("browser-ai-status", { detail: { message } }));
}

async function loadExtractor() {
  if (!extractorPromise) {
    status(`Loading browser AI model ${MODEL_ID}...`);
    extractorPromise = import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2")
      .then(({ pipeline, env }) => {
        env.allowLocalModels = false;
        return pipeline("feature-extraction", MODEL_ID);
      })
      .then((extractor) => {
        status("Browser AI model ready");
        return extractor;
      })
      .catch((error) => {
        extractorPromise = null;
        status(`Browser AI unavailable: ${error.message}`);
        throw error;
      });
  }
  return extractorPromise;
}

function flattenEmbedding(tensorLike) {
  const value = tensorLike.tolist();
  return Array.isArray(value[0]) ? value[0] : value;
}

function cosine(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  return dot / Math.max(Math.sqrt(leftNorm) * Math.sqrt(rightNorm), 1e-9);
}

async function embed(text) {
  const extractor = await loadExtractor();
  const output = await extractor(text || "", { pooling: "mean", normalize: true });
  return flattenEmbedding(output);
}

async function semanticSimilarity(leftText, rightText) {
  const [left, right] = await Promise.all([embed(leftText), embed(rightText)]);
  return Math.round(Math.max(0, Math.min(1, cosine(left, right))) * 100);
}

async function enhanceEvidence(map, evidenceText, backendResult = {}) {
  const semanticCoverage = await semanticSimilarity(map?.source || map?.task || "", evidenceText || "");
  const existingCoverage = Number(backendResult.coverage || 0);
  const coverage = Math.max(existingCoverage, semanticCoverage);
  const verdict = coverage >= 60 ? "Pass" : coverage >= 35 ? "Needs Review" : "Fail";
  return {
    ...backendResult,
    mapId: backendResult.mapId || map?.id || "MAP",
    verdict,
    coverage,
    browserSemanticCoverage: semanticCoverage,
    reasoning: `${backendResult.reasoning || "Evidence reviewed."} Browser model ${MODEL_ID} semantic score: ${semanticCoverage}%.`,
    matched: backendResult.matched || backendResult.matchedTerms || []
  };
}

window.browserAI = {
  modelId: MODEL_ID,
  load: loadExtractor,
  embed,
  semanticSimilarity,
  enhanceEvidence
};

status("Browser AI module loaded");
