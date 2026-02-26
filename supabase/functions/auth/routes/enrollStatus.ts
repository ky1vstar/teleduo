import { supabase } from "../../_shared/supabaseClient.ts";
import {
  extractParams,
  duoError,
  duoSuccess,
} from "../../_shared/helpers.ts";

// deno-lint-ignore no-explicit-any
export async function handleEnrollStatus(req: any, res: any) {
  try {
    const params = extractParams(req);
    const userId = params.user_id;
    const activationCodeParam = params.activation_code;

    if (!userId) {
      return duoError(
        res,
        40001,
        "Missing required request parameters",
        "user_id",
      );
    }
    if (!activationCodeParam) {
      return duoError(
        res,
        40001,
        "Missing required request parameters",
        "activation_code",
      );
    }

    // activation_code in the request is the full deep link URL
    let code = activationCodeParam;
    try {
      const url = new URL(activationCodeParam);
      const startParam = url.searchParams.get("start");
      if (startParam) code = startParam;
    } catch {
      // Not a URL, use as-is
    }

    const { data: enrollData } = await supabase
      .from("enrollments")
      .select("*")
      .eq("activation_code", code)
      .maybeSingle();

    if (!enrollData) return duoSuccess(res, "invalid");
    if (enrollData.user_id !== userId) return duoSuccess(res, "invalid");
    if (new Date(enrollData.expires_at) < new Date()) {
      return duoSuccess(res, "invalid");
    }

    duoSuccess(res, enrollData.status);
  } catch (err) {
    console.error("enroll_status error", err);
    duoError(res, 50000, "Internal server error");
  }
}
