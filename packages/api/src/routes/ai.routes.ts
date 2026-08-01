import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { aiController } from "../controllers/ai.controller";
import { moodShelfSchema, memorySearchSchema } from "../schemas/ai.schemas";

// Owner-scoped AI taste-discovery endpoints (Phase 6).
const router = Router();
router.use(authenticate);

router.post("/taste-profile/refresh", aiController.refreshTasteProfile);
router.get("/taste-profile", aiController.getTasteProfile);
router.post("/journal-prompts/:bookId", aiController.journalPrompts);
router.post("/mood-shelf", validate(moodShelfSchema), aiController.moodShelf);
router.get("/memory/overview", aiController.memoryOverview);
router.post(
  "/memory/search",
  validate(memorySearchSchema),
  aiController.memorySearch,
);
router.post("/discovery-report", aiController.discoveryReport);
router.get("/discovery-reports", aiController.listDiscoveryReports);
// Declared after /discovery-reports so the literal path wins over :id.
router.get("/discovery-report/:id", aiController.getDiscoveryReport);

export { router as aiRouter };
