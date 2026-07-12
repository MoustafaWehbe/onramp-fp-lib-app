import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { sharesController } from "../controllers/shares.controller";
import { inviteShareSchema } from "../schemas/shares.schemas";

// Shelf sharing, mounted at /api/shelves/:shelfId/shares (mergeParams exposes
// :shelfId). Owner actions manage invites; the invitee accepts/declines their
// own pending invite.
const router = Router({ mergeParams: true });
router.use(authenticate);

router.get("/", sharesController.list); // owner: list shares
router.post("/", validate(inviteShareSchema), sharesController.invite); // owner: invite
router.post("/accept", sharesController.accept); // invitee: accept
router.post("/decline", sharesController.decline); // invitee: decline
router.delete("/:userId", sharesController.revoke); // owner: revoke

export { router as sharesRouter };
