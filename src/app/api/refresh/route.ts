import { NextRequest, NextResponse } from "next/server";
import {
  scheduleRefreshJobs,
  type RefreshTargetGroup,
  processRefreshInlineIfEnabled,
  reconcileRefreshJob,
} from "@/lib/refresh-jobs";

export const maxDuration = 55;

/**
 * POST /api/refresh
 *
 * Default behavior:
 * - production: schedule jobs only, cron worker will process them.
 * - local/dev manual refresh: schedule jobs, then process queue inline
 *   in the same request to avoid races with external cron workers and to make
 *   localhost verification practical.
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

    const scheduled = await scheduleRefreshJobs({
      trigger,
      interval: trigger === "scheduled" ? body.interval ?? "" : "",
      targetGroups,
    });

    const inline = await processRefreshInlineIfEnabled(scheduled.jobId, trigger);
    await reconcileRefreshJob(scheduled.jobId);

    return NextResponse.json({
      ok: true,
      jobId: scheduled.jobId,
      queuedRuns: scheduled.queuedRuns,
      inlineProcessed: inline?.processed ?? 0,
      inlineResults: inline?.results ?? [],
    });
  } catch (err) {
    console.error("[API_REFRESH] Failed to schedule/process refresh jobs:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to schedule refresh jobs.", detail: String(err) },
      { status: 500 }
    );
  }
}
