import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { shelvesController } from "../controllers/shelves.controller";
import {
  createShelfSchema,
  updateShelfSchema,
  addBookSchema,
} from "../schemas/shelves.schemas";

// Owner-scoped: user-created collections of books, complementing Book.status.
// (Sharing/contributors are documented in ARCHITECTURE.md but not built yet.)
const router = Router();
router.use(authenticate);

router.get("/", shelvesController.list);
router.post("/", validate(createShelfSchema), shelvesController.create);
router.get("/:id", shelvesController.get);
router.patch("/:id", validate(updateShelfSchema), shelvesController.update);
router.delete("/:id", shelvesController.remove);
router.post("/:id/books", validate(addBookSchema), shelvesController.addBook);
router.delete("/:id/books/:bookId", shelvesController.removeBook);

export { router as shelvesRouter };
