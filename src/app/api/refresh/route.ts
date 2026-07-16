import { NextRequest, NextResponse } from "next/server";
import { scheduleRefreshJobs, type RefreshTargetGroup } from "@/lib/refresh-jobs";

export const maxDuration = 10; // This endpoint should be very fast now.

/**
 * POST /api/refresh
 *
 * Schedules a new refresh job by creating a RefreshJob and all associated
 * CrawlRun jobs in the database with a "pending" status. This endpoint
 * no longer performs the fetching itself; it only acts as a scheduler.
 * The actual processing is handled by the cron job at /api/cron/process-queue.
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

    const result = await scheduleRefreshJobs({
      trigger,
      interval: trigger === "scheduled" ? body.interval ?? "" : "",
      targetGroups,
    });

    return NextResponse.json({
      ok: true,
      jobId: result.jobId,
      queuedRuns: result.queuedRuns,
    });
  } catch (err) {
    console.error("[API_REFRESH] Failed to schedule refresh jobs:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to schedule refresh jobs.", detail: String(err) },
      { status: 500 }
    );
  }
}
