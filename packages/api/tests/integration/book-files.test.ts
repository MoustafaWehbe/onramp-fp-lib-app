import request from "supertest";
import type { Response } from "supertest";
import { existsSync } from "node:fs";
import path from "node:path";
import { app } from "../../app";
import { getPrisma } from "@starter-kit/shared";

// Attached book files: streamed upload validated by magic bytes, Range-aware
// serving, disk cleanup on delete, and — the part that must never regress —
// the same privacy boundary the journal already has. A shelf contributor and
// a per-book share recipient both get 404 on the file endpoints (the repo's
// boundary answers "not found", never "exists but you can't" — a 403 would
// confirm the file is there). Reading progress is private to its owner.

const prisma = getPrisma();

const FILES_DIR = path.join(process.cwd(), "uploads", "book-files");

function getCookie(res: Response, name: string): string | undefined {
  const cookies = (res.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.find((c) => c.startsWith(`${name}=`))?.split(";")[0];
}

async function registerAndLogin(
  email: string,
): Promise<{ id: string; cookie: string }> {
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "SecurePass1", name: "User" });
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "SecurePass1" });
  return {
    id: reg.body.data.id as string,
    cookie: getCookie(login, "accessToken") as string,
  };
}

async function resetDb() {
  await prisma.$executeRaw`DELETE FROM book_shares`;
  await prisma.readingProgress.deleteMany();
  await prisma.bookFile.deleteMany();
  await prisma.shelfShare.deleteMany();
  await prisma.bookOnShelf.deleteMany();
  await prisma.shelf.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.book.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

/** A minimal but genuine-looking PDF body (magic bytes + padding). */
function pdfBuffer(size = 4_000): Buffer {
  const head = Buffer.from("%PDF-1.4\n% Folio test fixture\n", "ascii");
  return Buffer.concat([head, Buffer.alloc(size - head.length, 0x20)]);
}

/** An MP3-shaped body: ID3 tag then padding. */
function mp3Buffer(size = 3_000): Buffer {
  const head = Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00", "latin1");
  return Buffer.concat([head, Buffer.alloc(size - head.length, 0x00)]);
}

function upload(bookId: string, cookie: string, body: Buffer, name: string) {
  return request(app)
    .post(`/api/books/${bookId}/file`)
    .set("Cookie", cookie)
    .set("Content-Type", "application/octet-stream")
    .set("X-File-Name", encodeURIComponent(name))
    .send(body);
}

let iris = { id: "", cookie: "" }; // owner
let maya = { id: "", cookie: "" }; // per-book share recipient (E18)
let noah = { id: "", cookie: "" }; // shelf contributor
let bookId = "";

beforeAll(async () => {
  await resetDb();
  iris = await registerAndLogin("iris.files@example.com");
  maya = await registerAndLogin("maya.files@example.com");
  noah = await registerAndLogin("noah.files@example.com");

  const created = await request(app)
    .post("/api/books")
    .set("Cookie", iris.cookie)
    .send({
      title: "The Winter Orchard",
      author: "Sofia Lindqvist",
      genre: "Literary Fiction",
      status: "FINISHED",
    });
  bookId = created.body.data.id as string;

  // Maya receives the book via E18.
  await request(app)
    .post(`/api/books/${bookId}/share`)
    .set("Cookie", iris.cookie)
    .send({ email: "maya.files@example.com" });

  // Noah is an ACCEPTED WRITE contributor on a shelf holding the book —
  // the strongest shared-shelf relationship there is.
  const shelf = await prisma.shelf.create({
    data: { userId: iris.id, name: "Orchard Shelf" },
  });
  await prisma.bookOnShelf.create({
    data: { shelfId: shelf.id, bookId, addedById: iris.id },
  });
  await prisma.shelfShare.create({
    data: {
      shelfId: shelf.id,
      userId: noah.id,
      accessLevel: "WRITE",
      status: "ACCEPTED",
    },
  });
});

afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe("POST /api/books/:id/file — streamed upload, magic bytes", () => {
  it("rejects a file that is none of PDF/EPUB/audio (415)", async () => {
    const res = await upload(
      bookId,
      iris.cookie,
      Buffer.from("just some text, no magic here", "ascii"),
      "notes.txt",
    );
    expect(res.status).toBe(415);
  });

  it("rejects a plain ZIP that is not an EPUB (415)", async () => {
    // PK\x03\x04 but no epub mimetype entry — could be anything; rejected.
    const zip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.alloc(600, 0x00),
    ]);
    const res = await upload(bookId, iris.cookie, zip, "archive.zip");
    expect(res.status).toBe(415);
  });

  it("enforces the size cap from BOOK_FILE_MAX_BYTES (413)", async () => {
    const prev = process.env.BOOK_FILE_MAX_BYTES;
    process.env.BOOK_FILE_MAX_BYTES = "1024";
    try {
      const res = await upload(
        bookId,
        iris.cookie,
        pdfBuffer(4_000),
        "big.pdf",
      );
      expect(res.status).toBe(413);
    } finally {
      if (prev === undefined) delete process.env.BOOK_FILE_MAX_BYTES;
      else process.env.BOOK_FILE_MAX_BYTES = prev;
    }
  });

  it("accepts a PDF, sniffs its kind, and surfaces metadata on the book", async () => {
    const res = await upload(
      bookId,
      iris.cookie,
      pdfBuffer(),
      "The Winter Orchard (scan).pdf",
    );
    expect(res.status).toBe(201);
    expect(res.body.data.kind).toBe("PDF");
    expect(res.body.data.mimeType).toBe("application/pdf");
    expect(res.body.data.sizeBytes).toBe(4_000);
    expect(res.body.data.originalName).toBe("The Winter Orchard (scan).pdf");

    const detail = await request(app)
      .get(`/api/books/${bookId}`)
      .set("Cookie", iris.cookie);
    expect(detail.body.data.files).toHaveLength(1);
    expect(detail.body.data.files[0].kind).toBe("PDF");
    // The storage path is a server detail and never leaves the API.
    expect(JSON.stringify(detail.body)).not.toContain("storagePath");
  });

  it("accepts an audio file alongside the PDF (one of each kind)", async () => {
    const res = await upload(bookId, iris.cookie, mp3Buffer(), "orchard.mp3");
    expect(res.status).toBe(201);
    expect(res.body.data.kind).toBe("AUDIO");
    expect(res.body.data.mimeType).toBe("audio/mpeg");

    const detail = await request(app)
      .get(`/api/books/${bookId}`)
      .set("Cookie", iris.cookie);
    expect(detail.body.data.files).toHaveLength(2);
  });

  it("replacing the same kind swaps the bytes and removes the old file from disk", async () => {
    const before = await prisma.bookFile.findUnique({
      where: { bookId_kind: { bookId, kind: "PDF" } },
    });
    expect(before).not.toBeNull();
    expect(existsSync(path.join(FILES_DIR, before!.storagePath))).toBe(true);

    const res = await upload(bookId, iris.cookie, pdfBuffer(5_000), "v2.pdf");
    expect(res.status).toBe(201);
    expect(res.body.data.sizeBytes).toBe(5_000);

    const after = await prisma.bookFile.findUnique({
      where: { bookId_kind: { bookId, kind: "PDF" } },
    });
    expect(after!.storagePath).not.toBe(before!.storagePath);
    expect(existsSync(path.join(FILES_DIR, before!.storagePath))).toBe(false);
    expect(existsSync(path.join(FILES_DIR, after!.storagePath))).toBe(true);
  });
});

describe("GET /api/books/:id/file/:kind — HTTP Range", () => {
  it("serves the whole file with 200 when no Range is sent", async () => {
    const res = await request(app)
      .get(`/api/books/${bookId}/file/pdf`)
      .set("Cookie", iris.cookie)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(res.headers["content-length"]).toBe("5000");
    expect((res.body as Buffer).length).toBe(5_000);
    expect((res.body as Buffer).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("answers a bounded range with 206 and a correct Content-Range", async () => {
    const res = await request(app)
      .get(`/api/books/${bookId}/file/pdf`)
      .set("Cookie", iris.cookie)
      .set("Range", "bytes=0-99")
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 0-99/5000");
    expect(res.headers["content-length"]).toBe("100");
    expect((res.body as Buffer).length).toBe(100);
    expect((res.body as Buffer).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("serves an open-ended range to EOF and a suffix range", async () => {
    const open = await request(app)
      .get(`/api/books/${bookId}/file/pdf`)
      .set("Cookie", iris.cookie)
      .set("Range", "bytes=4900-");
    expect(open.status).toBe(206);
    expect(open.headers["content-range"]).toBe("bytes 4900-4999/5000");

    const suffix = await request(app)
      .get(`/api/books/${bookId}/file/pdf`)
      .set("Cookie", iris.cookie)
      .set("Range", "bytes=-50");
    expect(suffix.status).toBe(206);
    expect(suffix.headers["content-range"]).toBe("bytes 4950-4999/5000");
  });

  it("answers 416 for a range beyond the file", async () => {
    const res = await request(app)
      .get(`/api/books/${bookId}/file/pdf`)
      .set("Cookie", iris.cookie)
      .set("Range", "bytes=999999-");
    expect(res.status).toBe(416);
    expect(res.headers["content-range"]).toBe("bytes */5000");
  });

  it("404s an unknown kind and a book with no such file", async () => {
    const bad = await request(app)
      .get(`/api/books/${bookId}/file/vinyl`)
      .set("Cookie", iris.cookie);
    expect(bad.status).toBe(404);

    const other = await request(app)
      .post("/api/books")
      .set("Cookie", iris.cookie)
      .send({ title: "No File", author: "Nobody" });
    const none = await request(app)
      .get(`/api/books/${other.body.data.id}/file/pdf`)
      .set("Cookie", iris.cookie);
    expect(none.status).toBe(404);
  });
});

describe("the privacy boundary — files are the owner's alone", () => {
  it("a per-book share recipient (E18) cannot fetch the file", async () => {
    const res = await request(app)
      .get(`/api/books/${bookId}/file/pdf`)
      .set("Cookie", maya.cookie);
    expect(res.status).toBe(404);
  });

  it("the recipient projection stays metadata-only — no file fields leak", async () => {
    const res = await request(app)
      .get("/api/book-shares/received")
      .set("Cookie", maya.cookie);
    expect(res.status).toBe(200);
    const flat = JSON.stringify(res.body);
    expect(flat).not.toContain("files");
    expect(flat).not.toContain("sizeBytes");
    expect(flat).not.toContain("storagePath");
  });

  it("an ACCEPTED WRITE shelf contributor cannot fetch the file", async () => {
    const res = await request(app)
      .get(`/api/books/${bookId}/file/pdf`)
      .set("Cookie", noah.cookie);
    expect(res.status).toBe(404);
  });

  it("neither can upload or delete on the owner's book", async () => {
    const up = await upload(bookId, noah.cookie, pdfBuffer(), "sneak.pdf");
    expect(up.status).toBe(404);
    const del = await request(app)
      .delete(`/api/books/${bookId}/file/pdf`)
      .set("Cookie", maya.cookie);
    expect(del.status).toBe(404);
  });

  it("reading progress is private to its owner", async () => {
    const put = await request(app)
      .put(`/api/books/${bookId}/progress`)
      .set("Cookie", iris.cookie)
      .send({ position: "12", percent: 40 });
    expect(put.status).toBe(200);

    const mine = await request(app)
      .get(`/api/books/${bookId}/progress`)
      .set("Cookie", iris.cookie);
    expect(mine.status).toBe(200);
    expect(mine.body.data.position).toBe("12");
    expect(mine.body.data.percent).toBe(40);

    for (const other of [maya.cookie, noah.cookie]) {
      const get = await request(app)
        .get(`/api/books/${bookId}/progress`)
        .set("Cookie", other);
      expect(get.status).toBe(404);
      const write = await request(app)
        .put(`/api/books/${bookId}/progress`)
        .set("Cookie", other)
        .send({ position: "99", percent: 99 });
      expect(write.status).toBe(404);
    }
  });

  it("validates progress input (422)", async () => {
    const res = await request(app)
      .put(`/api/books/${bookId}/progress`)
      .set("Cookie", iris.cookie)
      .send({ position: "", percent: 400 });
    expect(res.status).toBe(422);
  });
});

describe("deletion removes bytes from disk", () => {
  it("DELETE /file/:kind removes row and file", async () => {
    const row = await prisma.bookFile.findUnique({
      where: { bookId_kind: { bookId, kind: "AUDIO" } },
    });
    const abs = path.join(FILES_DIR, row!.storagePath);
    expect(existsSync(abs)).toBe(true);

    const res = await request(app)
      .delete(`/api/books/${bookId}/file/audio`)
      .set("Cookie", iris.cookie);
    expect(res.status).toBe(204);
    expect(existsSync(abs)).toBe(false);
    const gone = await request(app)
      .get(`/api/books/${bookId}/file/audio`)
      .set("Cookie", iris.cookie);
    expect(gone.status).toBe(404);
  });

  it("deleting the book removes its remaining files from disk", async () => {
    const row = await prisma.bookFile.findUnique({
      where: { bookId_kind: { bookId, kind: "PDF" } },
    });
    const abs = path.join(FILES_DIR, row!.storagePath);
    expect(existsSync(abs)).toBe(true);

    const res = await request(app)
      .delete(`/api/books/${bookId}`)
      .set("Cookie", iris.cookie);
    expect(res.status).toBe(204);
    expect(existsSync(abs)).toBe(false);
    expect(await prisma.bookFile.findMany({ where: { bookId } })).toHaveLength(
      0,
    );
  });
});
