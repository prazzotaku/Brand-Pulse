import type { Prisma } from "@prisma/client";

/** Semua parameter filter yang didukung (dibaca dari URL searchParams). */
export interface MentionFilters {
  range?: string; // 24h | 7d | 30d | all
  from?: string; // ISO date (custom range)
  to?: string;
  platform?: string; // csv: "facebook,x"
  sentiment?: string; // csv: "negative,mixed"
  issue?: string; // csv issue categories
  intent?: string; // csv intent: complaint, question, praise, ...
  q?: string; // keyword include (cari di content/title)
  exclude?: string; // keyword exclude
  minRelevance?: string;
  minRisk?: string;
  minConfidence?: string;
  minEngagement?: string;
  minViews?: string;
  minComments?: string;
  minShares?: string;
  mediaTier?: string; // csv: tier1,tier2
  language?: string;
  author?: string;
  sourceType?: string; // csv: comment,reply,post,video,article,thread
  hashtag?: string; // cari #hashtag di konten
  location?: string; // nama lokasi hasil deteksi geo
  geoConfidence?: string; // minimal confidence geo 0-100
  slang?: string; // slang term yang terdeteksi
  /** "1" = tampilkan juga mention yang AI tandai tidak relevan (default: disembunyikan). */
  includeIrrelevant?: string;
}

const RANGE_MS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
};

function csv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Terjemahkan filter URL → Prisma where clause untuk Mention. */
export function buildMentionWhere(brandId: string, f: MentionFilters): Prisma.MentionWhereInput {
  const where: Prisma.MentionWhereInput = { brandId };
  const analysis: Prisma.MentionAnalysisWhereInput = {};

  // Date range
  if (f.from || f.to) {
    // "to" dari input date = awal hari; geser ke akhir hari agar inklusif.
    const toDate = f.to ? new Date(f.to) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);
    where.publishedAt = {
      ...(f.from ? { gte: new Date(f.from) } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  } else {
    const range = f.range ?? "7d";
    if (range !== "all" && RANGE_MS[range]) {
      where.publishedAt = { gte: new Date(Date.now() - RANGE_MS[range]) };
    }
  }

  const platforms = csv(f.platform);
  if (platforms.length) where.sourcePlatform = { in: platforms };

  const sourceTypes = csv(f.sourceType);
  if (sourceTypes.length) where.sourceType = { in: sourceTypes };

  const tiers = csv(f.mediaTier);
  if (tiers.length) where.mediaTier = { in: tiers };

  if (f.language) where.language = f.language;

  if (f.author) {
    where.OR = [
      { authorName: { contains: f.author } },
      { authorHandle: { contains: f.author } },
    ];
  }

  if (f.q) {
    where.AND = [
      ...((where.AND as Prisma.MentionWhereInput[]) ?? []),
      { OR: [{ content: { contains: f.q } }, { title: { contains: f.q } }] },
    ];
  }
  if (f.exclude) {
    where.AND = [
      ...((where.AND as Prisma.MentionWhereInput[]) ?? []),
      { NOT: { OR: [{ content: { contains: f.exclude } }, { title: { contains: f.exclude } }] } },
    ];
  }

  const minEng = Number(f.minEngagement);
  if (minEng > 0) where.engagementCount = { gte: minEng };
  const minViews = Number(f.minViews);
  if (minViews > 0) where.viewCount = { gte: minViews };
  const minComments = Number(f.minComments);
  if (minComments > 0) where.commentCount = { gte: minComments };
  const minShares = Number(f.minShares);
  if (minShares > 0) where.shareCount = { gte: minShares };

  if (f.hashtag) {
    const tag = f.hashtag.startsWith("#") ? f.hashtag : `#${f.hashtag}`;
    where.AND = [
      ...((where.AND as Prisma.MentionWhereInput[]) ?? []),
      { OR: [{ content: { contains: tag } }, { title: { contains: tag } }] },
    ];
  }

  // Filter geo: nama lokasi terdeteksi + minimal confidence.
  if (f.location || Number(f.geoConfidence) > 0) {
    where.geoMentions = {
      some: {
        ...(f.location ? { name: { contains: f.location } } : {}),
        ...(Number(f.geoConfidence) > 0 ? { confidence: { gte: Number(f.geoConfidence) } } : {}),
      },
    };
  }

  // Filter slang: mention yang mengandung slang term tertentu.
  if (f.slang) {
    where.slangMentions = {
      some: { slangTerm: { slangTerm: { contains: f.slang.toLowerCase() } } },
    };
  }

  // Filter pada hasil analisis AI
  const sentiments = csv(f.sentiment);
  if (sentiments.length) analysis.sentiment = { in: sentiments };

  const issues = csv(f.issue);
  if (issues.length) analysis.issueCategory = { in: issues };

  const intents = csv(f.intent);
  if (intents.length) analysis.intent = { in: intents };

  const minRel = Number(f.minRelevance);
  if (minRel > 0) analysis.relevanceScore = { gte: minRel };

  const minRisk = Number(f.minRisk);
  if (minRisk > 0) analysis.riskScore = { gte: minRisk };

  const minConf = Number(f.minConfidence);
  if (minConf > 0) analysis.confidenceScore = { gte: minConf };

  // Default: sembunyikan mention yang AI tandai tidak relevan dengan brand
  // (mis. artikel yang topiknya "berkaitan" tapi tidak benar-benar menyebut
  // brand). User bisa membukanya lewat filter includeIrrelevant=1 untuk audit.
  if (f.includeIrrelevant !== "1") analysis.isRelevant = true;

  if (Object.keys(analysis).length > 0) where.analysis = analysis;

  return where;
}

/** Serialisasi filter menjadi querystring (untuk saved view). */
export function filtersToQuery(f: MentionFilters): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v) params.set(k, String(v));
  }
  return params.toString();
}
