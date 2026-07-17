import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { notImplemented } from "../lib/not-implemented";
import { aiController } from "../controllers/ai.controller";

// Owner-scoped AI taste-discovery endpoints (Phase 6).
const router = Router();
router.use(authenticate);

router.post("/taste-profile/refresh", aiController.refreshTasteProfile);
router.get("/taste-profile", notImplemented);
router.post("/discovery-report", aiController.discoveryReport);
router.get("/discovery-reports", notImplemented);
router.get("/discovery-report/:id", notImplemented);

export { router as aiRouter };
