import { prisma } from "@/lib/prisma";
import { getActiveBrand, toBrandContext } from "@/lib/brand";
import { getConnectors } from "@/lib/connectors/registry";
import { detectNegativeSpike, ingestMentions, type IngestResult } from "@/lib/pipeline";
import type { FetchScope, FetchTarget, SourceConnector } from "@/lib/connectors/types";
import type { RawMention } from "@/lib/types";

export type RefreshTargetGroup = "social" | "news" | "blog";

export interface ScheduledRefreshResult {
  jobId: string;
  queuedRuns: number;
  trigger: "manual" | "scheduled";
}

export interface ProcessCrawlRunResult {
  runId: string;
  refreshJobId: string;
  status: string;
  fetched: number;
  inserted: number;
  updated: number;
  duplicates: number;
  analyzed: number;
  failedSourcesDelta: number;
  error?: string;
}

export async function fetchWithRetry(connector: SourceConnector, params: FetchTarget): Promise<RawMention[]> {
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

export function normalizeHandleOrUrl(input: string): string {
  return input.trim().replace(/^https?:\/\/(www\.)?[^/]+\//i, "").replace(/^@+/, "").replace(/\/+$/, "");
}

export function normalizePublicQuery(input: string): string {
  return normalizeHandleOrUrl(input).replace(/\([^)]*\)/g, "").trim();
}

export function hasTargetGroup(groups: RefreshTargetGroup[], group: RefreshTargetGroup): boolean {
  return groups.includes(group);
}

export function scopeForPlatform(platform: string): FetchScope | null {
  if (["facebook", "instagram"].includes(platform)) return "owned_account";
  if (["x", "threads", "tiktok", "youtube"].includes(platform)) return "public_keyword";
  return null;
}

export function buildTargetFromAccount(acc: {
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
      limit: 30,
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

export function connectorForTarget(target: FetchTarget): SourceConnector | null {
  return (
    getConnectors().find((c) => {
      if (c.meta.platform !== target.platform) return false;
      if (target.connectorHint) return c.meta.method === target.connectorHint;
      return true;
    }) ?? null
  );
}

export async function scheduleRefreshJobs(input: {
  trigger: "manual" | "scheduled";
  interval?: string;
  targetGroups?: RefreshTargetGroup[];
}): Promise<ScheduledRefreshResult> {
  const targetGroups = input.targetGroups ?? [];
  const refreshAll = targetGroups.length === 0;

  const brand = await getActiveBrand();
  const existingActiveJob = await prisma.refreshJob.findFirst({
    where: {
      brandId: brand.id,
      status: { in: ["queued", "running"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existingActiveJob) {
    return {
      jobId: existingActiveJob.id,
      queuedRuns: await prisma.crawlRun.count({ where: { refreshJobId: existingActiveJob.id, status: { in: ["pending", "running"] } } }),
      trigger: input.trigger,
    };
  }

  const sourceAccounts = await prisma.sourceAccount.findMany({ where: { brandId: brand.id, isActive: true } });

  const job = await prisma.refreshJob.create({
    data: {
      brandId: brand.id,
      trigger: input.trigger,
      interval: input.trigger === "scheduled" ? input.interval ?? "" : "",
      status: "queued",
    },
  });

  const targets: FetchTarget[] = [];

  if (refreshAll || hasTargetGroup(targetGroups, "social")) {
    for (const acc of sourceAccounts) {
      const target = buildTargetFromAccount(acc);
      if (!target) {
        console.warn(`[REFRESH] Lewati akun ${acc.platform}/${acc.handle}: target tidak valid atau platform belum didukung.`);
        continue;
      }
      targets.push(target);
    }
  }

  const allConnectors = getConnectors();
  const addedQueryTargets = new Set<string>();

  for (const connector of allConnectors) {
    if (!["news", "blog"].includes(connector.meta.platform)) continue;
    if (connector.meta.method === "manual_import") continue;

    const isNewsTarget = connector.meta.platform === "news";
    const isBlogTarget = connector.meta.platform === "blog";
    const shouldInclude = refreshAll
      || (isNewsTarget && hasTargetGroup(targetGroups, "news"))
      || (isBlogTarget && hasTargetGroup(targetGroups, "blog"));
    if (!shouldInclude) continue;

    const key = `${connector.meta.platform}:${connector.meta.method}`;
    if (addedQueryTargets.has(key)) continue;
    addedQueryTargets.add(key);

    targets.push({
      scope: "public_keyword",
      platform: connector.meta.platform,
      connectorHint: connector.meta.method,
      query: brand.name,
      limit: 50,
    });
  }

  if (targets.length === 0) {
    await prisma.refreshJob.update({
      where: { id: job.id },
      data: {
        status: "success",
        startedAt: new Date(),
        finishedAt: new Date(),
        error: "Tidak ada target refresh yang valid.",
      },
    });
    return { jobId: job.id, queuedRuns: 0, trigger: input.trigger };
  }

  await prisma.crawlRun.createMany({
    data: targets.map((target) => ({
      brandId: brand.id,
      refreshJobId: job.id,
      connector: target.platform,
      connectorHint: target.connectorHint ?? "",
      query: target.query,
      handle: target.handle ?? "",
      limit: target.limit ?? 0,
      sourceAccountId: target.targetId,
      scope: target.scope,
      status: "pending",
    })),
  });

  return { jobId: job.id, queuedRuns: targets.length, trigger: input.trigger };
}

export async function processNextPendingRun(): Promise<ProcessCrawlRunResult | null> {
  const pendingRun = await prisma.crawlRun.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  if (!pendingRun) return null;

  const run = await prisma.crawlRun.update({
    where: { id: pendingRun.id },
    data: { status: "running", startedAt: new Date(), processedAt: new Date() },
  });

  const refreshJob = await prisma.refreshJob.findUnique({ where: { id: run.refreshJobId } });
  const brand = await prisma.brand.findUnique({
    where: { id: run.brandId },
    include: { keywords: true },
  });

  if (!refreshJob || !brand) {
    const error = !refreshJob ? "RefreshJob tidak ditemukan." : "Brand tidak ditemukan.";
    await prisma.crawlRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), error },
    });
    return {
      runId: run.id,
      refreshJobId: run.refreshJobId,
      status: "error",
      fetched: 0,
      inserted: 0,
      updated: 0,
      duplicates: 0,
      analyzed: 0,
      failedSourcesDelta: 1,
      error,
    };
  }

  if (refreshJob.status === "queued") {
    await prisma.refreshJob.update({
      where: { id: refreshJob.id },
      data: { status: "running", startedAt: refreshJob.startedAt ?? new Date() },
    });
  }

  const target: FetchTarget = {
    scope: run.scope as FetchScope,
    platform: run.connector,
    connectorHint: run.connectorHint || undefined,
    query: run.query,
    handle: run.handle || undefined,
    targetId: run.sourceAccountId ?? undefined,
    limit: run.limit || undefined,
  };

  const connector = connectorForTarget(target);
  if (!connector) {
    const error = `Connector tidak ditemukan untuk ${run.connector}${run.connectorHint ? `/${run.connectorHint}` : ""}.`;
    await prisma.crawlRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), error },
    });
    await applyRunResultToRefreshJob(run.refreshJobId, {
      runId: run.id,
      refreshJobId: run.refreshJobId,
      status: "error",
      fetched: 0,
      inserted: 0,
      updated: 0,
      duplicates: 0,
      analyzed: 0,
      failedSourcesDelta: 1,
      error,
    });
    return {
      runId: run.id,
      refreshJobId: run.refreshJobId,
      status: "error",
      fetched: 0,
      inserted: 0,
      updated: 0,
      duplicates: 0,
      analyzed: 0,
      failedSourcesDelta: 1,
      error,
    };
  }

  try {
    const status = await connector.getConnectorStatus();
    if (status.status === "pending_auth") {
      const result: ProcessCrawlRunResult = {
        runId: run.id,
        refreshJobId: run.refreshJobId,
        status: "pending_auth",
        fetched: 0,
        inserted: 0,
        updated: 0,
        duplicates: 0,
        analyzed: 0,
        failedSourcesDelta: 1,
        error: status.detail ?? "",
      };
      await prisma.crawlRun.update({
        where: { id: run.id },
        data: { status: "pending_auth", finishedAt: new Date(), error: result.error ?? "" },
      });
      await applyRunResultToRefreshJob(run.refreshJobId, result);
      return result;
    }

    const raws = await fetchWithRetry(connector, target);
    const brandCtx = toBrandContext(brand);
    const ingest = await ingestMentions(brand.id, raws, brandCtx);

    await prisma.crawlRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        fetched: raws.length,
        inserted: ingest.inserted,
        updated: ingest.updated,
        duplicates: ingest.duplicates,
      },
    });

    const result: ProcessCrawlRunResult = {
      runId: run.id,
      refreshJobId: run.refreshJobId,
      status: "success",
      fetched: raws.length,
      inserted: ingest.inserted,
      updated: ingest.updated,
      duplicates: ingest.duplicates,
      analyzed: ingest.analyzed,
      failedSourcesDelta: 0,
    };
    await applyRunResultToRefreshJob(run.refreshJobId, result);
    return result;
  } catch (err) {
    const classified = connector.handleError(err);
    const errorDetail = classified.detail ?? String(err);
    await prisma.crawlRun.update({
      where: { id: run.id },
      data: { status: classified.status, finishedAt: new Date(), error: errorDetail },
    });
    if (classified.status === "rate_limited") {
      await prisma.rateLimitLog.create({
        data: { platform: run.connector, note: errorDetail },
      });
    }
    const result: ProcessCrawlRunResult = {
      runId: run.id,
      refreshJobId: run.refreshJobId,
      status: classified.status,
      fetched: 0,
      inserted: 0,
      updated: 0,
      duplicates: 0,
      analyzed: 0,
      failedSourcesDelta: 1,
      error: errorDetail,
    };
    await applyRunResultToRefreshJob(run.refreshJobId, result);
    return result;
  }
}

export async function applyRunResultToRefreshJob(refreshJobId: string, result: ProcessCrawlRunResult): Promise<void> {
  await prisma.refreshJob.update({
    where: { id: refreshJobId },
    data: {
      newMentions: { increment: result.inserted },
      updatedMentions: { increment: result.updated },
      duplicatesSkipped: { increment: result.duplicates },
      analyzedCount: { increment: result.analyzed },
      failedSources: { increment: result.failedSourcesDelta },
      error: result.error ? { set: await appendRefreshJobError(refreshJobId, result.error) } : undefined,
    },
  });

  await finalizeRefreshJobIfDone(refreshJobId);
}

async function appendRefreshJobError(refreshJobId: string, error: string): Promise<string> {
  const job = await prisma.refreshJob.findUnique({ where: { id: refreshJobId }, select: { error: true } });
  const current = job?.error?.trim();
  if (!current) return error;
  if (current.includes(error)) return current;
  return `${current} | ${error}`;
}

export async function finalizeRefreshJobIfDone(refreshJobId: string): Promise<void> {
  const [job, runs] = await Promise.all([
    prisma.refreshJob.findUnique({ where: { id: refreshJobId } }),
    prisma.crawlRun.findMany({ where: { refreshJobId } }),
  ]);
  if (!job) return;
  if (runs.length === 0) {
    if (job.status === "queued") {
      await prisma.refreshJob.update({
        where: { id: refreshJobId },
        data: { status: "success", startedAt: job.startedAt ?? new Date(), finishedAt: new Date() },
      });
    }
    return;
  }

  const stillOpen = runs.some((r) => ["pending", "running"].includes(r.status));
  if (stillOpen) return;

  const hasFatal = runs.some((r) => ["error", "rate_limited", "pending_auth"].includes(r.status));
  await prisma.refreshJob.update({
    where: { id: refreshJobId },
    data: {
      status: hasFatal ? "failed" : "success",
      startedAt: job.startedAt ?? job.createdAt,
      finishedAt: new Date(),
    },
  });

  await detectNegativeSpike(job.brandId);
}
