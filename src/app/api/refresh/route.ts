import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBrand, toBrandContext } from "@/lib/brand";
import { resolveConnector } from "@/lib/connectors/registry";
import { detectNegativeSpike, ingestMentions } from "@/lib/pipeline";
import type { RawMention } from "@/lib/types";
import type { FetchTarget, SourceConnector } from "@/lib/connectors/types";

// Fan-out ke banyak connector live + AI analysis bisa lebih lambat dari
// default 10s Vercel. 60s adalah maksimum yang diizinkan Hobby plan.
export const maxDuration = 60;

/** Retry dengan exponential backoff (2 percobaan ulang: 300ms, 1200ms). */
async function fetchWithRetry(connector: SourceConnector, params: FetchTarget): Promise<RawMention[]> {
  const delays = [300, 1200];
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await connector.fetchMentions(params);
    } catch (err) {
      lastError = err;
      const classified = connector.handleError(err);
      // Auth/rate-limit tidak akan sembuh dengan retry cepat — langsung lempar.
      if (classified.status === "pending_auth" || classified.status === "rate_limited") throw err;
      if (attempt < delays.length) await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastError;
}

/**
 * POST /api/refresh — background crawl job penuh:
 * 1. Bangun daftar "fetch target" dari SourceAccount (akun milik sendiri) dan
 *    SearchProfile (pencarian publik).
 * 2. Untuk setiap target, resolve connector yang sesuai (platform+scope).
 * 3. Jalankan setiap fetch secara independen, catat sebagai CrawlRun per target.
 * 4. Error/rate limit per target tidak menjatuhkan job refresh keseluruhan.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const trigger = body.trigger === "scheduled" ? "scheduled" : "manual";

  const brand = await getActiveBrand();
  const brandCtx = toBrandContext(brand);
  const [sourceAccounts, searchProfiles] = await Promise.all([
    prisma.sourceAccount.findMany({ where: { brandId: brand.id, isActive: true } }),
    prisma.searchProfile.findMany({ where: { brandId: brand.id, isActive: true } }),
  ]);

  const job = await prisma.refreshJob.create({
    data: {
      brandId: brand.id,
      trigger,
      interval: body.interval ?? "",
      status: "running",
      startedAt: new Date(),
    },
  });

  try {
    let inserted = 0;
    let updated = 0;
    let duplicates = 0;
    let analyzed = 0;
    let failedSources = 0;
    const failures: string[] = [];

    // --- 1. Bangun daftar fetch target ---
    const targets: FetchTarget[] = [];
    // Target dari akun milik sendiri (SourceAccount)
    for (const acc of sourceAccounts) {
      targets.push({
        scope: "owned_account",
        platform: acc.platform,
        handle: acc.handle,
        query: acc.handle, // query fallback
        targetId: acc.id,
        limit: 15,
      });
    }
    // Target dari profil pencarian publik (SearchProfile)
    for (const p of searchProfiles) {
      if (!p.platform) continue; // profil lama tanpa platform eksplisit — lewati
      targets.push({
        scope: p.scope === "public_hashtag" ? "public_hashtag" : "public_keyword",
        platform: p.platform,
        query: p.query,
        targetId: p.id,
        limit: 15,
      });
    }
    // Fallback transisi: jika belum ada SourceAccount untuk Instagram, pakai
    // instagramHandle dari Brand (perilaku lama).
    if (!targets.some((t) => t.platform === "instagram" && t.scope === "owned_account") && brand.instagramHandle) {
      targets.push({
        scope: "owned_account",
        platform: "instagram",
        handle: brand.instagramHandle,
        query: brand.instagramHandle,
        limit: 15,
      });
    }

    console.log(`[REFRESH] Ditemukan ${targets.length} fetch target untuk brand "${brand.name}".`);

    for (const target of targets) {
      // --- 2. Resolve connector & jalankan fetch ---
      const connector = resolveConnector(target.platform, target.scope);
      if (!connector) {
        console.warn(`[REFRESH] Tidak ada connector untuk platform=${target.platform}, scope=${target.scope}. Lewati.`);
        continue;
      }

      const run = await prisma.crawlRun.create({
        data: {
          brandId: brand.id,
          refreshJobId: job.id,
          connector: target.platform,
          scope: target.scope,
          sourceAccountId: target.scope === "owned_account" ? target.targetId : undefined,
          searchProfileId: target.scope.startsWith("public") ? target.targetId : undefined,
          status: "running",
        },
      });

      try {
        const status = await connector.getConnectorStatus();
        if (status.status === "pending_auth") {
          await prisma.crawlRun.update({
            where: { id: run.id },
            data: { status: "pending_auth", finishedAt: new Date(), error: status.detail ?? "" },
          });
          continue;
        }

        const raws = await fetchWithRetry(connector, target);
        const result = await ingestMentions(brand.id, raws, brandCtx);

        inserted += result.inserted;
        updated += result.updated;
        duplicates += result.duplicates;
        analyzed += result.analyzed;

        await prisma.crawlRun.update({
          where: { id: run.id },
          data: {
            status: "success",
            finishedAt: new Date(),
            fetched: raws.length,
            inserted: result.inserted,
            updated: result.updated,
            duplicates: result.duplicates,
          },
        });
      } catch (err) {
        const classified = connector.handleError(err);
        const errorDetail = classified.detail ?? String(err);
        console.error(`[REFRESH] Target gagal: platform=${target.platform}, scope=${target.scope}, query="${target.query}". Error:`, errorDetail);
        failedSources++;
        failures.push(`${target.platform} (${target.scope}): ${errorDetail}`);
        await prisma.crawlRun.update({
          where: { id: run.id },
          data: { status: classified.status, finishedAt: new Date(), error: errorDetail },
        });
        if (classified.status === "rate_limited") {
          await prisma.rateLimitLog.create({
            data: { platform: target.platform, note: errorDetail },
          });
        }
      }
    }

    await detectNegativeSpike(brand.id);

    const finishedAt = new Date();
    await prisma.refreshJob.update({
      where: { id: job.id },
      data: {
        status: "success",
        finishedAt,
        newMentions: inserted,
        updatedMentions: updated,
        duplicatesSkipped: duplicates,
        failedSources,
        analyzedCount: analyzed,
        error: failures.join(" | "),
      },
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      finishedAt: finishedAt.toISOString(),
      newMentions: inserted,
      updatedMentions: updated,
      duplicatesSkipped: duplicates,
      failedSources,
      analyzed,
    });
  } catch (err) {
    await prisma.refreshJob.update({
      where: { id: job.id },
      data: { status: "failed", finishedAt: new Date(), error: String(err) },
    });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
