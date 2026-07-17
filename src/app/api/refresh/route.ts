import { NextRequest, NextResponse } from "next/server";
import {
  scheduleRefreshJobs,
  runManualRefreshInline,
  type RefreshTargetGroup,
} from "@/lib/refresh-jobs";

export const maxDuration = 55;

/**
 * POST /api/refresh
 *
 * - production / scheduled: queue + cron
 * - local dev / manual: direct inline processing (deterministic, no queue race)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const trigger = body.trigger === "scheduled" ? "scheduled" : "manual";
    const targetGroups = Array.isArray(body.targetGroups)
      ? (body.targetGroups.filter((g: unknown): g is RefreshTargetGroup =>
          g === "social" || g === "news" || g === "blog"
        ))
      : [];

    if (process.env.NODE_ENV !== "production" && trigger === "manual") {
      const inline = await runManualRefreshInline(targetGroups);
      return NextResponse.json({ ok: true, ...inline });
    }

    const scheduled = await scheduleRefreshJobs({
      trigger,
      interval: trigger === "scheduled" ? body.interval ?? "" : "",
      targetGroups,
    });

    return NextResponse.json({
      ok: true,
      jobId: scheduled.jobId,
      queuedRuns: scheduled.queuedRuns,
      inlineProcessed: 0,
      inlineResults: [],
    });
  } catch (err) {
    console.error("[API_REFRESH] Failed to schedule/process refresh jobs:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to schedule refresh jobs.", detail: String(err) },
      { status: 500 }
    );
  }
}
