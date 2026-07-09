import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";
import { getActiveBrand, toBrandContext } from "@/lib/brand";
import { rateLimit } from "@/lib/rate-limit";

/** POST /api/content-ideas — generate ide konten dari insight mention terbaru. */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { scope: "content-ideas", limit: 15, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const count = Math.min(Number(body.count) || 4, 8);

  const brand = await getActiveBrand();
  const analyses = await prisma.mentionAnalysis.findMany({
    where: { mention: { brandId: brand.id }, isRelevant: true },
    include: { mention: { select: { content: true, sourcePlatform: true } } },
    orderBy: { analyzedAt: "desc" },
    take: 50,
  });

  const ideas = await getAI().generateContentIdeas(
    analyses.map((a) => ({
      content: a.mention.content,
      sentiment: a.sentiment,
      intent: a.intent,
      issueCategory: a.issueCategory,
      sourcePlatform: a.mention.sourcePlatform,
    })),
    toBrandContext(brand),
    count
  );

  const created = [];
  for (const idea of ideas) {
    created.push(await prisma.contentIdea.create({ data: { ...idea, brandId: brand.id } }));
  }
  return NextResponse.json({ ok: true, ideas: created });
}

/** PATCH /api/content-ideas — update status ide (saved/used/archived). */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.id || !body.status) {
    return NextResponse.json({ ok: false, error: "Butuh 'id' dan 'status'." }, { status: 400 });
  }
  const updated = await prisma.contentIdea.update({
    where: { id: String(body.id) },
    data: { status: String(body.status) },
  });
  return NextResponse.json({ ok: true, idea: updated });
}
