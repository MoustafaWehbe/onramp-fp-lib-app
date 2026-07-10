import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { analyticsController } from "../controllers/analytics.controller";

// Owner-scoped reading analytics (the requesting user's own data only).
const router = Router();
router.use(authenticate);

router.get("/summary", analyticsController.summary);

export { router as analyticsRouter };
