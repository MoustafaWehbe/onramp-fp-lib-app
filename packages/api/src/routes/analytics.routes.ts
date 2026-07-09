import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { notImplemented } from "../lib/not-implemented";

// Owner-scoped reading analytics.
const router = Router();
router.use(authenticate);

router.get("/", notImplemented);

export { router as analyticsRouter };
