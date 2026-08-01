import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { adminController } from "../controllers/admin.controller";
import { updateUserSchema } from "../schemas/admin.schemas";

// Admin-only: authenticated AND role === "admin". Account management and
// anonymized aggregates — never a user's books, journals, or shelves.
const router = Router();
router.use(authenticate, authorize("admin"));

router.get("/users", adminController.listUsers);
router.get("/users/:id", adminController.getUser);
router.patch("/users/:id", validate(updateUserSchema), adminController.updateUser);
router.delete("/users/:id", adminController.deleteUser);
router.get("/stats", adminController.stats);
router.get("/audit", adminController.auditLog);

export { router as adminRouter };
