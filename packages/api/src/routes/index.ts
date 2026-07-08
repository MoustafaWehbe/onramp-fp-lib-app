import { Router } from "express";
import { authRouter } from "./auth.routes";
import { booksRouter } from "./books.routes";
import { shelvesRouter } from "./shelves.routes";
import { analyticsRouter } from "./analytics.routes";
import { aiRouter } from "./ai.routes";
import { contributorsRouter } from "./contributors.routes";
import { adminRouter } from "./admin.routes";

const router = Router();

router.use("/auth", authRouter);
router.use("/books", booksRouter);
router.use("/shelves", shelvesRouter);
router.use("/analytics", analyticsRouter);
router.use("/ai", aiRouter);
router.use("/contributors", contributorsRouter);
router.use("/admin", adminRouter);

export { router };
