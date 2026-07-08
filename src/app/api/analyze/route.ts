import { NextResponse } from "next/server";
import { getActiveBrand, toBrandContext } from "@/lib/brand";
import { analyzePending } from "@/lib/pipeline";

/** POST /api/analyze — analisis ulang mention yang belum punya hasil AI. */
export async function POST() {
  const brand = await getActiveBrand();
  const analyzed = await analyzePending(brand.id, toBrandContext(brand));
  return NextResponse.json({ ok: true, analyzed });
}
