import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { booksController } from "../controllers/books.controller";
import {
  createBookSchema,
  updateBookSchema,
  listBooksQuerySchema,
  journalEntrySchema,
} from "../schemas/books.schemas";

// Owner-scoped: every route requires an authenticated user; the handlers enforce
// that the book belongs to req.user.
const router = Router();
router.use(authenticate);

router.get("/", validate(listBooksQuerySchema, "query"), booksController.list);
router.post("/", validate(createBookSchema), booksController.create);
router.get("/:id", booksController.get);
router.patch("/:id", validate(updateBookSchema), booksController.update);
router.delete("/:id", booksController.remove);
router.get("/:id/journal", booksController.getJournal);
router.put(
  "/:id/journal",
  validate(journalEntrySchema),
  booksController.putJournal,
);

export { router as booksRouter };
