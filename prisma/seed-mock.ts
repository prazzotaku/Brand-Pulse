/**
 * Seed data MOCK menyeluruh untuk demo Brand Pulse OS:
 * - mention mock 9 platform (dengan geo + slang) tersebar 30 hari + histori bulanan
 * - analisis AI (sentiment, geo, slang, keyword) via MockAIProvider
 * - metrik akun (AccountMetric) untuk Account Engagement
 * Jalankan: npx tsx prisma/seed-mock.ts   (dipanggil juga oleh npm run db:reset)
 */
import { PrismaClient } from "@prisma/client";
import { MOCK_POOLS, MOCK_ACCOUNT_METRICS } from "../src/lib/connectors/mock-data";
import { templateToMention } from "../src/lib/connectors/mock-connector";
import { MockAIProvider } from "../src/lib/ai/mock-provider";
import { mentionContentHash } from "../src/lib/hash";
import { parseJsonArray, type BrandContext, type RawMention, type SourcePlatform } from "../src/lib/types";

const prisma = new PrismaClient();
const ai = new MockAIProvider();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function main() {
  console.log("Seeding MOCK data (semua platform)...");
  const brand = await prisma.brand.findFirst({ include: { keywords: true }, orderBy: { createdAt: "asc" } });
  if (!brand) throw new Error("Brand belum ada — jalankan npm run db:seed dulu.");

  // Bersihkan data mention lama agar tidak dobel (tetap simpan brand/akun/saved view).
  await prisma.slangMention.deleteMany();
  await prisma.geoMention.deleteMany();
  await prisma.mentionAnalysis.deleteMany();
  await prisma.mention.deleteMany({ where: { brandId: brand.id } });
  await prisma.slangTerm.deleteMany({ where: { brandId: brand.id } });
  await prisma.accountMetric.deleteMany();

  const brandCtx: BrandContext = {
    name: brand.name,
    aliases: parseJsonArray(brand.aliases),
    competitors: parseJsonArray(brand.competitors),
    products: parseJsonArray(brand.products),
    brandVoice: brand.brandVoice,
    prohibitedClaims: parseJsonArray(brand.prohibitedClaims),
    targetAudience: brand.targetAudience,
    includeKeywords: brand.keywords.filter((k) => k.type === "include").map((k) => k.keyword),
    excludeKeywords: brand.keywords.filter((k) => k.type === "exclude").map((k) => k.keyword),
    issueKeywords: brand.keywords.filter((k) => k.type === "issue").map((k) => k.keyword),
  };

  const now = Date.now();
  const platforms = Object.keys(MOCK_POOLS) as SourcePlatform[];
  const raws: RawMention[] = [];

  // Sebar dalam 30 hari terakhir (2 salinan waktu berbeda per template) +
  // histori sampai 11 bulan lalu (untuk analisis per bulan/tahun & Buzz Geo).
  platforms.forEach((platform, pi) => {
    MOCK_POOLS[platform].forEach((template, ti) => {
      for (let copy = 0; copy < 2; copy++) {
        const ageMs = copy === 0
          ? (ti + 1) * 6 * HOUR + pi * 3 * HOUR
          : (5 + ti) * DAY + pi * 2 * DAY;
        // Jam publish variatif (untuk chart per jam Buzz Geo).
        const d = new Date(now - Math.min(ageMs, 29 * DAY));
        d.setHours((9 + ti * 2 + pi) % 24, (ti * 13) % 60);
        raws.push(templateToMention(template, platform, `seed-${platform}-${ti}-${copy}`, d));
      }
      // Histori 1 salinan/template beberapa bulan lalu.
      const monthsAgo = ((ti + pi) % 11) + 1;
      const dh = new Date(now);
      dh.setMonth(dh.getMonth() - monthsAgo);
      dh.setDate(1 + ((ti * 7 + pi * 3) % 26));
      dh.setHours((10 + ti) % 24, 0);
      raws.push(templateToMention(template, platform, `seed-hist-${platform}-${ti}`, dh));
    });
  });

  const sources = await prisma.source.findMany({ where: { brandId: brand.id } });
  let count = 0;
  for (const raw of raws) {
    const analysis = await ai.analyzeMention(
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
    const source = sources.find((s) => s.platform === raw.sourcePlatform);
    const mention = await prisma.mention.create({
      data: {
        brandId: brand.id,
        sourceId: source?.id ?? null,
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
        rawPayload: JSON.stringify(raw.rawPayload),
        origin: "mock",
        contentHash: mentionContentHash(raw),
        firstSeenAt: raw.publishedAt,
        lastSeenAt: raw.publishedAt,
      },
    });

    const { detectedLocations, detectedSlang, relatedKeywords, relatedHashtags, relatedCompetitors, ...scalars } = analysis;
    await prisma.mentionAnalysis.create({
      data: {
        mentionId: mention.id,
        ...scalars,
        detectedLocations: JSON.stringify(detectedLocations),
        detectedSlang: JSON.stringify(detectedSlang),
        relatedKeywords: JSON.stringify(relatedKeywords),
        relatedHashtags: JSON.stringify(relatedHashtags),
        relatedCompetitors: JSON.stringify(relatedCompetitors),
      },
    });

    if (detectedLocations.length) {
      await prisma.geoMention.createMany({
        data: detectedLocations.map((l) => ({
          mentionId: mention.id, name: l.name, type: l.type, confidence: l.confidence, source: l.source,
        })),
      });
    }
    for (const s of detectedSlang) {
      const term = s.term.toLowerCase().trim();
      const existing = await prisma.slangTerm.findUnique({ where: { brandId_slangTerm: { brandId: brand.id, slangTerm: term } } });
      const sentiments = existing ? JSON.parse(existing.sentimentDistribution) : {};
      const plats = existing ? JSON.parse(existing.platformDistribution) : {};
      sentiments[analysis.sentiment] = (sentiments[analysis.sentiment] ?? 0) + 1;
      plats[raw.sourcePlatform] = (plats[raw.sourcePlatform] ?? 0) + 1;
      const saved = existing
        ? await prisma.slangTerm.update({ where: { id: existing.id }, data: { frequency: { increment: 1 }, lastSeenAt: raw.publishedAt, sentimentDistribution: JSON.stringify(sentiments), platformDistribution: JSON.stringify(plats) } })
        : await prisma.slangTerm.create({ data: { brandId: brand.id, slangTerm: term, normalizedMeaning: s.meaningSuggestion, confidenceScore: s.confidence, firstSeenAt: raw.publishedAt, lastSeenAt: raw.publishedAt, sentimentDistribution: JSON.stringify(sentiments), platformDistribution: JSON.stringify(plats) } });
      await prisma.slangMention.create({ data: { slangTermId: saved.id, mentionId: mention.id } });
    }
    count++;
  }

  // Metrik akun untuk Account Engagement (7 hari terakhir per akun).
  const accounts = await prisma.sourceAccount.findMany({ where: { brandId: brand.id } });
  let metricRows = 0;
  for (const acc of accounts) {
    const base = MOCK_ACCOUNT_METRICS[`${acc.platform}:${acc.handle}`];
    if (!base) continue;
    for (let d = 6; d >= 0; d--) {
      const jitter = 0.95 + Math.random() * 0.1;
      const followers = acc.platform === "youtube" ? 0 : Math.round(base.followers * jitter);
      const subs = acc.platform === "youtube" ? Math.round(base.followers * jitter) : 0;
      const totalEng = Math.round((base.likes + base.comments + base.shares) * jitter);
      const totalViews = Math.round(base.views * jitter);
      const denom = followers || subs || 1;
      await prisma.accountMetric.create({
        data: {
          sourceAccountId: acc.id,
          date: new Date(now - d * DAY),
          followerCount: followers,
          subscriberCount: subs,
          postCount: base.posts,
          totalLikes: Math.round(base.likes * jitter),
          totalComments: Math.round(base.comments * jitter),
          totalShares: Math.round(base.shares * jitter),
          totalViews,
          engagementRateByFollowers: Number(((totalEng / denom) * 100).toFixed(2)),
          engagementRateByViews: totalViews > 0 ? Number(((totalEng / totalViews) * 100).toFixed(2)) : 0,
          averageEngagementPerPost: Number((totalEng / base.posts).toFixed(1)),
          averageViewsPerPost: totalViews > 0 ? Number((totalViews / base.posts).toFixed(1)) : 0,
          rawMetrics: JSON.stringify({ mock: true }),
        },
      });
      metricRows++;
    }
  }

  // ContentMetric untuk akun own — top content per akun (untuk tabel Account Engagement).
  await prisma.contentMetric.deleteMany();
  const CONTENT_TEMPLATES: Record<string, { type: string; title: string }[]> = {
    instagram: [
      { type: "reel", title: "Tips aman transaksi QRIS di pasar" },
      { type: "post", title: "Program CSR Jakarta Cerdas 2026" },
      { type: "post", title: "Cara aktivasi JakCard dalam 3 langkah" },
    ],
    x: [
      { type: "post", title: "Update: integrasi JakCard x TransJakarta" },
      { type: "post", title: "Promo cashback QRIS 30% bulan ini" },
    ],
    youtube: [
      { type: "video", title: "Tutorial lengkap JakOne Mobile 2026" },
      { type: "video", title: "Bank Jakarta dukung UMKM Jakarta" },
    ],
    tiktok: [
      { type: "video", title: "3 fitur JakOne yang jarang diketahui" },
      { type: "video", title: "Bayar retribusi dari HP, gampang!" },
    ],
  };
  let contentRows = 0;
  for (const acc of accounts.filter((a) => a.accountType === "own")) {
    const templates = CONTENT_TEMPLATES[acc.platform] ?? [];
    const base = MOCK_ACCOUNT_METRICS[`${acc.platform}:${acc.handle}`];
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      const likes = Math.round(((base?.likes ?? 5000) / (8 + i * 4)) * (0.8 + Math.random() * 0.6));
      const comments = Math.round(likes * (0.04 + Math.random() * 0.03));
      const shares = Math.round(likes * (0.02 + Math.random() * 0.02));
      const views = acc.platform === "youtube" || acc.platform === "tiktok"
        ? Math.round(likes * (12 + Math.random() * 8)) : 0;
      const totalEng = likes + comments + shares;
      const denom = views || base?.followers || 1000;
      await prisma.contentMetric.create({
        data: {
          sourceAccountId: acc.id,
          platform: acc.platform,
          contentType: t.type,
          externalId: `content-${acc.platform}-${acc.handle}-${i}`,
          publishedAt: new Date(now - (i + 1) * 3 * DAY),
          title: t.title,
          url: acc.url ? `${acc.url}/${t.type}-${i}` : "",
          likeCount: likes,
          commentCount: comments,
          shareCount: shares,
          viewCount: views,
          engagementRate: Number(((totalEng / denom) * 100).toFixed(2)),
          sentimentScore: 20 + Math.round(Math.random() * 40),
          rawMetrics: JSON.stringify({ mock: true }),
        },
      });
      contentRows++;
    }
  }

  const geo = await prisma.geoMention.count();
  const slang = await prisma.slangTerm.count({ where: { brandId: brand.id } });
  console.log(`Selesai: ${count} mention mock, ${geo} geo, ${slang} slang term, ${metricRows} account metric, ${contentRows} content metric.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
