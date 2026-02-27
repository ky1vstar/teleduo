import type { Request, Response } from "express";
import { supabase } from "../../_shared/supabaseClient.ts";
import { extractParams, duoError, isValidUuid } from "../../_shared/helpers.ts";
import { formatUser } from "./_formatUser.ts";

// ── GET /admin/v1/users ──────────────────────────────────────────────────────

export async function handleGetUsers(req: Request, res: Response) {
  try {
    const params = extractParams(req);

    const username = params.username || null;
    const email = params.email || null;
    const userIdListRaw = params.user_id_list || null;
    const usernameListRaw = params.username_list || null;

    // ── Mutual-exclusivity validation ────────────────────────────────────────

    const exclusive = [
      username && "username",
      email && "email",
      userIdListRaw && "user_id_list",
      usernameListRaw && "username_list",
    ].filter(Boolean) as string[];

    if (exclusive.length > 1) {
      return duoError(
        res,
        40002,
        "Invalid request parameters",
        `mutually exclusive: ${exclusive.join(", ")}`,
      );
    }

    // ── Parse JSON list params ───────────────────────────────────────────────

    let userIdList: string[] | null = null;
    if (userIdListRaw) {
      try {
        userIdList = JSON.parse(userIdListRaw);
        if (!Array.isArray(userIdList)) throw new Error();
      } catch {
        return duoError(
          res,
          40002,
          "Invalid request parameters",
          'Unable to parse "user_id_list" param as a valid JSON list.',
        );
      }
    }

    let usernameList: string[] | null = null;
    if (usernameListRaw) {
      try {
        usernameList = JSON.parse(usernameListRaw);
        if (!Array.isArray(usernameList)) throw new Error();
      } catch {
        return duoError(
          res,
          40002,
          "Invalid request parameters",
          'Unable to parse "username_list" param as a valid JSON list.',
        );
      }
    }

    // ── Build user query ─────────────────────────────────────────────────────

    const isFilterMode = !!(username || email || userIdList || usernameList);

    let query = supabase
      .from("users")
      .select("*", { count: "exact" });

    if (username) {
      query = query.eq("username", username);
    } else if (email) {
      query = query.eq("email", email);
    } else if (userIdList) {
      const validIds = userIdList.filter(isValidUuid);
      if (validIds.length === 0) {
        return res.status(200).json({ stat: "OK", response: [] });
      }
      query = query.in("id", validIds);
    } else if (usernameList) {
      query = query.in("username", usernameList);
    } else {
      const limit = Math.min(parseInt(params.limit, 10) || 100, 300);
      const offset = parseInt(params.offset, 10) || 0;
      query = query.range(offset, offset + limit - 1);
    }

    const { data: users, count, error } = await query.order("created_at");
    if (error) throw error;

    if (!users || users.length === 0) {
      const body: Record<string, unknown> = {
        stat: "OK",
        response: [],
        metadata: { total_objects: count ?? 0 },
      };
      return res.status(200).json(body);
    }

    // ── Fetch devices for returned users ─────────────────────────────────────

    // deno-lint-ignore no-explicit-any
    const userIds = users.map((u: any) => u.id);

    const { data: devices } = await supabase
      .from("devices")
      .select("*")
      .in("user_id", userIds);

    // ── Fetch last successful login per user ─────────────────────────────────

    const { data: txns } = await supabase
      .from("auth_transactions")
      .select("user_id, resolved_at")
      .in("user_id", userIds)
      .eq("result", "approve")
      .not("resolved_at", "is", null)
      .order("resolved_at", { ascending: false });

    const lastLoginMap: Record<string, number> = {};
    for (const tx of txns ?? []) {
      if (!lastLoginMap[tx.user_id]) {
        lastLoginMap[tx.user_id] = Math.floor(
          new Date(tx.resolved_at).getTime() / 1000,
        );
      }
    }

    // ── Format response ──────────────────────────────────────────────────────

    // deno-lint-ignore no-explicit-any
    const formatted = users.map((u: any) =>
      formatUser(u, devices ?? [], lastLoginMap[u.id] ?? null),
    );

    const body: Record<string, unknown> = { stat: "OK", response: formatted };

    const total = count ?? 0;
    const meta: Record<string, number> = { total_objects: total };
    if (!isFilterMode) {
      const limit = Math.min(parseInt(params.limit, 10) || 100, 300);
      const offset = parseInt(params.offset, 10) || 0;
      if (offset + limit < total) {
        meta.next_offset = offset + limit;
      }
    }
    body.metadata = meta;

    res.status(200).json(body);
  } catch (err) {
    console.error("getUsers error", err);
    duoError(res, 50000, "Internal server error");
  }
}
