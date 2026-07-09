import { NextRequest, NextResponse } from "next/server";
import { getActiveBrand, toBrandContext } from "@/lib/brand";
import { analyzePending } from "@/lib/pipeline";
import { rateLimit } from "@/lib/rate-limit";

/** POST /api/analyze — analisis ulang mention yang belum punya hasil AI. */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { scope: "analyze", limit: 5, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const brand = await getActiveBrand();
  const analyzed = await analyzePending(brand.id, toBrandContext(brand));
  return NextResponse.json({ ok: true, analyzed });
}
