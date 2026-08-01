import { Router, raw } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { booksController } from "../controllers/books.controller";
import { bookSharesController } from "../controllers/book-shares.controller";
import {
  createBookSchema,
  updateBookSchema,
  listBooksQuerySchema,
  journalEntrySchema,
} from "../schemas/books.schemas";
import { shareBookSchema } from "../schemas/shares.schemas";

// Owner-scoped: every route requires an authenticated user; the handlers enforce
// that the book belongs to req.user.
const router = Router();
router.use(authenticate);

router.get("/", validate(listBooksQuerySchema, "query"), booksController.list);
router.post("/", validate(createBookSchema), booksController.create);
// Design B6a — literal paths before /:id so they never match as an id.
router.get("/catalog-search", booksController.catalogSearch);
// The cover arrives as a raw octet-stream (the type is sniffed from the
// bytes), so the app-level 1 MB JSON parser never sees it.
router.post(
  "/cover",
  raw({ type: "application/octet-stream", limit: "6mb" }),
  booksController.uploadCover,
);
router.get("/:id", booksController.get);
router.patch("/:id", validate(updateBookSchema), booksController.update);
router.delete("/:id", booksController.remove);
router.get("/:id/similar", booksController.similar);
// Design E18 — share one book with one named person; owner-scoped.
router.post(
  "/:id/share",
  validate(shareBookSchema),
  bookSharesController.share,
);
router.get("/:id/shares", bookSharesController.listForBook);
router.get("/:id/journal", booksController.getJournal);
router.put(
  "/:id/journal",
  validate(journalEntrySchema),
  booksController.putJournal,
);

export { router as booksRouter };
