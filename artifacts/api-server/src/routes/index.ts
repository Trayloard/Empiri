import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import companionRouter from "./companion";
import voiceRouter from "./voice";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(companionRouter);
router.use(voiceRouter);

export default router;
