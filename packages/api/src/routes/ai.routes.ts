import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { notImplemented } from "../lib/not-implemented";

// Owner-scoped AI taste-discovery endpoints (Phase 6).
const router = Router();
router.use(authenticate);

router.post("/taste-profile/refresh", notImplemented);
router.get("/taste-profile", notImplemented);
router.post("/discovery-report", notImplemented);
router.get("/discovery-reports", notImplemented);
router.get("/discovery-report/:id", notImplemented);

export { router as aiRouter };
