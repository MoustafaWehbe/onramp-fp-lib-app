import { ollamaPost } from "./client";

/** Embedding model name from env (must be pulled on the Ollama host). */
function embeddingModel(): string {
  const model = process.env.OLLAMA_EMBEDDING_MODEL;
  if (!model) {
    throw new Error(
      "OLLAMA_EMBEDDING_MODEL is not configured (e.g. nomic-embed-text). " +
        "See .env.example.",
    );
  }
  return model;
}

interface OllamaEmbedResponse {
  // /api/embed returns one vector per input in `embeddings`.
  embeddings?: number[][];
  // Legacy /api/embeddings returns a single `embedding`.
  embedding?: number[];
}

/** Embed a single string via the self-hosted Ollama server. */
export async function generateEmbedding(text: string): Promise<number[]> {
  const data = await ollamaPost<OllamaEmbedResponse>("/api/embed", {
    model: embeddingModel(),
    input: text,
  });
  const vector = data.embeddings?.[0] ?? data.embedding;
  if (!vector || vector.length === 0) {
    throw new Error("Ollama returned an empty embedding");
  }
  return vector;
}

/** Embed many strings in one request; returns one vector per input, in order. */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const data = await ollamaPost<OllamaEmbedResponse>("/api/embed", {
    model: embeddingModel(),
    input: texts,
  });
  const vectors = data.embeddings;
  if (!vectors || vectors.length !== texts.length) {
    throw new Error(
      `Ollama returned ${vectors?.length ?? 0} embeddings for ${texts.length} inputs`,
    );
  }
  return vectors;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length)
    throw new Error("Vectors must have the same length");
  const dot = a.reduce((sum, ai, i) => sum + ai * (b[i] ?? 0), 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}
