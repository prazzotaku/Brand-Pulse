import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBrand, toBrandContext } from "@/lib/brand";
import { getConnectors } from "@/lib/connectors/registry";
import { detectNegativeSpike, ingestMentions } from "@/lib/pipeline";
import type { RawMention } from "@/lib/types";
import type { FetchParams, SourceConnector } from "@/lib/connectors/types";

/** Retry dengan exponential backoff (2 percobaan ulang: 300ms, 1200ms). */
async function fetchWithRetry(connector: SourceConnector, params: FetchParams): Promise<RawMention[]> {
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
 * per connector: incremental fetch (sejak lastSyncAt) → dedup 2 lapis → simpan →
 * AI analysis (sentiment+geo+slang+keyword) → deteksi spike. Setiap connector
 * tercatat sebagai CrawlRun; error/rate limit tidak menjatuhkan job lain.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const trigger = body.trigger === "scheduled" ? "scheduled" : "manual";

  const brand = await getActiveBrand();
  const brandCtx = toBrandContext(brand);

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

    const sources = await prisma.source.findMany({ where: { brandId: brand.id } });

    for (const connector of getConnectors()) {
      const source = sources.find((s) => s.platform === connector.meta.platform);
      const run = await prisma.crawlRun.create({
        data: {
          brandId: brand.id,
          refreshJobId: job.id,
          connector: connector.meta.platform,
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
          if (source) {
            await prisma.source.update({ where: { id: source.id }, data: { status: "pending_auth" } });
          }
          continue;
        }
        if (connector.meta.method === "manual_import") {
          await prisma.crawlRun.update({
            where: { id: run.id },
            data: { status: "skipped", finishedAt: new Date() },
          });
          continue;
        }

        // Incremental fetching: hanya data sejak sinkronisasi terakhir.
        const raws = await fetchWithRetry(connector, {
          query: brand.name,
          since: source?.lastSyncAt ?? undefined,
          limit: 15,
        });
        const result = await ingestMentions(brand.id, raws, brandCtx, source?.id);

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
        if (source) {
          await prisma.source.update({
            where: { id: source.id },
            data: { lastSyncAt: new Date(), status: "active" },
          });
        }
      } catch (err) {
        const classified = connector.handleError(err);
        failedSources++;
        failures.push(`${connector.meta.platform}: ${classified.detail ?? String(err)}`);
        await prisma.crawlRun.update({
          where: { id: run.id },
          data: { status: classified.status, finishedAt: new Date(), error: classified.detail ?? String(err) },
        });
        if (classified.status === "rate_limited") {
          await prisma.rateLimitLog.create({
            data: { platform: connector.meta.platform, note: classified.detail ?? "" },
          });
        }
        if (source) {
          await prisma.source.update({ where: { id: source.id }, data: { status: classified.status } });
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
