import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Readable } from "node:stream";
import { createError } from "../middleware/error-handler";

/**
 * Attached book files (PDF / EPUB / audio). Follows cover-storage's rules —
 * type from magic bytes, never the client's claim; storage outside git — but
 * STREAMS to disk instead of buffering: a 200 MB PDF held in memory per
 * request would take the API down.
 */

/** Size cap, env-configurable. Default 200 MB (see .env.example). */
export function maxBookFileBytes(): number {
  const raw = Number(process.env.BOOK_FILE_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 200 * 1024 * 1024;
}

export const BOOK_FILES_DIR = path.join(process.cwd(), "uploads", "book-files");

export type SniffedKind = {
  kind: "PDF" | "EPUB" | "AUDIO";
  mimeType: string;
  ext: string;
};

/** How much of the head we need to decide what a file is. */
const SNIFF_BYTES = 512;

/**
 * Decide what the file IS from its first bytes.
 *
 * - PDF: "%PDF-".
 * - EPUB: a ZIP ("PK\x03\x04") whose required first entry is an uncompressed
 *   `mimetype` file reading "application/epub+zip" — both strings sit inside
 *   the first hundred bytes, so the head is enough. A plain ZIP without that
 *   marker is rejected: we can't know what's inside it.
 * - Audio: by container — MP3 (ID3 tag or bare frame sync), M4A/M4B ("ftyp"
 *   at offset 4), Ogg ("OggS"), FLAC ("fLaC"), WAV ("RIFF"…"WAVE").
 */
export function sniffBookFile(head: Buffer): SniffedKind | null {
  if (head.length >= 5 && head.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { kind: "PDF", mimeType: "application/pdf", ext: "pdf" };
  }

  if (
    head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04
  ) {
    const text = head.toString("latin1");
    if (text.includes("mimetype") && text.includes("application/epub+zip")) {
      return { kind: "EPUB", mimeType: "application/epub+zip", ext: "epub" };
    }
    return null; // a ZIP, but not an EPUB — reject rather than guess.
  }

  if (head.length >= 3 && head.subarray(0, 3).toString("ascii") === "ID3") {
    return { kind: "AUDIO", mimeType: "audio/mpeg", ext: "mp3" };
  }
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    return { kind: "AUDIO", mimeType: "audio/mpeg", ext: "mp3" };
  }
  if (head.length >= 12 && head.subarray(4, 8).toString("ascii") === "ftyp") {
    return { kind: "AUDIO", mimeType: "audio/mp4", ext: "m4a" };
  }
  if (head.length >= 4 && head.subarray(0, 4).toString("ascii") === "OggS") {
    return { kind: "AUDIO", mimeType: "audio/ogg", ext: "ogg" };
  }
  if (head.length >= 4 && head.subarray(0, 4).toString("ascii") === "fLaC") {
    return { kind: "AUDIO", mimeType: "audio/flac", ext: "flac" };
  }
  if (
    head.length >= 12 &&
    head.subarray(0, 4).toString("ascii") === "RIFF" &&
    head.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return { kind: "AUDIO", mimeType: "audio/wav", ext: "wav" };
  }

  return null;
}

export interface StoredBookFile {
  kind: SniffedKind["kind"];
  mimeType: string;
  storagePath: string; // relative to BOOK_FILES_DIR
  sizeBytes: number;
}

/**
 * Stream an incoming request body to disk, sniffing the head as it passes.
 *
 * The body goes to a temp file first and is renamed only on success; every
 * failure path (unknown type, over the cap, client abort) unlinks the temp so
 * nothing half-written survives. Memory use is one chunk at a time.
 */
export async function saveBookFileStream(
  body: Readable,
): Promise<StoredBookFile> {
  await mkdir(BOOK_FILES_DIR, { recursive: true });
  const tempPath = path.join(BOOK_FILES_DIR, `.tmp-${randomUUID()}`);
  const out = createWriteStream(tempPath, { flags: "wx" });
  const cap = maxBookFileBytes();

  let received = 0;
  let head = Buffer.alloc(0);

  try {
    await new Promise<void>((resolve, reject) => {
      body.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > cap) {
          reject(
            createError(
              `That file is over the ${Math.round(cap / 1024 / 1024)} MB limit.`,
              413,
            ),
          );
          return;
        }
        if (head.length < SNIFF_BYTES) {
          head = Buffer.concat([head, chunk]).subarray(0, SNIFF_BYTES);
        }
        if (!out.write(chunk)) {
          body.pause();
          out.once("drain", () => body.resume());
        }
      });
      body.on("end", () => {
        out.end(() => resolve());
      });
      body.on("error", reject);
      out.on("error", reject);
    });

    if (received === 0) {
      throw createError("No file received.", 400);
    }
    const sniffed = sniffBookFile(head);
    if (!sniffed) {
      throw createError(
        "That file isn't a PDF, EPUB, or audio file Folio recognises.",
        415,
      );
    }

    const name = `${randomUUID()}.${sniffed.ext}`;
    await rename(tempPath, path.join(BOOK_FILES_DIR, name));
    return {
      kind: sniffed.kind,
      mimeType: sniffed.mimeType,
      storagePath: name,
      sizeBytes: received,
    };
  } catch (err) {
    out.destroy();
    await unlink(tempPath).catch(() => undefined);
    throw err;
  }
}

/** Absolute path for a stored file; refuses anything that escapes the dir. */
export function bookFileAbsolutePath(storagePath: string): string {
  const abs = path.join(BOOK_FILES_DIR, storagePath);
  if (!abs.startsWith(BOOK_FILES_DIR)) {
    throw createError("File not found", 404);
  }
  return abs;
}

/** Remove a stored file from disk. Best-effort: a missing file is not an error. */
export async function deleteBookFileFromDisk(
  storagePath: string,
): Promise<void> {
  await unlink(bookFileAbsolutePath(storagePath)).catch(() => undefined);
}

/** Size on disk (the DB row's sizeBytes should match; disk is the truth). */
export async function bookFileSize(storagePath: string): Promise<number> {
  const s = await stat(bookFileAbsolutePath(storagePath));
  return s.size;
}
