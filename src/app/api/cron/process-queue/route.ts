import { NextRequest, NextResponse } from "next/server";
import { processNextPendingRun } from "@/lib/refresh-jobs";

export const maxDuration = 55; // Keep it under 60s for Vercel Hobby tier

/**
 * Vercel Cron Job handler to process one pending crawl job from the database queue.
 *
 * To secure this endpoint, add a CRON_SECRET environment variable to your project
 * and configure it in vercel.json. The request must include this secret in the
 * Authorization header.
 *
 * Cron job definition in vercel.json:
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/process-queue",
 *       "schedule": "* * * * *"
 *     }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await processNextPendingRun();

    if (!result) {
      return NextResponse.json({ ok: true, message: "No pending jobs to process." });
    }

    return NextResponse.json({ ok: true, processed: result });
  } catch (err) {
    console.error("[CRON_PROCESS_QUEUE] Unhandled error:", err);
    return NextResponse.json({ ok: false, error: "Failed to process job.", detail: String(err) }, { status: 500 });
  }
}
