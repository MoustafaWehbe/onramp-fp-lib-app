import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { notImplemented } from "../lib/not-implemented";

// Owner-scoped: every route requires an authenticated user. Ownership checks
// (book.userId === req.user.userId) belong in the handlers, which are stubs.
const router = Router();
router.use(authenticate);

router.get("/", notImplemented);
router.post("/", notImplemented);
router.get("/:id", notImplemented);
router.patch("/:id", notImplemented);
router.delete("/:id", notImplemented);
router.get("/:id/journal", notImplemented);
router.put("/:id/journal", notImplemented);

export { router as booksRouter };
