import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { notImplemented } from "../lib/not-implemented";

// PLACEHOLDER: "contributors" has no data model yet and its scope is unconfirmed
// (see ARCHITECTURE.md §2 open question). Scaffolded as an authenticated stub so
// the route wiring exists; the shape will change once the feature is defined.
const router = Router();
router.use(authenticate);

router.get("/", notImplemented);

export { router as contributorsRouter };
