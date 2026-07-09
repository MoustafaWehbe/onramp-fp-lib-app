import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { notImplemented } from "../lib/not-implemented";

// Admin-only: authenticated AND role === "admin".
const router = Router();
router.use(authenticate, authorize("admin"));

router.get("/users", notImplemented);
router.get("/users/:id", notImplemented);
router.patch("/users/:id", notImplemented);
router.delete("/users/:id", notImplemented);
router.get("/stats", notImplemented);

export { router as adminRouter };
