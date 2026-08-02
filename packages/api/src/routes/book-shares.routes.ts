import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { bookSharesController } from "../controllers/book-shares.controller";
import { shareIdParamSchema } from "../schemas/shares.schemas";

// Design E18 — the share lists and revocation. Creating a share is
// book-scoped and lives in books.routes (POST /books/:id/share).
const router = Router();
router.use(authenticate);

router.get("/sent", bookSharesController.listSent);
router.get("/received", bookSharesController.listReceived);
router.delete(
  "/:shareId",
  validate(shareIdParamSchema, "params"),
  bookSharesController.revoke,
);

export { router as bookSharesRouter };
