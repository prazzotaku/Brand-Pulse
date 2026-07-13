/**
 * Backfill analisis: jalankan ulang AI pipeline (dengan rubrik akurasi
 * terbaru) untuk semua mention yang sudah ada. Mengisi ulang
 * GeoMention/SlangTerm/SlangMention. Aman diulang (idempotent).
 *
 * Provider EKSPLISIT via env BACKFILL_PROVIDER (default: DeepSeek) — dipakai
 * satu kali untuk backfill besar tanpa mengubah AI_PROVIDER produksi (yang
 * tetap Gemini untuk operasional harian yang hemat token). Percobaan ulang
 * ringan disertakan untuk error 429/503 sementara.
 *
 * Jalankan: npx tsx prisma/backfill-analysis.ts
 */
import { PrismaClient } from "@prisma/client";
import { DeepSeekProvider } from "../src/lib/ai/deepseek-provider";
import { GeminiProvider } from "../src/lib/ai/gemini-provider";
import type { AIProvider } from "../src/lib/ai/provider";
import {
  analysisToDb,
  buildIrrelevantAnalysis,
  findCompetitorInMention,
  hasExplicitBrandMention,
  persistAnalysisExtras,
} from "../src/lib/pipeline";
import { parseJsonArray, type BrandContext } from "../src/lib/types";

const prisma = new PrismaClient();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retry dengan backoff memakai analyzeMentionStrict (melempar error asli,
 * BUKAN analyzeMention biasa yang menelan error dan diam-diam balik mock).
 * Baru menyerah ke mock setelah semua percobaan habis.
 */
async function analyzeWithRetry(
  ai: AIProvider,
  input: Parameters<AIProvider["analyzeMention"]>[0],
  brandCtx: BrandContext,
  retries = 3
) {
  const strict = ai.analyzeMentionStrict?.bind(ai) ?? ai.analyzeMention.bind(ai);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await strict(input, brandCtx);
    } catch (err) {
      if (attempt === retries) {
        console.error(`  menyerah setelah ${retries + 1} percobaan, pakai fallback mock:`, String(err).slice(0, 200));
        return ai.analyzeMention(input, brandCtx); // fallback mock terakhir, tidak melempar
      }
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const providerName = (process.env.BACKFILL_PROVIDER ?? "deepseek").toLowerCase();
  const ai: AIProvider = providerName === "gemini" ? new GeminiProvider() : new DeepSeekProvider();
  console.log(`Backfill memakai AI provider: ${providerName}`);

  const brand = await prisma.brand.findFirst({
    include: { keywords: true },
    orderBy: { createdAt: "asc" },
  });
  if (!brand) throw new Error("Brand tidak ditemukan.");

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

  // BACKFILL_MENTION_ID: mode retarget satu mention saja (mis. perbaiki mention
  // yang gagal di run sebelumnya) — tidak reset seluruh kamus slang brand.
  const targetId = process.env.BACKFILL_MENTION_ID;
  if (!targetId) {
    // Reset slang lama dulu (dibangun ulang dari analisis baru) — hindari term basi.
    await prisma.slangMention.deleteMany({ where: { slangTerm: { brandId: brand.id } } });
    await prisma.slangTerm.deleteMany({ where: { brandId: brand.id } });
  }

  const mentions = await prisma.mention.findMany({
    where: { brandId: brand.id, ...(targetId ? { id: targetId } : {}) },
  });
  console.log(`Menganalisis ulang ${mentions.length} mention...`);

  let done = 0;
  let failed = 0;
  for (const m of mentions) {
    try {
      let result;
      const explicitBrandHit = hasExplicitBrandMention(m, brandCtx);

      if (!explicitBrandHit) {
        const competitor = findCompetitorInMention(m, brandCtx);
        result = buildIrrelevantAnalysis(competitor);
      } else {
        result = await analyzeWithRetry(
          ai,
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

      await prisma.mentionAnalysis.upsert({
        where: { mentionId: m.id },
        create: { mentionId: m.id, ...analysisToDb(result) },
        update: analysisToDb(result),
      });

      await prisma.geoMention.deleteMany({ where: { mentionId: m.id } });
      await persistAnalysisExtras(brand.id, m.id, m.sourcePlatform, result);

      done++;
      if (done % 10 === 0) console.log(`  ${done}/${mentions.length}...`);
    } catch (err) {
      failed++;
      console.error(`  gagal untuk mention ${m.id}:`, err);
    }
  }

  const geoCount = await prisma.geoMention.count();
  const slangCount = await prisma.slangTerm.count({ where: { brandId: brand.id } });
  console.log(`Backfill selesai: ${done} berhasil, ${failed} gagal, ${geoCount} geo terdeteksi, ${slangCount} slang term.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
