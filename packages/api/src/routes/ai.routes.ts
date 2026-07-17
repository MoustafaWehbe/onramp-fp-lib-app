import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { aiController } from "../controllers/ai.controller";

// Owner-scoped AI taste-discovery endpoints (Phase 6).
const router = Router();
router.use(authenticate);

router.post("/taste-profile/refresh", aiController.refreshTasteProfile);
router.get("/taste-profile", aiController.getTasteProfile);
router.post("/discovery-report", aiController.discoveryReport);
router.get("/discovery-reports", aiController.listDiscoveryReports);
// Declared after /discovery-reports so the literal path wins over :id.
router.get("/discovery-report/:id", aiController.getDiscoveryReport);

export { router as aiRouter };
