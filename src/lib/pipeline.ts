import { prisma } from "./prisma";
import { getAI } from "./ai";
import { mentionContentHash } from "./hash";
import type { AIAnalysisResult, BrandContext, RawMention } from "./types";
import type { MentionForAnalysis } from "./ai/provider";

/**
 * Cek apakah mention mengandung keyword kompetitor.
 * @returns Nama kompetitor pertama yang ditemukan, atau null.
 */
function mentionText(mention: Pick<MentionForAnalysis, "title" | "content">): string {
  return `${mention.title} ${mention.content}`.toLowerCase();
}

function hasExplicitBrandMention(
  mention: Pick<MentionForAnalysis, "title" | "content">,
  brandCtx: BrandContext
): boolean {
  const text = mentionText(mention);
  const brandTerms = [brandCtx.name, ...brandCtx.aliases]
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return brandTerms.some((term) => text.includes(term));
}

function findCompetitorInMention(
  mention: Pick<MentionForAnalysis, "title" | "content">,
  brandCtx: BrandContext
): string | null {
  if (!brandCtx.competitors.length) return null;
  const text = mentionText(mention);
  return brandCtx.competitors.find((c) => text.includes(c.toLowerCase())) ?? null;
}

function buildIrrelevantAnalysis(competitor: string | null): AIAnalysisResult {
  return {
    isRelevant: false,
    relevanceScore: 0,
    sentiment: "neutral",
    sentimentScore: 0,
    confidenceScore: 95,
    reputationalImpact: "low",
    riskScore: 0,
    issueCategory: "irrelevant",
    emotion: "netral",
    intent: "information",
    summary: competitor
      ? `Mention tentang kompetitor ${competitor}, bukan tentang brand.`
      : "Mention tidak menyebut brand secara eksplisit, jadi dianggap tidak relevan.",
    reasoning: competitor
      ? "Prefilter: terdeteksi keyword kompetitor tanpa penyebutan brand."
      : "Prefilter: brand/alias tidak disebut secara eksplisit di judul atau konten.",
    suggestedAction: "Tidak perlu aksi; lanjutkan monitoring.",
    relatedCompetitors: competitor ? [competitor] : [],
    detectedLocations: [],
    detectedSlang: [],
    relatedKeywords: [],
    relatedHashtags: [],
    contentOpportunity: competitor ? `Bahan gap analysis vs ${competitor}.` : "",
  };
}

/** Petakan hasil AI → kolom MentionAnalysis (array/objek disimpan sebagai JSON string). */
export function analysisToDb(result: AIAnalysisResult) {
  const { detectedLocations, detectedSlang, relatedKeywords, relatedHashtags, relatedCompetitors, ...scalars } = result;
  return {
    ...scalars,
    detectedLocations: JSON.stringify(detectedLocations ?? []),
    detectedSlang: JSON.stringify(detectedSlang ?? []),
    relatedKeywords: JSON.stringify(relatedKeywords ?? []),
    relatedHashtags: JSON.stringify(relatedHashtags ?? []),
    relatedCompetitors: JSON.stringify(relatedCompetitors ?? []),
    contentOpportunity: result.contentOpportunity ?? "",
  };
}

/** Persist geo + slang hasil analisis ke tabel GeoMention/SlangTerm/SlangMention. */
export async function persistAnalysisExtras(
  brandId: string,
  mentionId: string,
  platform: string,
  result: AIAnalysisResult
): Promise<void> {
  // Geo — level agregat (negara/provinsi/kota), bukan lokasi personal detail.
  await prisma.geoMention.deleteMany({ where: { mentionId } });
  const locations = (Array.isArray(result.detectedLocations) ? result.detectedLocations : []).slice(0, 5);
  if (locations.length) {
    await prisma.geoMention.createMany({
      data: locations.map((l) => ({
        mentionId,
        name: l.name,
        type: l.type,
        confidence: l.confidence,
        source: l.source,
      })),
    });
  }

  // Slang — upsert kamus per brand + hubungkan ke mention.
  for (const s of (Array.isArray(result.detectedSlang) ? result.detectedSlang : []).slice(0, 8)) {
    const term = s.term.toLowerCase().trim();
    if (!term) continue;
    const existing = await prisma.slangTerm.findUnique({
      where: { brandId_slangTerm: { brandId, slangTerm: term } },
    });
    const sentiments = existing ? safeParse(existing.sentimentDistribution) : {};
    const platforms = existing ? safeParse(existing.platformDistribution) : {};
    sentiments[result.sentiment] = (sentiments[result.sentiment] ?? 0) + 1;
    platforms[platform] = (platforms[platform] ?? 0) + 1;

    const saved = existing
      ? await prisma.slangTerm.update({
          where: { id: existing.id },
          data: {
            frequency: { increment: 1 },
            lastSeenAt: new Date(),
            sentimentDistribution: JSON.stringify(sentiments),
            platformDistribution: JSON.stringify(platforms),
            normalizedMeaning: existing.normalizedMeaning || s.meaningSuggestion,
          },
        })
      : await prisma.slangTerm.create({
          data: {
            brandId,
            slangTerm: term,
            normalizedMeaning: s.meaningSuggestion,
            confidenceScore: s.confidence,
            sentimentDistribution: JSON.stringify(sentiments),
            platformDistribution: JSON.stringify(platforms),
          },
        });
    await prisma.slangMention.upsert({
      where: { slangTermId_mentionId: { slangTermId: saved.id, mentionId } },
      create: { slangTermId: saved.id, mentionId },
      update: {},
    });
  }
}

function safeParse(json: string): Record<string, number> {
  try {
    const v = JSON.parse(json);
    return typeof v === "object" && v !== null ? v : {};
  } catch {
    return {};
  }
}

export interface IngestResult {
  /** Mention benar-benar baru yang dibuat. */
  inserted: number;
  /** Data sama (externalId) muncul lagi — engagement/lastSeenAt di-update. */
  updated: number;
  /** Duplikat konten (hash sama) — dilewati, tidak dihitung mention baru. */
  duplicates: number;
  analyzed: number;
}

/**
 * Pipeline ingest: Collect → dedup → simpan → analyze.
 * Dipakai oleh mock connector refresh, manual import CSV/JSON, dan seed.
 *
 * Deduplication dua lapis (angka summary tidak boleh naik karena duplikasi):
 * 1. (sourcePlatform, externalId) sama → item yang sama di-fetch ulang:
 *    update engagement metric + lastSeenAt + seenCount → dihitung "updated".
 * 2. contentHash sama (platform+author+konten ternormalisasi+tanggal) →
 *    duplikat konten dengan externalId berbeda: JANGAN buat mention baru,
 *    cukup update lastSeenAt/seenCount mention asli → dihitung "duplicates".
 */
export async function ingestMentions(
  brandId: string,
  raws: RawMention[],
  brandCtx: BrandContext,
  sourceId?: string
): Promise<IngestResult> {
  const ai = getAI("intelligence");
  const result: IngestResult = { inserted: 0, updated: 0, duplicates: 0, analyzed: 0 };
  const now = new Date();

  for (const raw of raws) {
    const hash = mentionContentHash(raw);

    // Lapis 1: item identik (externalId) → update metric, bukan mention baru.
    const byExternalId = await prisma.mention.findUnique({
      where: {
        sourcePlatform_externalId: {
          sourcePlatform: raw.sourcePlatform,
          externalId: raw.externalId,
        },
      },
      select: { id: true, engagementCount: true, seenCount: true },
    });
    if (byExternalId) {
      await prisma.mention.update({
        where: { id: byExternalId.id },
        data: {
          engagementCount: Math.max(byExternalId.engagementCount, raw.engagementCount),
          likeCount: raw.likeCount,
          commentCount: raw.commentCount,
          shareCount: raw.shareCount,
          viewCount: raw.viewCount,
          lastSeenAt: now,
          seenCount: byExternalId.seenCount + 1,
        },
      });
      result.updated++;
      continue;
    }

    // Lapis 2: konten sama dari author sama pada hari sama → duplikat.
    const byHash = await prisma.mention.findFirst({
      where: { brandId, contentHash: hash },
      select: { id: true, engagementCount: true, seenCount: true },
    });
    if (byHash) {
      await prisma.mention.update({
        where: { id: byHash.id },
        data: {
          engagementCount: Math.max(byHash.engagementCount, raw.engagementCount),
          lastSeenAt: now,
          seenCount: byHash.seenCount + 1,
        },
      });
      result.duplicates++;
      continue;
    }

    const mention = await prisma.mention.create({
      data: {
        brandId,
        sourceId: sourceId ?? null,
        sourcePlatform: raw.sourcePlatform,
        sourceType: raw.sourceType,
        externalId: raw.externalId,
        url: raw.url,
        authorName: raw.authorName,
        authorHandle: raw.authorHandle,
        title: raw.title,
        content: raw.content,
        publishedAt: raw.publishedAt,
        engagementCount: raw.engagementCount,
        likeCount: raw.likeCount,
        commentCount: raw.commentCount,
        shareCount: raw.shareCount,
        viewCount: raw.viewCount,
        language: raw.language,
        mediaTier: raw.mediaTier ?? "",
        rawPayload: JSON.stringify(raw.rawPayload ?? {}),
        origin: raw.origin ?? "mock",
        contentHash: hash,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });
    result.inserted++;

    let analysis: AIAnalysisResult;
    const explicitBrandHit = hasExplicitBrandMention(raw, brandCtx);

    if (!explicitBrandHit) {
      const competitor = findCompetitorInMention(raw, brandCtx);
      analysis = buildIrrelevantAnalysis(competitor);
    } else {
      analysis = await ai.analyzeMention(
        {
          sourcePlatform: raw.sourcePlatform,
          sourceType: raw.sourceType,
          title: raw.title,
          content: raw.content,
          authorName: raw.authorName,
          authorHandle: raw.authorHandle,
          engagementCount: raw.engagementCount,
          mediaTier: raw.mediaTier || undefined,
        },
        brandCtx
      );
    }

    await prisma.mentionAnalysis.create({
      data: { mentionId: mention.id, ...analysisToDb(analysis) },
    });
    await persistAnalysisExtras(brandId, mention.id, raw.sourcePlatform, analysis);
    result.analyzed++;
  }

  return result;
}

/** Analisis ulang mention yang belum punya analysis (mis. hasil import mentah). */
export async function analyzePending(brandId: string, brandCtx: BrandContext): Promise<number> {
  const ai = getAI("intelligence");
  const pending = await prisma.mention.findMany({
    where: { brandId, analysis: null },
    take: 100,
  });
  for (const m of pending) {
    let result: AIAnalysisResult;
    const explicitBrandHit = hasExplicitBrandMention(m, brandCtx);

    if (!explicitBrandHit) {
      const competitor = findCompetitorInMention(m, brandCtx);
      result = buildIrrelevantAnalysis(competitor);
    } else {
      result = await ai.analyzeMention(
        {
          sourcePlatform: m.sourcePlatform,
          sourceType: m.sourceType,
          title: m.title,
          content: m.content,
          authorName: m.authorName,
          authorHandle: m.authorHandle,
          engagementCount: m.engagementCount,
          mediaTier: m.mediaTier || undefined,
        },
        brandCtx
      );
    }
    await prisma.mentionAnalysis.create({ data: { mentionId: m.id, ...analysisToDb(result) } });
    await persistAnalysisExtras(brandId, m.id, m.sourcePlatform, result);
  }
  return pending.length;
}

/**
 * Deteksi negative spike sederhana: bandingkan jumlah mention negatif 24 jam
 * terakhir vs baseline 24 jam sebelumnya. Buat Alert bila naik signifikan.
 */
export async function detectNegativeSpike(brandId: string): Promise<void> {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const [current, baseline] = await Promise.all([
    prisma.mentionAnalysis.count({
      where: {
        sentiment: "negative",
        mention: { brandId, publishedAt: { gte: new Date(now - dayMs) } },
      },
    }),
    prisma.mentionAnalysis.count({
      where: {
        sentiment: "negative",
        mention: {
          brandId,
          publishedAt: { gte: new Date(now - 2 * dayMs), lt: new Date(now - dayMs) },
        },
      },
    }),
  ]);

  if (current >= 5 && current > baseline * 1.5) {
    const recentAlert = await prisma.alert.findFirst({
      where: {
        brandId,
        type: "negative_spike",
        status: "open",
        createdAt: { gte: new Date(now - 6 * 60 * 60 * 1000) },
      },
    });
    if (!recentAlert) {
      await prisma.alert.create({
        data: {
          brandId,
          type: "negative_spike",
          severity: current > baseline * 3 ? "critical" : "high",
          title: `Lonjakan mention negatif: ${current} dalam 24 jam (baseline ${baseline})`,
          description:
            "Volume percakapan negatif naik di atas baseline periode sebelumnya. Cek saved view Negative Watch dan siapkan respons.",
        },
      });
    }
  }
}
