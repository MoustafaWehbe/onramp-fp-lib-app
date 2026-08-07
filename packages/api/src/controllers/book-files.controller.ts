import type { NextFunction, Request, Response } from "express";
import { createReadStream } from "node:fs";
import { bookFilesService, parseKind } from "../services/book-files.service";
import type { ReadingProgressInput } from "../schemas/books.schemas";

/**
 * Parse a `Range: bytes=start-end` header against a known size.
 *
 * Handles the three legal forms — `start-end`, `start-` (to EOF), and
 * `-suffix` (last N bytes). Returns null for an absent or malformed header
 * (serve the whole file), and `"unsatisfiable"` for a range outside the file
 * (416). Multi-range requests are refused as unsatisfiable: PDF.js and
 * <audio> never send them, and a multipart/byteranges body is complexity
 * with no caller.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;

  if (rawStart === "") {
    // Suffix form: the last N bytes.
    const suffix = Number(rawEnd);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

export const bookFilesController = {
  /** Raw streamed body; the original filename travels in X-File-Name. */
  async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawName = req.header("x-file-name") ?? "";
      let name = "attached file";
      try {
        name = decodeURIComponent(rawName) || name;
      } catch {
        // An undecodable header keeps the fallback name.
      }
      const file = await bookFilesService.upload(
        req.user!.userId,
        req.params.id as string,
        req,
        name.slice(0, 255),
      );
      res.status(201).json({ data: file });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Serve the file, honouring HTTP Range. Without 206 support an audiobook
   * downloads in full before it plays and PDF.js cannot fetch pages lazily.
   */
  async serve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const kind = parseKind(req.params.kind as string);
      const file = await bookFilesService.resolveForServing(
        req.user!.userId,
        req.params.id as string,
        kind,
      );

      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", file.mimeType);
      // Attachment semantics are wrong here — the viewers consume it inline.
      res.setHeader("Cache-Control", "private, no-store");

      const range = parseRange(req.header("range"), file.sizeBytes);
      if (range === "unsatisfiable") {
        res.setHeader("Content-Range", `bytes */${file.sizeBytes}`);
        res.status(416).end();
        return;
      }

      if (range) {
        const length = range.end - range.start + 1;
        res.status(206);
        res.setHeader(
          "Content-Range",
          `bytes ${range.start}-${range.end}/${file.sizeBytes}`,
        );
        res.setHeader("Content-Length", length);
        createReadStream(file.absolutePath, {
          start: range.start,
          end: range.end,
        }).pipe(res);
        return;
      }

      res.status(200);
      res.setHeader("Content-Length", file.sizeBytes);
      createReadStream(file.absolutePath).pipe(res);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const kind = parseKind(req.params.kind as string);
      await bookFilesService.remove(
        req.user!.userId,
        req.params.id as string,
        kind,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async getProgress(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const progress = await bookFilesService.getProgress(
        req.user!.userId,
        req.params.id as string,
      );
      res.json({ data: progress });
    } catch (err) {
      next(err);
    }
  },

  async putProgress(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const progress = await bookFilesService.putProgress(
        req.user!.userId,
        req.params.id as string,
        req.body as ReadingProgressInput,
      );
      res.json({ data: progress });
    } catch (err) {
      next(err);
    }
  },
};
