import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { contributorsController } from "../controllers/contributors.controller";

// Contributors = shelf collaborators (ARCHITECTURE.md §2). "/" is the outgoing
// view (people I share my shelves with); "/shelves" is the incoming view
// (shelves shared with me), which returns book metadata only — never the
// owner's journal entries, ratings, or reading metrics.
const router = Router();
router.use(authenticate);

router.get("/", contributorsController.list);
router.get("/shelves", contributorsController.sharedWithMe);

export { router as contributorsRouter };
