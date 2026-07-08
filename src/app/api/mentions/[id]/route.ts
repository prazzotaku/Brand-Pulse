import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/mentions/[id] — aksi koreksi dari drawer detail:
 *  - mark_irrelevant: tandai tidak relevan (dikeluarkan dari insight)
 *  - correct_category: koreksi issueCategory hasil AI
 *  - save_insight: simpan mention sebagai bahan Content Idea
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  const mention = await prisma.mention.findUnique({
    where: { id: params.id },
    include: { analysis: true },
  });
  if (!mention) {
    return NextResponse.json({ ok: false, error: "Mention tidak ditemukan." }, { status: 404 });
  }

  if (action === "mark_irrelevant") {
    if (!mention.analysis) {
      return NextResponse.json({ ok: false, error: "Mention belum dianalisis." }, { status: 400 });
    }
    await prisma.mentionAnalysis.update({
      where: { mentionId: mention.id },
      data: { isRelevant: false, issueCategory: "irrelevant", relevanceScore: 0 },
    });
    return NextResponse.json({ ok: true, action });
  }

  if (action === "correct_category") {
    const issueCategory = String(body.issueCategory ?? "").trim();
    if (!issueCategory || !mention.analysis) {
      return NextResponse.json(
        { ok: false, error: "Butuh 'issueCategory' dan mention yang sudah dianalisis." },
        { status: 400 }
      );
    }
    await prisma.mentionAnalysis.update({
      where: { mentionId: mention.id },
      data: { issueCategory, reasoning: `${mention.analysis.reasoning} [Dikoreksi manual oleh user]`.trim() },
    });
    return NextResponse.json({ ok: true, action });
  }

  if (action === "save_insight") {
    const idea = await prisma.contentIdea.create({
      data: {
        brandId: mention.brandId,
        idea: `Insight dari ${mention.sourcePlatform}: tindak lanjuti "${mention.content.slice(0, 80)}"`,
        sourceInsight: `${mention.authorName} (${mention.sourcePlatform}): ${mention.content}`,
        audiencePain: mention.analysis?.summary ?? "",
        hookSuggestion: "",
        angle: mention.analysis?.suggestedAction ?? "",
        format: "",
        cta: "",
        priorityScore: mention.analysis?.riskScore ?? 50,
        whyNow: "Disimpan manual dari drawer Social Listening.",
        status: "saved",
      },
    });
    return NextResponse.json({ ok: true, action, ideaId: idea.id });
  }

  return NextResponse.json({ ok: false, error: `Aksi '${action}' tidak dikenal.` }, { status: 400 });
}
