import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { contributorsController } from "../controllers/contributors.controller";
import { addSharedBookSchema } from "../schemas/shares.schemas";

// Contributors = shelf collaborators (ARCHITECTURE.md §2). "/" is the outgoing
// view (people I share my shelves with); "/shelves" is the incoming view
// (shelves shared with me), which returns book metadata only — never the
// owner's journal entries, ratings, or reading metrics. A WRITE-level
// contributor can also add/remove their own books on a shared shelf.
const router = Router();
router.use(authenticate);

router.get("/", contributorsController.list);
router.get("/invites", contributorsController.invites);
router.get("/shelves", contributorsController.sharedWithMe);
router.post(
  "/shelves/:shelfId/books",
  validate(addSharedBookSchema),
  contributorsController.addBook,
);
router.delete(
  "/shelves/:shelfId/books/:bookId",
  contributorsController.removeBook,
);

export { router as contributorsRouter };
