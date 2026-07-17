import type { Job } from "bullmq";
import type {
  EmbeddingsJobData,
  EmbeddingsJobResult,
} from "@starter-kit/shared";
import { generateEmbedding } from "../lib/ai";
import { embedBook } from "./embed-book";

export async function processEmbeddingsJob(
  job: Job<EmbeddingsJobData, EmbeddingsJobResult>,
): Promise<EmbeddingsJobResult> {
  const { entityId, entityType, text } = job.data;

  // Book embeddings own their source text: the worker reads the current Book +
  // JournalEntry and persists a BookEmbedding row (see embedBook).
  if (entityType === "book") {
    const result = await embedBook(entityId);
    console.info(
      result.skipped
        ? `[embeddings] book:${entityId} skipped — ${result.skipped}`
        : `[embeddings] stored ${result.dimensions}-dim embedding for book:${entityId}`,
    );
    return { dimensions: result.dimensions };
  }

  // Generic path for any other entity type: embed the supplied text (not persisted).
  if (!text) {
    throw new Error(
      `embeddings job for '${entityType}:${entityId}' has no text to embed`,
    );
  }
  console.info(`[embeddings] generating embedding for ${entityType}:${entityId}`);
  const embedding = await generateEmbedding(text);
  return { dimensions: embedding.length };
}
