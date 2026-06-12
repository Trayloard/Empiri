import { Router, type IRouter } from "express";
import healthRouter from "./health";
import companionRouter from "./companion";
import voiceRouter from "./voice";

const router: IRouter = Router();

router.use(healthRouter);
router.use(companionRouter);
router.use(voiceRouter);

export default router;
