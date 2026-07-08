import { NextResponse } from "next/server";
import { getAiUsageSummary } from "@/lib/ai-usage";

/** GET /api/ai-usage — ringkasan pemakaian token AI + saldo live DeepSeek. */
export async function GET() {
  const summary = await getAiUsageSummary();
  return NextResponse.json({ ok: true, ...summary });
}
