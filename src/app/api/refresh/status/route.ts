import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * GET /api/refresh/status
 *
 * Returns the latest RefreshJob for the active brand. The UI polls this
 * endpoint to track the progress of an async refresh.
 */
export async function GET(req: NextRequest) {
  try {
    const brand = await getActiveBrand();
    const jobId = req.nextUrl.searchParams.get("jobId")?.trim();
    const latestJob = jobId
      ? await prisma.refreshJob.findFirst({
          where: { id: jobId, brandId: brand.id },
        })
      : await prisma.refreshJob.findFirst({
          where: { brandId: brand.id },
          orderBy: { createdAt: "desc" },
        });

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
