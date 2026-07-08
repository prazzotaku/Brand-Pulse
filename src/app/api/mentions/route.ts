import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { buildMentionWhere, type MentionFilters } from "@/lib/filters";
import { resolvePeriod, periodWhere } from "@/lib/period";
import { applyCategory, buildSocialWhere, SOCIAL_CATEGORIES, type SocialSearchParams } from "@/lib/social";

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /api/mentions — daftar mention terfilter + total count + pagination.
 * Dipakai drawer detail Social Listening (social=1&category=...) agar rincian
 * memakai query yang PERSIS sama dengan angka summary. Dukung format=csv.
 */
export async function GET(req: NextRequest) {
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries()) as SocialSearchParams & {
    social?: string;
    category?: string;
    page?: string;
    pageSize?: string;
    format?: string;
  };

  const brand = await getActiveBrand();

  let where;
  if (sp.social === "1") {
    where = buildSocialWhere(brand.id, sp);
  } else {
    where = buildMentionWhere(brand.id, sp as MentionFilters);
    where.publishedAt = periodWhere(resolvePeriod(sp));
    where.isDuplicate = false;
  }

  if (sp.category) {
    const cat = SOCIAL_CATEGORIES.find((c) => c.key === sp.category);
    if (!cat) {
      return NextResponse.json({ ok: false, error: `Kategori '${sp.category}' tidak dikenal.` }, { status: 400 });
    }
    where = applyCategory(where, cat);
  }

  const total = await prisma.mention.count({ where });

  if (sp.format === "csv") {
    const rows = await prisma.mention.findMany({
      where,
      include: { analysis: true },
      orderBy: { publishedAt: "desc" },
      take: 5000,
    });
    const header = [
      "publishedAt", "collectedAt", "origin", "platform", "sourceType", "authorName", "authorHandle",
      "content", "sentiment", "issueCategory", "intent", "emotion", "riskScore",
      "relevanceScore", "confidenceScore", "engagement", "seenCount", "lastSeenAt", "url",
    ];
    const lines = rows.map((m) =>
      [
        m.publishedAt.toISOString(), m.createdAt.toISOString(), m.origin, m.sourcePlatform, m.sourceType,
        m.authorName, m.authorHandle, m.content, m.analysis?.sentiment ?? "", m.analysis?.issueCategory ?? "",
        m.analysis?.intent ?? "", m.analysis?.emotion ?? "", m.analysis?.riskScore ?? "",
        m.analysis?.relevanceScore ?? "", m.analysis?.confidenceScore ?? "", m.engagementCount,
        m.seenCount, m.lastSeenAt.toISOString(), m.url,
      ].map(csvEscape).join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="mentions-${sp.category ?? "all"}-${Date.now()}.csv"`,
      },
    });
  }

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.pageSize) || 20));
  const items = await prisma.mention.findMany({
    where,
    include: { analysis: true },
    orderBy: { publishedAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return NextResponse.json({ ok: true, total, page, pageSize, items });
}
