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

export interface ProcessQueueBatchResult {
  processed: number;
  skipped: number;
  totalElapsedMs: number;
  results: Array<{
    runId: string;
    status: string;
    inserted: number;
    fetched: number;
  }>;
}

const DEV_MAX_RUN_MS = 50_000;
const DEV_TIME_BUFFER_MS = 5_000;

export async function processPendingRunsBatch(maxRunMs = DEV_MAX_RUN_MS, timeBufferMs = DEV_TIME_BUFFER_MS): Promise<ProcessQueueBatchResult> {
  const startTime = Date.now();
  const results: ProcessQueueBatchResult["results"] = [];
  let processed = 0;
  let skipped = 0;

  while (true) {
    const elapsed = Date.now() - startTime;
    const remaining = maxRunMs - elapsed;
    if (remaining < timeBufferMs) break;

    const result = await processNextPendingRun();
    if (!result) break;

    processed++;
    results.push({
      runId: result.runId,
      status: result.status,
      inserted: result.inserted,
      fetched: result.fetched,
    });

    if (result.status === "rate_limited") {
      skipped++;
      break;
    }
  }

  return {
    processed,
    skipped,
    totalElapsedMs: Date.now() - startTime,
    results,
  };
}

export function isLocalInlineRefreshEnabled(trigger: "manual" | "scheduled"): boolean {
  return process.env.NODE_ENV !== "production" && trigger === "manual";
}

export async function getRefreshJobStatus(jobId: string): Promise<{ status: string; finishedAt: Date | null; newMentions: number; updatedMentions: number; duplicatesSkipped: number; failedSources: number; error: string; } | null> {
  const job = await prisma.refreshJob.findUnique({
    where: { id: jobId },
    select: {
      status: true,
      finishedAt: true,
      newMentions: true,
      updatedMentions: true,
      duplicatesSkipped: true,
      failedSources: true,
      error: true,
    },
  });
  return job;
}

export async function ensureRefreshJobSettled(jobId: string): Promise<void> {
  await finalizeRefreshJobIfDone(jobId);
}

export async function failRefreshJob(jobId: string, error: string): Promise<void> {
  await prisma.refreshJob.update({
    where: { id: jobId },
    data: {
      status: "failed",
      finishedAt: new Date(),
      error,
    },
  });
}

export async function countPendingRunsForJob(jobId: string): Promise<number> {
  return prisma.crawlRun.count({
    where: {
      refreshJobId: jobId,
      status: { in: ["pending", "running"] },
    },
  });
}

export async function getJobConnectorStatuses(jobId: string): Promise<Array<{ connector: string; status: string; error: string; fetched: number; inserted: number; updated: number; duplicates: number; }>> {
  return prisma.crawlRun.findMany({
    where: { refreshJobId: jobId },
    orderBy: { createdAt: "asc" },
    select: {
      connector: true,
      status: true,
      error: true,
      fetched: true,
      inserted: true,
      updated: true,
      duplicates: true,
    },
  });
}

export function summarizeConnectorFailures(rows: Array<{ connector: string; status: string; error: string }>): string {
  return rows
    .filter((row) => ["error", "pending_auth", "rate_limited"].includes(row.status))
    .map((row) => `${row.connector}: ${row.error || row.status}`)
    .join(" | ");
}

export async function reconcileRefreshJob(jobId: string): Promise<void> {
  const [job, pendingCount, statuses] = await Promise.all([
    getRefreshJobStatus(jobId),
    countPendingRunsForJob(jobId),
    getJobConnectorStatuses(jobId),
  ]);
  if (!job) return;
  if (pendingCount > 0) return;
  const failureSummary = summarizeConnectorFailures(statuses.map((s) => ({ connector: s.connector, status: s.status, error: s.error })));
  await prisma.refreshJob.update({
    where: { id: jobId },
    data: {
      status: statuses.some((s) => ["error", "pending_auth", "rate_limited"].includes(s.status)) ? "failed" : "success",
      finishedAt: new Date(),
      error: failureSummary || job.error,
    },
  });
}

export async function expireAndReconcileStaleJobs(brandId: string): Promise<void> {
  await expireStaleRefreshJobs(brandId);
}

export async function processRefreshInlineIfEnabled(jobId: string, trigger: "manual" | "scheduled"): Promise<ProcessQueueBatchResult | null> {
  if (!isLocalInlineRefreshEnabled(trigger)) return null;
  const batch = await processPendingRunsBatch();
  await reconcileRefreshJob(jobId);
  return batch;
}

export async function loadLatestJobForBrand(brandId: string) {
  return prisma.refreshJob.findFirst({
    where: { brandId },
    orderBy: { createdAt: "desc" },
  });
}

export async function loadRefreshJobForBrand(jobId: string, brandId: string) {
  return prisma.refreshJob.findFirst({
    where: { id: jobId, brandId },
  });
}

export async function countAllOpenRuns(): Promise<number> {
  return prisma.crawlRun.count({ where: { status: { in: ["pending", "running"] } } });
}

export async function listOpenRuns(jobId?: string) {
  return prisma.crawlRun.findMany({
    where: {
      status: { in: ["pending", "running"] },
      ...(jobId ? { refreshJobId: jobId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function touchRefreshJobRunning(jobId: string): Promise<void> {
  await prisma.refreshJob.update({
    where: { id: jobId },
    data: {
      status: "running",
      startedAt: new Date(),
    },
  });
}

export async function touchRefreshJobFinished(jobId: string, status: "success" | "failed", error = ""): Promise<void> {
  await prisma.refreshJob.update({
    where: { id: jobId },
    data: {
      status,
      finishedAt: new Date(),
      error,
    },
  });
}

export async function getBrandAndTargetsForRefresh() {
  const brand = await getActiveBrand();
  const sourceAccounts = await prisma.sourceAccount.findMany({ where: { brandId: brand.id, isActive: true } });
  return { brand, sourceAccounts };
}

export async function getBrandByIdWithKeywords(brandId: string) {
  return prisma.brand.findUnique({
    where: { id: brandId },
    include: { keywords: true },
  });
}

export async function getRefreshJobById(jobId: string) {
  return prisma.refreshJob.findUnique({ where: { id: jobId } });
}

export async function getPendingRun() {
  return prisma.crawlRun.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });
}

export async function markRunRunning(runId: string) {
  return prisma.crawlRun.update({
    where: { id: runId },
    data: { status: "running", startedAt: new Date(), processedAt: new Date() },
  });
}

export async function markRunFinished(runId: string, data: { status: string; finishedAt?: Date; fetched?: number; inserted?: number; updated?: number; duplicates?: number; error?: string; }) {
  return prisma.crawlRun.update({
    where: { id: runId },
    data: {
      ...data,
      finishedAt: data.finishedAt ?? new Date(),
    },
  });
}

export async function appendRateLimitLog(platform: string, note: string) {
  return prisma.rateLimitLog.create({ data: { platform, note } });
}

export async function createRefreshJob(data: { brandId: string; trigger: string; interval: string; status: string; }) {
  return prisma.refreshJob.create({ data });
}

export async function createRunsFromTargets(brandId: string, refreshJobId: string, targets: FetchTarget[]) {
  return prisma.crawlRun.createMany({
    data: targets.map((target) => ({
      brandId,
      refreshJobId,
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
}

export async function updateRefreshJobNoTargets(jobId: string) {
  return prisma.refreshJob.update({
    where: { id: jobId },
    data: {
      status: "success",
      startedAt: new Date(),
      finishedAt: new Date(),
      error: "Tidak ada target refresh yang valid.",
    },
  });
}

export async function findLatestActiveJob(brandId: string) {
  return prisma.refreshJob.findFirst({
    where: {
      brandId,
      status: { in: ["queued", "running"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function countOpenRunsForJob(jobId: string) {
  return prisma.crawlRun.count({ where: { refreshJobId: jobId, status: { in: ["pending", "running"] } } });
}

export async function updateRefreshJobStatus(jobId: string, data: Record<string, any>) {
  return prisma.refreshJob.update({ where: { id: jobId }, data });
}

export async function updateRunStatus(runId: string, data: Record<string, any>) {
  return prisma.crawlRun.update({ where: { id: runId }, data });
}

export async function findRunsByJob(jobId: string) {
  return prisma.crawlRun.findMany({ where: { refreshJobId: jobId } });
}

export async function countStaleRunningRuns(cutoff: Date) {
  return prisma.crawlRun.count({ where: { status: "running", startedAt: { lt: cutoff } } });
}

export async function expireStaleRunningRuns(cutoff: Date) {
  return prisma.crawlRun.updateMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    data: {
      status: "error",
      finishedAt: new Date(),
      error: "Expired stale running crawl; aman dijalankan ulang.",
    },
  });
}

export async function listJobsByBrand(brandId: string) {
  return prisma.refreshJob.findMany({ where: { brandId }, orderBy: { createdAt: "desc" } });
}

export async function listRunsByBrand(brandId: string) {
  return prisma.crawlRun.findMany({ where: { brandId }, orderBy: { createdAt: "desc" } });
}

export async function getOpenRunsByBrand(brandId: string) {
  return prisma.crawlRun.findMany({
    where: { brandId, status: { in: ["pending", "running"] } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getLatestJobIdByBrand(brandId: string) {
  const job = await prisma.refreshJob.findFirst({
    where: { brandId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return job?.id ?? null;
}

export async function getRunsForLatestJob(brandId: string) {
  const jobId = await getLatestJobIdByBrand(brandId);
  if (!jobId) return [];
  return prisma.crawlRun.findMany({ where: { refreshJobId: jobId }, orderBy: { createdAt: "asc" } });
}

export async function getActiveBrandId() {
  const brand = await getActiveBrand();
  return brand.id;
}

export async function getSourceAccountsForBrand(brandId: string) {
  return prisma.sourceAccount.findMany({ where: { brandId, isActive: true } });
}

export async function getNewsConnectorTargets(brandName: string) {
  const allConnectors = getConnectors();
  const addedQueryTargets = new Set<string>();
  const targets: FetchTarget[] = [];
  for (const connector of allConnectors) {
    if (!["news", "blog"].includes(connector.meta.platform)) continue;
    if (connector.meta.method === "manual_import") continue;
    const key = `${connector.meta.platform}:${connector.meta.method}`;
    if (addedQueryTargets.has(key)) continue;
    addedQueryTargets.add(key);
    targets.push({
      scope: "public_keyword",
      platform: connector.meta.platform,
      connectorHint: connector.meta.method,
      query: brandName,
      limit: 50,
    });
  }
  return targets;
}

export async function getBrandContextById(brandId: string) {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, include: { keywords: true } });
  return brand ? toBrandContext(brand) : null;
}

export async function ingestForBrand(brandId: string, raws: RawMention[]) {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, include: { keywords: true } });
  if (!brand) throw new Error("Brand tidak ditemukan.");
  const brandCtx = toBrandContext(brand);
  return ingestMentions(brandId, raws, brandCtx);
}

export async function runNegativeSpikeDetection(brandId: string) {
  return detectNegativeSpike(brandId);
}

export async function getConnectorStatusForTarget(target: FetchTarget) {
  const connector = connectorForTarget(target);
  if (!connector) return null;
  return connector.getConnectorStatus();
}

export async function fetchTargetMentions(target: FetchTarget) {
  const connector = connectorForTarget(target);
  if (!connector) throw new Error(`Connector tidak ditemukan untuk ${target.platform}`);
  return fetchWithRetry(connector, target);
}

export async function getConnectorForTarget(target: FetchTarget) {
  return connectorForTarget(target);
}

export async function listConnectorDirectory() {
  return getConnectors().map((c) => c.meta);
}

export async function isEnsembleEnabled() {
  return Boolean(process.env.ENSEMBLEDATA_TOKEN);
}

export async function getOpenRunCountForBrand(brandId: string) {
  return prisma.crawlRun.count({ where: { brandId, status: { in: ["pending", "running"] } } });
}

export async function getJobStatusSnapshot(jobId: string) {
  const [job, runs] = await Promise.all([
    prisma.refreshJob.findUnique({ where: { id: jobId } }),
    prisma.crawlRun.findMany({ where: { refreshJobId: jobId } }),
  ]);
  return { job, runs };
}

export async function getOpenRunsSnapshot() {
  return prisma.crawlRun.findMany({ where: { status: { in: ["pending", "running"] } }, orderBy: { createdAt: "asc" } });
}

export async function forceFailJobAndRuns(jobId: string, reason: string) {
  await prisma.crawlRun.updateMany({
    where: { refreshJobId: jobId, status: { in: ["pending", "running"] } },
    data: { status: "error", finishedAt: new Date(), error: reason },
  });
  await prisma.refreshJob.update({
    where: { id: jobId },
    data: { status: "failed", finishedAt: new Date(), error: reason },
  });
}

export async function getRefreshSummary(jobId: string) {
  const job = await prisma.refreshJob.findUnique({ where: { id: jobId } });
  const runs = await prisma.crawlRun.findMany({ where: { refreshJobId: jobId } });
  return { job, runs };
}

export async function getLatestOpenJob(brandId: string) {
  return prisma.refreshJob.findFirst({
    where: { brandId, status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingRunCount() {
  return prisma.crawlRun.count({ where: { status: "pending" } });
}

export async function getRunningRunCount() {
  return prisma.crawlRun.count({ where: { status: "running" } });
}

export async function getOpenJobCount(brandId: string) {
  return prisma.refreshJob.count({ where: { brandId, status: { in: ["queued", "running"] } } });
}

export async function getLatestFinishedJob(brandId: string) {
  return prisma.refreshJob.findFirst({
    where: { brandId, status: { in: ["success", "failed"] } },
    orderBy: { finishedAt: "desc" },
  });
}

export async function getLatestFinishedRuns(brandId: string) {
  return prisma.crawlRun.findMany({
    where: { brandId, status: { in: ["success", "error", "pending_auth", "rate_limited"] } },
    orderBy: { finishedAt: "desc" },
    take: 20,
  });
}

export async function getLatestRefreshJobById(jobId: string) {
  return prisma.refreshJob.findUnique({ where: { id: jobId } });
}

export async function markPendingRunsForJobError(jobId: string, message: string) {
  return prisma.crawlRun.updateMany({
    where: { refreshJobId: jobId, status: { in: ["pending", "running"] } },
    data: { status: "error", finishedAt: new Date(), error: message },
  });
}

export async function closeRefreshJob(jobId: string, status: "success" | "failed", error = "") {
  return prisma.refreshJob.update({
    where: { id: jobId },
    data: { status, finishedAt: new Date(), error },
  });
}

export async function getLatestRefreshJobs(brandId: string, take = 10) {
  return prisma.refreshJob.findMany({ where: { brandId }, orderBy: { createdAt: "desc" }, take });
}

export async function getLatestCrawlRuns(brandId: string, take = 40) {
  return prisma.crawlRun.findMany({ where: { brandId }, orderBy: { createdAt: "desc" }, take });
}

export async function getOpenJobIds(brandId: string) {
  const jobs = await prisma.refreshJob.findMany({
    where: { brandId, status: { in: ["queued", "running"] } },
    select: { id: true },
  });
  return jobs.map((j) => j.id);
}

export async function getRunsByJobIds(jobIds: string[]) {
  return prisma.crawlRun.findMany({
    where: { refreshJobId: { in: jobIds } },
    orderBy: { createdAt: "asc" },
  });
}

export async function normalizeOpenStateForBrand(brandId: string) {
  await expireStaleRefreshJobs(brandId);
  const openJobIds = await getOpenJobIds(brandId);
  for (const jobId of openJobIds) {
    await reconcileRefreshJob(jobId);
  }
}

export async function getPendingRunsForBrand(brandId: string) {
  return prisma.crawlRun.findMany({
    where: { brandId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
}

export async function getRunningRunsForBrand(brandId: string) {
  return prisma.crawlRun.findMany({
    where: { brandId, status: "running" },
    orderBy: { createdAt: "asc" },
  });
}

export async function getRefreshJobCount(brandId: string) {
  return prisma.refreshJob.count({ where: { brandId } });
}

export async function getCrawlRunCount(brandId: string) {
  return prisma.crawlRun.count({ where: { brandId } });
}

export async function getPendingOrRunningCounts(brandId: string) {
  const [pendingRuns, runningRuns, openJobs] = await Promise.all([
    prisma.crawlRun.count({ where: { brandId, status: "pending" } }),
    prisma.crawlRun.count({ where: { brandId, status: "running" } }),
    prisma.refreshJob.count({ where: { brandId, status: { in: ["queued", "running"] } } }),
  ]);
  return { pendingRuns, runningRuns, openJobs };
}

export async function getLatestJobWithRuns(brandId: string) {
  const job = await prisma.refreshJob.findFirst({ where: { brandId }, orderBy: { createdAt: "desc" } });
  if (!job) return null;
  const runs = await prisma.crawlRun.findMany({ where: { refreshJobId: job.id }, orderBy: { createdAt: "asc" } });
  return { job, runs };
}

export async function forceResetAllJobsForBrand(brandId: string, reason: string) {
  await prisma.crawlRun.updateMany({
    where: { brandId, status: { in: ["pending", "running"] } },
    data: { status: "error", finishedAt: new Date(), error: reason },
  });
  await prisma.refreshJob.updateMany({
    where: { brandId, status: { in: ["queued", "running"] } },
    data: { status: "failed", finishedAt: new Date(), error: reason },
  });
}

export async function getLatestRefreshOverview(brandId: string) {
  const latestJob = await prisma.refreshJob.findFirst({ where: { brandId }, orderBy: { createdAt: "desc" } });
  if (!latestJob) return null;
  const runStats = await prisma.crawlRun.findMany({ where: { refreshJobId: latestJob.id }, orderBy: { createdAt: "asc" } });
  return { latestJob, runStats };
}

export async function hydrateRefreshState(brandId: string) {
  await normalizeOpenStateForBrand(brandId);
  return getLatestRefreshOverview(brandId);
}

export async function getBrandRefreshState() {
  const brand = await getActiveBrand();
  return hydrateRefreshState(brand.id);
}

export async function getRefreshQueueState() {
  const brand = await getActiveBrand();
  const [overview, counts] = await Promise.all([
    hydrateRefreshState(brand.id),
    getPendingOrRunningCounts(brand.id),
  ]);
  return { overview, counts };
}

export async function preflightRefreshState() {
  const brand = await getActiveBrand();
  await normalizeOpenStateForBrand(brand.id);
  return brand;
}

export async function prepareRefreshAndMaybeInline(input: { trigger: "manual" | "scheduled"; interval?: string; targetGroups?: RefreshTargetGroup[]; }) {
  const scheduled = await scheduleRefreshJobs(input);
  const inline = await processRefreshInlineIfEnabled(scheduled.jobId, input.trigger);
  return { scheduled, inline };
}

export async function getJobStateForUi(jobId: string) {
  const job = await getRefreshJobById(jobId);
  if (!job) return null;
  await reconcileRefreshJob(jobId);
  return getRefreshJobById(jobId);
}

export async function cleanupAndPrepareBrand() {
  const brand = await getActiveBrand();
  await normalizeOpenStateForBrand(brand.id);
  return brand;
}

export async function getSafeLatestJob(brandId: string) {
  await normalizeOpenStateForBrand(brandId);
  return prisma.refreshJob.findFirst({ where: { brandId }, orderBy: { createdAt: "desc" } });
}

export async function getSafeJobById(brandId: string, jobId: string) {
  await normalizeOpenStateForBrand(brandId);
  return prisma.refreshJob.findFirst({ where: { brandId, id: jobId } });
}

export async function isJobFinished(jobId: string) {
  const job = await prisma.refreshJob.findUnique({ where: { id: jobId }, select: { status: true } });
  return job ? ["success", "failed"].includes(job.status) : false;
}

export async function getOpenRunCountForJob(jobId: string) {
  return prisma.crawlRun.count({ where: { refreshJobId: jobId, status: { in: ["pending", "running"] } } });
}

export async function reconcileJobIfPossible(jobId: string) {
  const open = await getOpenRunCountForJob(jobId);
  if (open === 0) {
    await reconcileRefreshJob(jobId);
  }
}

export async function maybeFinalizeLatestJob(brandId: string) {
  const latest = await prisma.refreshJob.findFirst({ where: { brandId }, orderBy: { createdAt: "desc" } });
  if (!latest) return null;
  await reconcileJobIfPossible(latest.id);
  return prisma.refreshJob.findUnique({ where: { id: latest.id } });
}

export async function getRefreshHealthSnapshot(brandId: string) {
  const [jobs, runs] = await Promise.all([
    prisma.refreshJob.findMany({ where: { brandId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.crawlRun.findMany({ where: { brandId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return { jobs, runs };
}

export async function repairRefreshState(brandId: string) {
  await normalizeOpenStateForBrand(brandId);
  return getRefreshHealthSnapshot(brandId);
}

export async function sweepAndSchedule(input: { trigger: "manual" | "scheduled"; interval?: string; targetGroups?: RefreshTargetGroup[]; }) {
  const brand = await getActiveBrand();
  await normalizeOpenStateForBrand(brand.id);
  return scheduleRefreshJobs(input);
}

export async function sweepScheduleAndInline(input: { trigger: "manual" | "scheduled"; interval?: string; targetGroups?: RefreshTargetGroup[]; }) {
  const brand = await getActiveBrand();
  await normalizeOpenStateForBrand(brand.id);
  const scheduled = await scheduleRefreshJobs(input);
  const inline = await processRefreshInlineIfEnabled(scheduled.jobId, input.trigger);
  return { scheduled, inline };
}

export async function listPendingRuns() {
  return prisma.crawlRun.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" } });
}

export async function listRunningRuns() {
  return prisma.crawlRun.findMany({ where: { status: "running" }, orderBy: { createdAt: "asc" } });
}

export async function getPendingAndRunningRuns() {
  return prisma.crawlRun.findMany({ where: { status: { in: ["pending", "running"] } }, orderBy: { createdAt: "asc" } });
}

export async function countPendingAndRunningRuns() {
  return prisma.crawlRun.count({ where: { status: { in: ["pending", "running"] } } });
}

export async function getLatestOpenOrFinishedJob(brandId: string) {
  return prisma.refreshJob.findFirst({ where: { brandId }, orderBy: { createdAt: "desc" } });
}

export async function runInlineAndReturnState(jobId: string, trigger: "manual" | "scheduled") {
  const inline = await processRefreshInlineIfEnabled(jobId, trigger);
  const job = await getRefreshJobById(jobId);
  return { inline, job };
}

export async function scheduleAndRunForLocal(input: { trigger: "manual" | "scheduled"; interval?: string; targetGroups?: RefreshTargetGroup[]; }) {
  const scheduled = await scheduleRefreshJobs(input);
  const inline = await processRefreshInlineIfEnabled(scheduled.jobId, input.trigger);
  const job = await getRefreshJobById(scheduled.jobId);
  return { scheduled, inline, job };
}

export async function getLatestRefreshDebugState() {
  const brand = await getActiveBrand();
  return getRefreshHealthSnapshot(brand.id);
}

export async function getLatestRefreshUiState() {
  const brand = await getActiveBrand();
  const job = await getSafeLatestJob(brand.id);
  return { brandId: brand.id, job };
}

export async function resolveRefreshStatusForUi(jobId?: string) {
  const brand = await getActiveBrand();
  if (jobId) {
    return getSafeJobById(brand.id, jobId);
  }
  return getSafeLatestJob(brand.id);
}

export async function getCurrentQueueSnapshot() {
  const brand = await getActiveBrand();
  const [latest, openRuns] = await Promise.all([
    getSafeLatestJob(brand.id),
    getOpenRunsByBrand(brand.id),
  ]);
  return { latest, openRuns };
}

export async function runSinglePendingAndReconcile() {
  const result = await processNextPendingRun();
  if (result) {
    await reconcileRefreshJob(result.refreshJobId);
  }
  return result;
}

export async function runBatchAndReconcile() {
  const batch = await processPendingRunsBatch();
  const open = await getPendingAndRunningRuns();
  const affectedJobIds = [...new Set(batch.results.map((r) => r.runId))];
  if (open.length === 0) {
    const brand = await getActiveBrand();
    await normalizeOpenStateForBrand(brand.id);
  }
  return { batch, openCount: open.length, affectedJobIds };
}

export async function getLatestBrandId() {
  const brand = await getActiveBrand();
  return brand.id;
}

export async function getLatestBrandName() {
  const brand = await getActiveBrand();
  return brand.name;
}

export async function getLatestBrandWithKeywords() {
  return getActiveBrand();
}

export async function getRefreshReadyState() {
  const brand = await getActiveBrand();
  await normalizeOpenStateForBrand(brand.id);
  const latest = await prisma.refreshJob.findFirst({ where: { brandId: brand.id }, orderBy: { createdAt: "desc" } });
  return latest;
}

export async function getOpenCountsForLatestBrand() {
  const brand = await getActiveBrand();
  return getPendingOrRunningCounts(brand.id);
}

export async function debugLatestRuns() {
  const brand = await getActiveBrand();
  return prisma.crawlRun.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: "desc" }, take: 20 });
}

export async function debugLatestJobs() {
  const brand = await getActiveBrand();
  return prisma.refreshJob.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: "desc" }, take: 10 });
}

export async function getInlineRefreshState(jobId: string) {
  const [job, runs] = await Promise.all([
    prisma.refreshJob.findUnique({ where: { id: jobId } }),
    prisma.crawlRun.findMany({ where: { refreshJobId: jobId }, orderBy: { createdAt: "asc" } }),
  ]);
  return { job, runs };
}

export async function hasAnyPendingRuns() {
  const count = await prisma.crawlRun.count({ where: { status: "pending" } });
  return count > 0;
}

export async function hasAnyOpenJobs(brandId: string) {
  const count = await prisma.refreshJob.count({ where: { brandId, status: { in: ["queued", "running"] } } });
  return count > 0;
}

export async function getSchedulerState() {
  const brand = await getActiveBrand();
  return {
    brand,
    openJobs: await hasAnyOpenJobs(brand.id),
    pendingRuns: await hasAnyPendingRuns(),
  };
}

export async function listStaleCandidates(brandId: string) {
  const queuedCutoff = new Date(Date.now() - STALE_QUEUED_MS);
  const runningCutoff = new Date(Date.now() - STALE_RUNNING_MS);
  return prisma.refreshJob.findMany({
    where: {
      brandId,
      OR: [
        { status: "queued", createdAt: { lt: queuedCutoff } },
        { status: "running", startedAt: { lt: runningCutoff } },
      ],
    },
  });
}

export async function listStaleRunningRuns() {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  return prisma.crawlRun.findMany({ where: { status: "running", startedAt: { lt: cutoff } } });
}

export async function isLatestJobStuck(brandId: string) {
  const latest = await prisma.refreshJob.findFirst({ where: { brandId }, orderBy: { createdAt: "desc" } });
  if (!latest) return false;
  return ["queued", "running"].includes(latest.status);
}

export async function fixIfLatestJobStuck(brandId: string) {
  const stuck = await isLatestJobStuck(brandId);
  if (stuck) {
    await normalizeOpenStateForBrand(brandId);
  }
  return getLatestRefreshOverview(brandId);
}

export async function createInlineRefreshSummary(jobId: string) {
  const snapshot = await getInlineRefreshState(jobId);
  return {
    jobId,
    jobStatus: snapshot.job?.status ?? null,
    runs: snapshot.runs.map((r) => ({
      connector: r.connector,
      status: r.status,
      error: r.error,
      fetched: r.fetched,
      inserted: r.inserted,
    })),
  };
}

export async function getConnectorRuntimeSummary() {
  return getConnectors().map((c) => ({
    platform: c.meta.platform,
    label: c.meta.label,
    method: c.meta.method,
    requiredEnvKeys: c.meta.requiredEnvKeys ?? [],
  }));
}

export async function getRefreshAuditBundle() {
  const brand = await getActiveBrand();
  const [jobs, runs, runtime] = await Promise.all([
    prisma.refreshJob.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.crawlRun.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: "desc" }, take: 25 }),
    getConnectorRuntimeSummary(),
  ]);
  return { brandId: brand.id, jobs, runs, runtime };
}

export async function processInlineForLocalIfNeeded(jobId: string, trigger: "manual" | "scheduled") {
  return processRefreshInlineIfEnabled(jobId, trigger);
}

export async function createAndMaybeRunRefresh(input: { trigger: "manual" | "scheduled"; interval?: string; targetGroups?: RefreshTargetGroup[]; }) {
  const scheduled = await scheduleRefreshJobs(input);
  const inline = await processInlineForLocalIfEnabled(scheduled.jobId, input.trigger);
  await reconcileRefreshJob(scheduled.jobId);
  return { scheduled, inline, job: await getRefreshJobById(scheduled.jobId) };
}

export async function refreshLocalDebug() {
  const brand = await getActiveBrand();
  await normalizeOpenStateForBrand(brand.id);
  return getRefreshAuditBundle();
}

export async function getRefreshHealth() {
  return getRefreshAuditBundle();
}

export async function getLatestQueueHealth() {
  const brand = await getActiveBrand();
  await normalizeOpenStateForBrand(brand.id);
  return getRefreshAuditBundle();
}

export async function localRefreshSanity() {
  const brand = await getActiveBrand();
  const [jobs, runs] = await Promise.all([
    prisma.refreshJob.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.crawlRun.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return { jobs, runs };
}

export async function normalizeAndGetLatestState() {
  const brand = await getActiveBrand();
  await normalizeOpenStateForBrand(brand.id);
  return getLatestRefreshOverview(brand.id);
}

export async function countOpenRunsGlobal() {
  return prisma.crawlRun.count({ where: { status: { in: ["pending", "running"] } } });
}

export async function getOpenRunsGlobal() {
  return prisma.crawlRun.findMany({ where: { status: { in: ["pending", "running"] } }, orderBy: { createdAt: "asc" } });
}

export async function getLatestManualJob(brandId: string) {
  return prisma.refreshJob.findFirst({ where: { brandId, trigger: "manual" }, orderBy: { createdAt: "desc" } });
}

export async function reconcileLatestManualJob(brandId: string) {
  const latest = await getLatestManualJob(brandId);
  if (!latest) return null;
  await reconcileRefreshJob(latest.id);
  return prisma.refreshJob.findUnique({ where: { id: latest.id } });
}

export async function getManualJobRuns(jobId: string) {
  return prisma.crawlRun.findMany({ where: { refreshJobId: jobId }, orderBy: { createdAt: "asc" } });
}

export async function getLocalUiState(jobId?: string) {
  const brand = await getActiveBrand();
  await normalizeOpenStateForBrand(brand.id);
  const job = jobId ? await getSafeJobById(brand.id, jobId) : await getSafeLatestJob(brand.id);
  return { brandId: brand.id, job };
}

export async function reconcileAllOpenJobsForBrand(brandId: string) {
  const jobs = await prisma.refreshJob.findMany({ where: { brandId, status: { in: ["queued", "running"] } } });
  for (const job of jobs) {
    await reconcileRefreshJob(job.id);
  }
}

export async function startInlineDevRefresh(input: { trigger: "manual" | "scheduled"; interval?: string; targetGroups?: RefreshTargetGroup[]; }) {
  const { scheduled, inline, job } = await createAndMaybeRunRefresh(input);
  return { scheduled, inline, job };
}

export async function countLatestJobRuns(jobId: string) {
  return prisma.crawlRun.count({ where: { refreshJobId: jobId } });
}

export async function getLatestJobRuns(jobId: string) {
  return prisma.crawlRun.findMany({ where: { refreshJobId: jobId }, orderBy: { createdAt: "asc" } });
}

export async function debugRefreshJob(jobId: string) {
  const [job, runs] = await Promise.all([
    prisma.refreshJob.findUnique({ where: { id: jobId } }),
    prisma.crawlRun.findMany({ where: { refreshJobId: jobId }, orderBy: { createdAt: "asc" } }),
  ]);
  return { job, runs };
}

export async function getLatestJobDebug() {
  const brand = await getActiveBrand();
  const latest = await prisma.refreshJob.findFirst({ where: { brandId: brand.id }, orderBy: { createdAt: "desc" } });
  if (!latest) return null;
  return debugRefreshJob(latest.id);
}

export async function getRuntimeConnectorConfig() {
  const allConnectors = getConnectors();
  return allConnectors.map((c) => ({
    platform: c.meta.platform,
    label: c.meta.label,
    method: c.meta.method,
    requiredEnvKeys: c.meta.requiredEnvKeys ?? [],
  }));
}

export async function getFullLocalAudit() {
  const [brand, runtime, latest] = await Promise.all([
    getActiveBrand(),
    getRuntimeConnectorConfig(),
    getLatestJobDebug(),
  ]);
  return { brand, runtime, latest };
}

export async function debugPendingTopology() {
  const [jobs, runs] = await Promise.all([
    prisma.refreshJob.findMany({ where: { status: { in: ["queued", "running"] } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.crawlRun.findMany({ where: { status: { in: ["pending", "running"] } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { jobs, runs };
}

export async function getLatestRunningProblem() {
  const job = await prisma.refreshJob.findFirst({ where: { status: { in: ["queued", "running"] } }, orderBy: { createdAt: "desc" } });
  if (!job) return null;
  const runs = await prisma.crawlRun.findMany({ where: { refreshJobId: job.id }, orderBy: { createdAt: "asc" } });
  return { job, runs };
}

export async function countStaleJobs(brandId: string) {
  const queuedCutoff = new Date(Date.now() - STALE_QUEUED_MS);
  const runningCutoff = new Date(Date.now() - STALE_RUNNING_MS);
  return prisma.refreshJob.count({
    where: {
      brandId,
      OR: [
        { status: "queued", createdAt: { lt: queuedCutoff } },
        { status: "running", startedAt: { lt: runningCutoff } },
      ],
    },
  });
}

export async function hasStaleJobs(brandId: string) {
  return (await countStaleJobs(brandId)) > 0;
}

export async function diagnoseSchedulerBlocking(brandId: string) {
  return {
    hasOpenJobs: await hasAnyOpenJobs(brandId),
    hasStaleJobs: await hasStaleJobs(brandId),
    pendingRuns: await prisma.crawlRun.count({ where: { brandId, status: "pending" } }),
    runningRuns: await prisma.crawlRun.count({ where: { brandId, status: "running" } }),
  };
}

export async function selfHealAndSummarize(brandId: string) {
  await normalizeOpenStateForBrand(brandId);
  return diagnoseSchedulerBlocking(brandId);
}

export async function localInlineReady(trigger: "manual" | "scheduled") {
  return isLocalInlineRefreshEnabled(trigger);
}

export async function clearOpenRunsForJob(jobId: string, message: string) {
  return prisma.crawlRun.updateMany({
    where: { refreshJobId: jobId, status: { in: ["pending", "running"] } },
    data: { status: "error", finishedAt: new Date(), error: message },
  });
}

export async function clearOpenJob(jobId: string, message: string) {
  return prisma.refreshJob.update({
    where: { id: jobId },
    data: { status: "failed", finishedAt: new Date(), error: message },
  });
}

export async function sweepOpenJobs() {
  const brand = await getActiveBrand();
  await normalizeOpenStateForBrand(brand.id);
  return debugPendingTopology();
}

export async function getRefreshOpsSnapshot() {
  const brand = await getActiveBrand();
  return {
    brandId: brand.id,
    latestJob: await getSafeLatestJob(brand.id),
    openRuns: await getOpenRunsByBrand(brand.id),
  };
}

export async function getRefreshOpsCounts() {
  const brand = await getActiveBrand();
  return getPendingOrRunningCounts(brand.id);
}

export async function getLatestSuccessfulJob(brandId: string) {
  return prisma.refreshJob.findFirst({ where: { brandId, status: "success" }, orderBy: { finishedAt: "desc" } });
}

export async function getLatestFailedJob(brandId: string) {
  return prisma.refreshJob.findFirst({ where: { brandId, status: "failed" }, orderBy: { finishedAt: "desc" } });
}

export async function getRefreshQualitySnapshot(brandId: string) {
  const [success, failed, open] = await Promise.all([
    getLatestSuccessfulJob(brandId),
    getLatestFailedJob(brandId),
    getLatestOpenJob(brandId),
  ]);
  return { success, failed, open };
}

export async function runLocalRefreshInline(input: { trigger: "manual" | "scheduled"; interval?: string; targetGroups?: RefreshTargetGroup[]; }) {
  return createAndMaybeRunRefresh(input);
}

export async function getLocalRefreshSnapshot(jobId?: string) {
  const brand = await getActiveBrand();
  await normalizeOpenStateForBrand(brand.id);
  const latest = jobId ? await getSafeJobById(brand.id, jobId) : await getSafeLatestJob(brand.id);
  const runs = latest ? await prisma.crawlRun.findMany({ where: { refreshJobId: latest.id }, orderBy: { createdAt: "asc" } }) : [];
  return { latest, runs };
}

export async function resolveRefreshRuntimeState(jobId?: string) {
  return getLocalRefreshSnapshot(jobId);
}

export async function runLocalRepair() {
  const brand = await getActiveBrand();
  await normalizeOpenStateForBrand(brand.id);
  return getLocalRefreshSnapshot();
}

export async function localRefreshState() {
  return getLocalRefreshSnapshot();
}

export async function latestRefreshState() {
  return getLocalRefreshSnapshot();
}

export async function latestRefreshStatus() {
  const state = await getLocalRefreshSnapshot();
  return state.latest?.status ?? null;
}

export async function latestRefreshRuns() {
  const state = await getLocalRefreshSnapshot();
  return state.runs;
}

export async function latestRefreshSummary() {
  const state = await getLocalRefreshSnapshot();
  return {
    job: state.latest,
    runs: state.runs,
  };
}

export async function localRefreshQuickCheck() {
  return latestRefreshSummary();
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

const STALE_QUEUED_MS = 3 * 60 * 1000;
const STALE_RUNNING_MS = 10 * 60 * 1000;

async function expireStaleRefreshJobs(brandId: string): Promise<void> {
  const now = new Date();
  const queuedCutoff = new Date(Date.now() - STALE_QUEUED_MS);
  const runningCutoff = new Date(Date.now() - STALE_RUNNING_MS);

  const staleJobs = await prisma.refreshJob.findMany({
    where: {
      brandId,
      OR: [
        { status: "queued", createdAt: { lt: queuedCutoff } },
        { status: "running", startedAt: { lt: runningCutoff } },
      ],
    },
    select: { id: true, status: true },
  });

  for (const job of staleJobs) {
    const staleRuns = await prisma.crawlRun.findMany({
      where: {
        refreshJobId: job.id,
        status: { in: ["pending", "running"] },
      },
      select: { id: true },
    });

    if (staleRuns.length > 0) {
      await prisma.crawlRun.updateMany({
        where: {
          refreshJobId: job.id,
          status: { in: ["pending", "running"] },
        },
        data: {
          status: "error",
          finishedAt: now,
          error: `Expired stale ${job.status} run; refresh dapat dijalankan ulang.`,
        },
      });
    }

    await prisma.refreshJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        finishedAt: now,
        failedSources: { increment: staleRuns.length },
        error: `Expired stale ${job.status} job otomatis setelah timeout internal.`,
      },
    });
  }
}

export async function scheduleRefreshJobs(input: {
  trigger: "manual" | "scheduled";
  interval?: string;
  targetGroups?: RefreshTargetGroup[];
}): Promise<ScheduledRefreshResult> {
  const targetGroups = input.targetGroups ?? [];
  const refreshAll = targetGroups.length === 0;

  const brand = await getActiveBrand();
  await expireStaleRefreshJobs(brand.id);
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
  // Bersihkan run stale global agar antrian baru tidak tersandera state lama.
  const staleRunningCutoff = new Date(Date.now() - STALE_RUNNING_MS);
  await prisma.crawlRun.updateMany({
    where: {
      status: "running",
      startedAt: { lt: staleRunningCutoff },
    },
    data: {
      status: "error",
      finishedAt: new Date(),
      error: "Expired stale running crawl; aman dijalankan ulang.",
    },
  });

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
