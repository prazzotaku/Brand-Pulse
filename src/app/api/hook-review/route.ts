import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";
import { getActiveBrand, toBrandContext } from "@/lib/brand";

/**
 * POST /api/hook-review — user menempel caption LENGKAP; AI mendeteksi hook
 * (baris pembuka) dan menilai keseluruhannya. Menerima `caption` (utuh) atau,
 * demi kompatibilitas, `hook` terpisah.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const caption = String(body.caption ?? "").trim();
  // Hook = baris non-kosong pertama dari caption (fallback ke field hook lama).
  const firstLine = caption.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  const hook = String(body.hook ?? "").trim() || firstLine;

  if (!caption && !hook) {
    return NextResponse.json({ ok: false, error: "Field 'caption' wajib diisi." }, { status: 400 });
  }

  const brand = await getActiveBrand();
  const result = await getAI().reviewHook(
    {
      hook,
      caption: caption || hook,
      platform: body.platform ?? "",
      contentSummary: body.contentSummary ?? "",
    },
    toBrandContext(brand)
  );

  const saved = await prisma.contentReview.create({
    data: {
      brandId: brand.id,
      inputHook: hook,
      inputCaption: caption,
      platform: body.platform ?? "",
      contentSummary: body.contentSummary ?? "",
      totalScore: result.totalScore,
      scoreBreakdown: JSON.stringify(result.scoreBreakdown),
      detectedHookType: result.detectedHookType,
      mainWeakness: result.mainWeakness,
      whyItMatters: result.whyItMatters,
      recommendedHookType: result.recommendedHookType,
      rewrittenOptions: JSON.stringify(result.rewrittenOptions),
      suggestedCaption: result.suggestedCaption ?? "",
      finalRecommendation: result.finalRecommendation,
    },
  });

  return NextResponse.json({ ok: true, id: saved.id, result });
}
