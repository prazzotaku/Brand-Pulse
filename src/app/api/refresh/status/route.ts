import { NextRequest, NextResponse } from "next/server";
import { getActiveBrand } from "@/lib/brand";
import { getSafeJobById, getSafeLatestJob } from "@/lib/refresh-jobs";

export const dynamic = "force-dynamic";

/**
 * GET /api/refresh/status
 *
 * Returns the latest RefreshJob for the active brand. Before returning, it
 * normalizes stale jobs so the UI does not keep spinning forever on dead state.
 */
export async function GET(req: NextRequest) {
  try {
    const brand = await getActiveBrand();
    const jobId = req.nextUrl.searchParams.get("jobId")?.trim();
    const latestJob = jobId
      ? await getSafeJobById(brand.id, jobId)
      : await getSafeLatestJob(brand.id);

    if (!latestJob) {
      return NextResponse.json({ ok: true, job: null, message: "No refresh jobs found." });
    }

    return NextResponse.json({ ok: true, job: latestJob });
  } catch (err) {
    console.error("[API_REFRESH_STATUS] Failed to get refresh status:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to get refresh status.", detail: String(err) },
      { status: 500 }
    );
  }
}
