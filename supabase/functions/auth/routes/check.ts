import { duoSuccess } from "../../_shared/helpers.ts";

// deno-lint-ignore no-explicit-any
export function handleCheck(_req: any, res: any) {
  duoSuccess(res, { time: Math.floor(Date.now() / 1000) });
}
