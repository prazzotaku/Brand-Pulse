import { prisma } from "@/lib/prisma";
import { getActiveBrand, toBrandContext } from "@/lib/brand";
import { getConnectors } from "@/lib/connectors/registry";
import { detectNegativeSpike, ingestMentions } from "@/lib/pipeline";
import type { FetchScope, FetchTarget, SourceConnector } from "@/lib/connectors/types";
import type { RawMention } from "@/lib/types";

export type RefreshTargetGroup = "social" | "news" | "blog";

export interface ScheduledRefreshResult {
  jobId: string;
  queuedRuns: number;
}

export interface ProcessCrawlRunResult {
  runId: string;
  refreshJobId: string;
  connector: string;
  status: string;
  fetched: number;
  inserted: number;
  updated: number;
  duplicates: number;
  analyzed: number;
  failedSourcesDelta: number;
  error?: string;
}

export interface ProcessQueueBatchResult {
  processed: number;
  skipped: number;
  totalElapsedMs: number;
  results: Array<{ runId: string; connector: string; status: string; inserted: number; fetched: number; error?: string }>;
}

const STALE_QUEUED_MS = 3 * 60 * 1000;
const STALE_RUNNING_MS = 10 * 60 * 1000;

// Batas waktu proses batch (dalam ms) sebelum berhenti agar tidak timeout.
const PROD_MAX_RUN_MS = 50_000;
const PROD_TIME_BUFFER_MS = 5_000;
const DEV_MAX_RUN_MS = 120_000;
const DEV_TIME_BUFFER_MS = 10_000;

// ==================================================================
// SECTION: Core Fetching & Target Building
// ==================================================================

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

function normalizeHandleOrUrl(input: string): string {
  return input.trim().replace(/^https?:\/\/(www\.)?[^/]+\//i, "").replace(/^@+/, "").replace(/\/+$/, "");
}

function normalizePublicQuery(input: string): string {
  return normalizeHandleOrUrl(input).replace(/\([^)]*\)/g, "").trim();
}

function hasTargetGroup(groups: RefreshTargetGroup[], group: RefreshTargetGroup): boolean {
  return groups.includes(group);
}

function scopeForPlatform(platform: string): FetchScope | null {
  if (["facebook", "instagram"].includes(platform)) return "owned_account";
  if (["x", "threads", "tiktok", "youtube"].includes(platform)) return "public_keyword";
  return null;
}

function buildTargetFromAccount(acc: { id: string; platform: string; handle: string; displayName: string }): FetchTarget | null {
  const scope = scopeForPlatform(acc.platform);
  if (!scope) return null;

  if (scope === "owned_account") {
    const handle = normalizeHandleOrUrl(acc.handle);
    if (!handle) return null;
    return { scope, platform: acc.platform, query: handle, handle, targetId: acc.id, limit: 30 };
  }

  const query = normalizePublicQuery(acc.displayName || acc.handle);
  if (!query) return null;
  return { scope, platform: acc.platform, query, handle: normalizeHandleOrUrl(acc.handle), targetId: acc.id, limit: 15 };
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

async function buildAllFetchTargets(brandId: string, brandName: string, targetGroups: RefreshTargetGroup[], refreshAll: boolean): Promise<FetchTarget[]> {
  const [sourceAccounts, allConnectors] = await Promise.all([
    prisma.sourceAccount.findMany({ where: { brandId, isActive: true } }),
    getConnectors()
  ]);

  const targets: FetchTarget[] = [];
  if (refreshAll || hasTargetGroup(targetGroups, "social")) {
    for (const acc of sourceAccounts) {
      const target = buildTargetFromAccount(acc);
      if (target) targets.push(target);
    }
  }

  const addedQueryTargets = new Set<string>();
  for (const connector of allConnectors) {
    if (!["news", "blog"].includes(connector.meta.platform)) continue;
    if (connector.meta.method === "manual_import") continue;

    const status = await connector.getConnectorStatus();
    if (status.status !== "active") continue;

    const isNewsTarget = connector.meta.platform === "news";
    const isBlogTarget = connector.meta.platform === "blog";
    const shouldInclude = refreshAll || (isNewsTarget && hasTargetGroup(targetGroups, "news")) || (isBlogTarget && hasTargetGroup(targetGroups, "blog"));
    if (!shouldInclude) continue;

    const key = `${connector.meta.platform}:${connector.meta.method}`;
    if (addedQueryTargets.has(key)) continue;
    addedQueryTargets.add(key);

    targets.push({ scope: "public_keyword", platform: connector.meta.platform, connectorHint: connector.meta.method, query: brandName, limit: 50 });
  }
  return targets;
}

// ==================================================================
// SECTION: Job & Run State Management
// ==================================================================

async function expireStaleJobs(brandId: string): Promise<void> {
  const now = new Date();
  const queuedCutoff = new Date(Date.now() - STALE_QUEUED_MS);
  const runningCutoff = new Date(Date.now() - STALE_RUNNING_MS);

  const staleJobs = await prisma.refreshJob.findMany({
    where: { brandId, OR: [{ status: "queued", createdAt: { lt: queuedCutoff } }, { status: "running", startedAt: { lt: runningCutoff } }] },
    select: { id: true, status: true },
  });

  for (const job of staleJobs) {
    await prisma.crawlRun.updateMany({
      where: { refreshJobId: job.id, status: { in: ["pending", "running"] } },
      data: { status: "error", finishedAt: now, error: `Expired stale ${job.status} run.` },
    });
    await prisma.refreshJob.update({
      where: { id: job.id },
      data: { status: "failed", finishedAt: now, error: `Expired stale ${job.status} job.` },
    });
  }
}

export async function scheduleRefreshJobs(input: {
  trigger: "manual" | "scheduled";
  interval?: string;
  targetGroups?: RefreshTargetGroup[];
}): Promise<ScheduledRefreshResult> {
  const brand = await getActiveBrand();
  await expireStaleJobs(brand.id);

  const existingActiveJob = await prisma.refreshJob.findFirst({
    where: { brandId: brand.id, status: { in: ["queued", "running"] } },
  });
  if (existingActiveJob) {
    return { jobId: existingActiveJob.id, queuedRuns: await prisma.crawlRun.count({ where: { refreshJobId: existingActiveJob.id, status: { in: ["pending", "running"] } } }) };
  }

  const targets = await buildAllFetchTargets(brand.id, brand.name, input.targetGroups ?? [], (input.targetGroups ?? []).length === 0);

  const job = await prisma.refreshJob.create({
    data: {
      brandId: brand.id,
      trigger: input.trigger,
      interval: input.trigger === "scheduled" ? input.interval ?? "" : "",
      status: targets.length > 0 ? "queued" : "success",
      ...(targets.length === 0 ? { startedAt: new Date(), finishedAt: new Date(), error: "Tidak ada target refresh yang valid." } : {}),
    },
  });

  if (targets.length > 0) {
    await prisma.crawlRun.createMany({
      data: targets.map((t) => ({
        brandId: brand.id,
        refreshJobId: job.id,
        connector: t.platform,
        connectorHint: t.connectorHint ?? "",
        query: t.query,
        handle: t.handle ?? "",
        limit: t.limit ?? 0,
        sourceAccountId: t.targetId,
        scope: t.scope,
        status: "pending",
      })),
    });
  }
  return { jobId: job.id, queuedRuns: targets.length };
}

async function finalizeRefreshJobIfDone(jobId: string): Promise<void> {
  const openRuns = await prisma.crawlRun.count({ where: { refreshJobId: jobId, status: { in: ["pending", "running"] } } });
  if (openRuns > 0) return;

  const [job, runs] = await Promise.all([
    prisma.refreshJob.findUnique({ where: { id: jobId } }),
    prisma.crawlRun.findMany({ where: { refreshJobId: jobId } }),
  ]);
  if (!job || job.status === 'success' || job.status === 'failed') return;

  const hasErrors = runs.some((r) => r.status !== 'success');
  const errorSummary = runs.filter(r => r.error).map(r => `${r.connector}: ${r.error}`).join(' | ');

  await prisma.refreshJob.update({
    where: { id: jobId },
    data: {
      status: hasErrors ? "failed" : "success",
      finishedAt: new Date(),
      error: errorSummary,
    },
  });

  await detectNegativeSpike(job.brandId);
}

// ==================================================================
// SECTION: Worker & Inline Processing
// ==================================================================

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
  if (refreshJob?.status === "queued") {
    await prisma.refreshJob.update({
      where: { id: refreshJob.id },
      data: { status: "running", startedAt: refreshJob.startedAt ?? new Date() },
    });
  }

  const brand = await prisma.brand.findUnique({ where: { id: run.brandId }, include: { keywords: true } });
  const target: FetchTarget = { scope: run.scope as FetchScope, platform: run.connector, connectorHint: run.connectorHint || undefined, query: run.query, handle: run.handle || undefined, targetId: run.sourceAccountId ?? undefined, limit: run.limit || undefined };

  let result: ProcessCrawlRunResult;
  try {
    if (!brand) throw new Error("Brand not found");
    const connector = connectorForTarget(target);
    if (!connector) throw new Error(`Connector not found for ${target.platform}`);

    const connStatus = await connector.getConnectorStatus();
    if (connStatus.status === 'pending_auth') throw new Error(connStatus.detail ?? 'Credentials required');

    const raws = await fetchWithRetry(connector, target);
    const ingest = await ingestMentions(brand.id, raws, toBrandContext(brand));

    await prisma.crawlRun.update({ where: { id: run.id }, data: { status: "success", finishedAt: new Date(), fetched: raws.length, inserted: ingest.inserted, updated: ingest.updated, duplicates: ingest.duplicates } });
    result = { runId: run.id, refreshJobId: run.refreshJobId, connector: run.connector, status: "success", fetched: raws.length, ...ingest, failedSourcesDelta: 0 };
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    await prisma.crawlRun.update({ where: { id: run.id }, data: { status: "error", finishedAt: new Date(), error: errorDetail } });
    result = { runId: run.id, refreshJobId: run.refreshJobId, connector: run.connector, status: "error", fetched: 0, inserted: 0, updated: 0, duplicates: 0, analyzed: 0, failedSourcesDelta: 1, error: errorDetail };
  }

  await prisma.refreshJob.update({
    where: { id: run.refreshJobId },
    data: {
      newMentions: { increment: result.inserted },
      updatedMentions: { increment: result.updated },
      duplicatesSkipped: { increment: result.duplicates },
      analyzedCount: { increment: result.analyzed },
      failedSources: { increment: result.failedSourcesDelta },
    },
  });
  await finalizeRefreshJobIfDone(run.refreshJobId);
  return result;
}

export async function processPendingRunsBatch(isDevInline = false): Promise<ProcessQueueBatchResult> {
  const maxRunMs = isDevInline ? DEV_MAX_RUN_MS : PROD_MAX_RUN_MS;
  const timeBufferMs = isDevInline ? DEV_TIME_BUFFER_MS : PROD_TIME_BUFFER_MS;
  const startTime = Date.now();
  const results: ProcessQueueBatchResult["results"] = [];
  let processed = 0, skipped = 0;

  while (Date.now() - startTime < maxRunMs - timeBufferMs) {
    const result = await processNextPendingRun();
    if (!result) break;
    processed++;
    results.push({ runId: result.runId, connector: result.connector, status: result.status, inserted: result.inserted, fetched: result.fetched, error: result.error });
    if (result.status === "rate_limited" && !isDevInline) {
      skipped++;
      break;
    }
  }
  return { processed, skipped, totalElapsedMs: Date.now() - startTime, results };
}

export async function processRefreshInlineIfEnabled(jobId: string, trigger: "manual" | "scheduled"): Promise<ProcessQueueBatchResult | null> {
  if (process.env.NODE_ENV !== "production" && trigger === "manual") {
    const batchResult = await processPendingRunsBatch(true);
    await finalizeRefreshJobIfDone(jobId);
    return batchResult;
  }
  return null;
}

// ==================================================================
// SECTION: UI-Facing Status Helpers
// ==================================================================

export async function getSafeLatestJob(brandId: string) {
  await expireStaleJobs(brandId);
  const latest = await prisma.refreshJob.findFirst({ where: { brandId }, orderBy: { createdAt: "desc" } });
  if (latest && ["queued", "running"].includes(latest.status)) {
    await finalizeRefreshJobIfDone(latest.id);
    return prisma.refreshJob.findUnique({ where: { id: latest.id } });
  }
  return latest;
}

export async function getSafeJobById(brandId: string, jobId: string) {
  await expireStaleJobs(brandId);
  const job = await prisma.refreshJob.findFirst({ where: { id: jobId, brandId } });
  if (job && ["queued", "running"].includes(job.status)) {
    await finalizeRefreshJobIfDone(job.id);
    return prisma.refreshJob.findUnique({ where: { id: job.id } });
  }
  return job;
}
