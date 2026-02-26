import { supabase } from "../../_shared/supabaseClient.ts";
import { extractParams, duoError, duoSuccess } from "../../_shared/helpers.ts";

// deno-lint-ignore no-explicit-any
export async function handleAuthStatus(req: any, res: any) {
  try {
    const params = extractParams(req);
    const txid = params.txid;

    if (!txid) {
      return duoError(
        res,
        40001,
        "Missing required request parameters",
        "txid",
      );
    }

    const { data } = await supabase
      .from("auth_transactions")
      .select("*")
      .eq("txid", txid)
      .maybeSingle();

    if (!data) {
      return duoError(res, 40002, "Invalid request parameters", "Invalid txid");
    }

    // Expired but still waiting → timeout
    if (data.result === "waiting" && new Date(data.expires_at) < new Date()) {
      supabase
        .from("auth_transactions")
        .update({
          result: "deny",
          status: "timeout",
          status_msg: "Login timed out.",
          resolved_at: new Date().toISOString(),
        })
        .eq("txid", txid)
        .then(() => {});

      return duoSuccess(res, {
        auth_delayed: false,
        result: "deny",
        status: "timeout",
        status_msg: "Login timed out.",
      });
    }

    duoSuccess(res, {
      auth_delayed: false,
      result: data.result,
      status: data.status,
      status_msg: data.status_msg,
    });
  } catch (err) {
    console.error("auth_status error", err);
    duoError(res, 50000, "Internal server error");
  }
}
