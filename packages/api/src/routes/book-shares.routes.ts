import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { bookSharesController } from "../controllers/book-shares.controller";

// Design E18 — the share lists and revocation. Creating a share is
// book-scoped and lives in books.routes (POST /books/:id/share).
const router = Router();
router.use(authenticate);

router.get("/sent", bookSharesController.listSent);
router.get("/received", bookSharesController.listReceived);
router.delete("/:shareId", bookSharesController.revoke);

export { router as bookSharesRouter };
