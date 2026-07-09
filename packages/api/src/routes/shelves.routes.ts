import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { notImplemented } from "../lib/not-implemented";

// Owner-scoped views over Book.status (the four ReadingStatus shelves).
const router = Router();
router.use(authenticate);

router.get("/", notImplemented);
router.get("/:status", notImplemented);

export { router as shelvesRouter };
