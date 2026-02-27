import type { Request, Response } from "express";
import { supabase } from "../../_shared/supabaseClient.ts";
import { duoError, duoSuccess, isValidUuid } from "../../_shared/helpers.ts";

// ── DELETE /admin/v1/users/:user_id ──────────────────────────────────────────

export async function handleDeleteUser(req: Request, res: Response) {
  try {
    const userId = req.params.user_id;

    if (!isValidUuid(userId)) {
      return duoError(res, 40401, "Resource not found");
    }

    // Check if user exists first
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!user) {
      return duoError(res, 40401, "Resource not found");
    }

    // Deleting from auth.users cascades to public.users → devices,
    // enrollments, auth_transactions via the on_auth_user_deleted trigger.
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      throw error;
    }

    duoSuccess(res, "");
  } catch (err) {
    console.error("deleteUser error", err);
    duoError(res, 50000, "Internal server error");
  }
}
