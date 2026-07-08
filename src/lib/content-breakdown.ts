import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { PLATFORM_LABELS } from "./constants";

export const SOURCE_TYPES = ["post", "comment", "article", "video", "caption", "reply", "thread"] as const;
export type SourceTypeKey = (typeof SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  post: "Post",
  comment: "Komentar",
  article: "Artikel",
  video: "Video",
  caption: "Caption",
  reply: "Reply",
  thread: "Thread",
};

/** Label gabungan, mis. instagram+comment → "Komentar Instagram". */
export function contentLabel(platform: string, type: string): string {
  const t = SOURCE_TYPE_LABELS[type] ?? type;
  const p = PLATFORM_LABELS[platform] ?? platform;
  return `${t} ${p}`;
}

export interface BreakdownCell {
  platform: string;
  sourceType: string;
  count: number;
  engagement: number;
}
export interface BreakdownRow {
  platform: string;
  total: number;
  engagement: number;
  byType: Record<string, number>;
}
export interface ContentBreakdown {
  cells: BreakdownCell[]; // platform × tipe, urut count desc
  rows: BreakdownRow[]; // per platform (untuk tabel & chart)
  byType: { sourceType: string; count: number }[];
  total: number;
  totalEngagement: number;
}

/**
 * Hitung breakdown jumlah mention per platform × tipe konten (+ engagement).
 * `where` sudah mencakup filter aktif (periode, platform, sentimen, dll),
 * jadi angka konsisten dengan filter — bisa dipakai halaman & Reports.
 */
export async function getContentBreakdown(where: Prisma.MentionWhereInput): Promise<ContentBreakdown> {
  const grouped = await prisma.mention.groupBy({
    by: ["sourcePlatform", "sourceType"],
    where,
    _count: { _all: true },
    _sum: { engagementCount: true },
  });

  const cells: BreakdownCell[] = grouped.map((g) => ({
    platform: g.sourcePlatform,
    sourceType: g.sourceType,
    count: g._count._all,
    engagement: g._sum.engagementCount ?? 0,
  }));

  const rowMap = new Map<string, BreakdownRow>();
  const typeMap = new Map<string, number>();
  let total = 0;
  let totalEngagement = 0;

  for (const c of cells) {
    total += c.count;
    totalEngagement += c.engagement;
    typeMap.set(c.sourceType, (typeMap.get(c.sourceType) ?? 0) + c.count);
    const row = rowMap.get(c.platform) ?? { platform: c.platform, total: 0, engagement: 0, byType: {} };
    row.total += c.count;
    row.engagement += c.engagement;
    row.byType[c.sourceType] = (row.byType[c.sourceType] ?? 0) + c.count;
    rowMap.set(c.platform, row);
  }

  return {
    cells: cells.sort((a, b) => b.count - a.count),
    rows: [...rowMap.values()].sort((a, b) => b.total - a.total),
    byType: [...typeMap.entries()].map(([sourceType, count]) => ({ sourceType, count })).sort((a, b) => b.count - a.count),
    total,
    totalEngagement,
  };
}
