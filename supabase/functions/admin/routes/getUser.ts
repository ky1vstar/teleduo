import type { Request, Response } from "express";
import { supabase } from "../../_shared/supabaseClient.ts";
import { duoError, duoSuccess, isValidUuid } from "../../_shared/helpers.ts";
import { formatUser } from "./_formatUser.ts";

// ── GET /admin/v1/users/:user_id ─────────────────────────────────────────────

export async function handleGetUser(req: Request, res: Response) {
  try {
    const userId = req.params.user_id;

    if (!isValidUuid(userId)) {
      return duoError(res, 40401, "Resource not found");
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;

    if (!user) {
      return duoError(res, 40401, "Resource not found");
    }

    // Fetch devices
    const { data: devices } = await supabase
      .from("devices")
      .select("*")
      .eq("user_id", userId);

    // Fetch last successful login
    const { data: lastTx } = await supabase
      .from("auth_transactions")
      .select("resolved_at")
      .eq("user_id", userId)
      .eq("result", "approve")
      .not("resolved_at", "is", null)
      .order("resolved_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastLogin = lastTx
      ? Math.floor(new Date(lastTx.resolved_at).getTime() / 1000)
      : null;

    duoSuccess(res, formatUser(user, devices ?? [], lastLogin));
  } catch (err) {
    console.error("getUser error", err);
    duoError(res, 50000, "Internal server error");
  }
}
