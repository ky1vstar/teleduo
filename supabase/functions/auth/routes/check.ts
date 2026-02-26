import type { Request, Response } from "express";
import { duoSuccess } from "../../_shared/helpers.ts";

export function handleCheck(_req: Request, res: Response) {
  duoSuccess(res, { time: Math.floor(Date.now() / 1000) });
}
