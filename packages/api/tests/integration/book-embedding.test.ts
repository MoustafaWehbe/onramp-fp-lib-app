import { getPrisma } from "@starter-kit/shared";
import { embedBook } from "../../../workers/src/jobs/embed-book";

// Exercises the embedding pipeline against the real (test) Postgres: seed a book +
// journal entry, run the worker's embedBook with a deterministic 768-dim embedder,
// and confirm a BookEmbedding row lands with the right dimension and source text.
// The embedder is injected (no live Ollama needed) so this isolates persistence.

const prisma = getPrisma();

const fakeVector = (): number[] =>
  Array.from({ length: 768 }, (_, i) => Number(((i % 13) * 0.01).toFixed(4)));

async function reset() {
  await prisma.bookEmbedding.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.book.deleteMany();
  await prisma.user.deleteMany();
}

let seq = 0;
async function seedUser() {
  return prisma.user.create({
    data: {
      email: `embed-${Date.now()}-${seq++}@example.com`,
      passwordHash: "x",
      name: "Reader",
    },
  });
}

beforeAll(reset);
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe("embedBook — embedding pipeline", () => {
  it("embeds a FINISHED book with a journal entry and persists a 768-dim row", async () => {
    const user = await seedUser();
    const book = await prisma.book.create({
      data: {
        userId: user.id,
        title: "Stoner",
        author: "John Williams",
        genre: "Literary fiction",
        status: "FINISHED",
      },
    });
    await prisma.journalEntry.create({
      data: {
        bookId: book.id,
        userId: user.id,
        reflectionText: "Quiet, devastating regret.",
        favoriteQuotes: ["He had discovered that he was thinking of nothing at all."],
      },
    });

    const result = await embedBook(book.id, async () => fakeVector());
    expect(result.skipped).toBeUndefined();
    expect(result.dimensions).toBe(768);

    const rows = await prisma.$queryRaw<{ dims: number; source_text: string }[]>`
      SELECT vector_dims(embedding) AS dims, source_text
      FROM book_embeddings
      WHERE book_id = ${book.id}::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.dims)).toBe(768);
    // source text = genre + author + reflection + favorite quotes
    expect(rows[0]!.source_text).toContain("Literary fiction");
    expect(rows[0]!.source_text).toContain("John Williams");
    expect(rows[0]!.source_text).toContain("devastating regret");
    expect(rows[0]!.source_text).toContain("thinking of nothing");
  });

  it("re-embedding the same book updates the row in place (no duplicate)", async () => {
    const user = await seedUser();
    const book = await prisma.book.create({
      data: { userId: user.id, title: "T", author: "A", status: "FINISHED" },
    });
    await prisma.journalEntry.create({
      data: { bookId: book.id, userId: user.id, reflectionText: "first", favoriteQuotes: [] },
    });

    await embedBook(book.id, async () => fakeVector());
    await embedBook(book.id, async () => fakeVector());

    expect(await prisma.bookEmbedding.count({ where: { bookId: book.id } })).toBe(1);
  });

  it("skips a book that is not FINISHED (no row written)", async () => {
    const user = await seedUser();
    const book = await prisma.book.create({
      data: { userId: user.id, title: "T", author: "A", status: "READING" },
    });
    await prisma.journalEntry.create({
      data: { bookId: book.id, userId: user.id, reflectionText: "r", favoriteQuotes: [] },
    });

    const result = await embedBook(book.id, async () => fakeVector());
    expect(result.skipped).toMatch(/not FINISHED/);
    expect(await prisma.bookEmbedding.count({ where: { bookId: book.id } })).toBe(0);
  });

  it("skips a FINISHED book that has no journal entry (no row written)", async () => {
    const user = await seedUser();
    const book = await prisma.book.create({
      data: { userId: user.id, title: "T", author: "A", status: "FINISHED" },
    });

    const result = await embedBook(book.id, async () => fakeVector());
    expect(result.skipped).toMatch(/no journal entry/);
    expect(await prisma.bookEmbedding.count({ where: { bookId: book.id } })).toBe(0);
  });
});
