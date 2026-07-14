import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBrand, toBrandContext } from "@/lib/brand";
import { getConnectors } from "@/lib/connectors/registry";
import { detectNegativeSpike, ingestMentions } from "@/lib/pipeline";
import type { RawMention } from "@/lib/types";
import type { FetchScope, FetchTarget, SourceConnector } from "@/lib/connectors/types";

export const maxDuration = 60;

async function fetchWithRetry(connector: SourceConnector, params: FetchTarget): Promise<RawMention[]> {
  const delays = [300, 1200];
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await connector.fetchMentions(params);
    } catch (err) {
      lastError = err;
      const classified = connector.handleError(err);
      if (classified.status === "pending_auth" || classified.status === "rate_limited") throw err;
      if (attempt < delays.length) await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastError;
}

function normalizeHandleOrUrl(input: string): string {
  return input.trim().replace(/^https?:\/\/(www\.)?[^/]+\//i, "").replace(/^@+/, "").replace(/\/+$/, "");
}

function normalizePublicQuery(input: string): string {
  return normalizeHandleOrUrl(input).replace(/\([^)]*\)/g, "").trim();
}

function connectorForTarget(target: FetchTarget): SourceConnector | null {
  return (
    getConnectors().find((c) => {
      if (c.meta.platform !== target.platform) return false;
      if (target.connectorHint) return c.meta.method === target.connectorHint;
      return true;
    }) ?? null
  );
}

function scopeForPlatform(platform: string): FetchScope | null {
  if (["facebook", "instagram"].includes(platform)) return "owned_account";
  if (["x", "threads", "tiktok", "youtube"].includes(platform)) return "public_keyword";
  return null;
}

function buildTargetFromAccount(acc: {
  id: string;
  platform: string;
  handle: string;
  displayName: string;
}): FetchTarget | null {
  const scope = scopeForPlatform(acc.platform);
  if (!scope) return null;

  if (scope === "owned_account") {
    const handle = normalizeHandleOrUrl(acc.handle);
    if (!handle) return null;
    return {
      scope,
      platform: acc.platform,
      query: handle,
      handle,
      targetId: acc.id,
      limit: 15,
    };
  }

  const query = normalizePublicQuery(acc.displayName || acc.handle);
  if (!query) return null;
  return {
    scope,
    platform: acc.platform,
    query,
    handle: normalizeHandleOrUrl(acc.handle),
    targetId: acc.id,
    limit: 15,
  };
}

/**
 * POST /api/refresh
 *
 * Target refresh dibangun dari akun aktif di Settings:
 * - Facebook / Instagram → crawl akun langsung lewat handle/URL
 * - X / Threads / TikTok / YouTube → pencarian publik berbasis nama akun
 * - News / Blog → query brand sekali per connector
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const trigger = body.trigger === "scheduled" ? "scheduled" : "manual";

  const brand = await getActiveBrand();
  const brandCtx = toBrandContext(brand);
  const sourceAccounts = await prisma.sourceAccount.findMany({ where: { brandId: brand.id, isActive: true } });

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

    const targets: FetchTarget[] = [];
    for (const acc of sourceAccounts) {
      const target = buildTargetFromAccount(acc);
      if (!target) {
        console.warn(`[REFRESH] Lewati akun ${acc.platform}/${acc.handle}: target tidak valid atau platform belum didukung.`);
        continue;
      }
      targets.push(target);
    }

    const allConnectors = getConnectors();
    const addedQueryTargets = new Set<string>();

    // Jalankan juga connector yang tidak berbasis akun: News dan Blog.
    for (const connector of allConnectors) {
      if (!["news", "blog"].includes(connector.meta.platform)) continue;
      if (connector.meta.method === "manual_import") continue;

      const key = `${connector.meta.platform}:${connector.meta.method}`;
      if (addedQueryTargets.has(key)) continue;
      addedQueryTargets.add(key);

      const target: FetchTarget = {
        scope: "public_keyword",
        platform: connector.meta.platform,
        connectorHint: connector.meta.method,
        query: brand.name,
        limit: 20,
      };
      targets.push(target);
    }


    console.log(`[REFRESH] Ditemukan ${targets.length} fetch target untuk brand "${brand.name}".`);

    for (const target of targets) {
      const connector = connectorForTarget(target);
      if (!connector) {
        console.warn(`[REFRESH] Tidak ada connector untuk platform=${target.platform}${target.connectorHint ? ` (${target.connectorHint})` : ""}. Lewati.`);
        continue;
      }
      console.log(`[REFRESH] Jalankan ${target.platform}${target.connectorHint ? `/${target.connectorHint}` : ""} dengan query="${target.handle ?? target.query}"`);

      const run = await prisma.crawlRun.create({
        data: {
          brandId: brand.id,
          refreshJobId: job.id,
          connector: target.platform,
          scope: target.scope,
          sourceAccountId: target.targetId,
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
        console.error(
          `[REFRESH] Target gagal: platform=${target.platform}, scope=${target.scope}, query="${target.handle ?? target.query}". Error:`,
          errorDetail
        );
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
