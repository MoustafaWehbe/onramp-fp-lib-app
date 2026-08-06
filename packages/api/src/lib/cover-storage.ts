import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createError } from "../middleware/error-handler";

/** Design B6a: "JPG, PNG or WEBP · up to 5 MB." */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** Uploaded covers live outside git, next to the running API process. */
export const UPLOADS_DIR = path.join(process.cwd(), "uploads", "covers");

/**
 * The file type comes from the bytes, never from the client's claim — an
 * unsupported or mislabelled file is rejected the same way an oversized one is.
 */
function sniffImageExt(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpg";
  }
  if (
    buf.length > 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (
    buf.length > 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Persist an uploaded cover image and return its site-relative URL
 * (served by the authenticated /api/uploads static route).
 */
export async function saveCover(buffer: Buffer): Promise<{ url: string }> {
  if (buffer.length === 0) {
    throw createError("No image received.", 400);
  }
  if (buffer.length > MAX_COVER_BYTES) {
    const mb = Math.round(buffer.length / 1024 / 1024);
    throw createError(
      `That file is ${mb} MB. Covers need to be under 5 MB.`,
      413,
    );
  }
  const ext = sniffImageExt(buffer);
  if (!ext) {
    throw createError("Covers need to be a JPG, PNG or WEBP image.", 415);
  }

  await mkdir(UPLOADS_DIR, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(UPLOADS_DIR, name), buffer);
  return { url: `/api/uploads/covers/${name}` };
}
