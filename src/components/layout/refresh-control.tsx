"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Newspaper, AtSign, CircleCheck, AlertTriangle, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { RefreshJob } from "@prisma/client";

const INTERVALS: { value: string; label: string; ms: number }[] = [
  { value: "manual", label: "Manual", ms: 0 },
  { value: "5m", label: "Setiap 5 menit", ms: 5 * 60 * 1000 },
  { value: "30m", label: "Setiap 30 menit", ms: 30 * 60 * 1000 },
  { value: "1h", label: "Setiap 1 jam", ms: 60 * 60 * 1000 },
];

type RefreshTargetGroup = "social" | "news" | "blog";

type LoadingState = "all" | "social" | "news,blog" | null;

function useRefreshStatus() {
  const router = useRouter();
  const [loading, setLoading] = useState<LoadingState>(null);
  const [activeJob, setActiveJob] = useState<RefreshJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const jobIdQuery = activeJobIdRef.current ? `?jobId=${encodeURIComponent(activeJobIdRef.current)}` : "";
      const res = await fetch(`/api/refresh/status${jobIdQuery}`);
      const data = await res.json();
      if (data.ok && data.job) {
        const job = data.job as RefreshJob;
        setActiveJob(job);
        if (job.status === "success" || job.status === "failed") {
          stopPolling();
          setLoading(null);
          router.refresh();
        }
      }
    } catch (err) {
      setError("Gagal mengambil status refresh.");
      stopPolling();
      setLoading(null);
    }
  }, [router, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollIntervalRef.current = setInterval(pollStatus, 3000);
  }, [pollStatus, stopPolling]);

  const runRefresh = useCallback(
    async (trigger: "manual" | "scheduled", targetGroups: RefreshTargetGroup[] = [], intervalValue = "manual") => {
      const scope = targetGroups.join(",") || "all";
      setLoading(scope as LoadingState);
      setError(null);
      try {
        const res = await fetch("/api/refresh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            trigger,
            interval: trigger === "scheduled" ? intervalValue : "",
            targetGroups: targetGroups.length ? targetGroups : undefined,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          activeJobIdRef.current = data.jobId ?? null;
          startPolling();
        } else {
          setError(data.error || "Gagal memulai refresh.");
          setLoading(null);
        }
      } catch {
        setError("Gagal terhubung ke server untuk memulai refresh.");
        setLoading(null);
      }
    },
    [startPolling]
  );

  useEffect(() => {
    // Initial load of the last job status
    pollStatus();
  }, [pollStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return { loading, activeJob, error, runRefresh, setLoading };
}

export function RefreshControl() {
  const { loading, activeJob, error, runRefresh } = useRefreshStatus();
  const [interval_, setInterval_] = useState("manual");
  const scheduledIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("bp-refresh-interval");
    if (saved) setInterval_(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("bp-refresh-interval", interval_);
    if (scheduledIntervalRef.current) clearInterval(scheduledIntervalRef.current);
    const cfg = INTERVALS.find((i) => i.value === interval_);
    if (cfg && cfg.ms > 0) {
      scheduledIntervalRef.current = setInterval(() => {
        if (loading || activeJob?.status === "queued" || activeJob?.status === "running") return;
        void runRefresh("scheduled", [], interval_);
      }, cfg.ms);
    }
    return () => {
      if (scheduledIntervalRef.current) clearInterval(scheduledIntervalRef.current);
    };
  }, [interval_, runRefresh, loading, activeJob?.status]);

  const isRunning = activeJob?.status === 'running' || activeJob?.status === 'queued';
  const diagTime = activeJob?.finishedAt
    ? new Date(activeJob.finishedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground lg:inline" aria-live="polite">
        {error && <span className="font-medium text-destructive">{error}</span>}
        {!error && isRunning && (
          <span className="flex items-center gap-1.5 font-medium text-sky-600">
            <Loader className="h-3 w-3 animate-spin" />
            Refresh sedang berjalan...
          </span>
        )}
        {!error && !isRunning && activeJob && (
          <>
            {activeJob.status === "success" && <span className="flex items-center gap-1.5"><CircleCheck className="h-3 w-3 text-emerald-600" />Refresh {diagTime}</span>}
            {activeJob.status === "failed" && <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-destructive" />Refresh {diagTime} gagal</span>}
            {" — "}
            <span className="font-medium text-emerald-700">Baru: {activeJob.newMentions}</span>
            {" · "}Update: {activeJob.updatedMentions}
            {" · "}Duplikat: {activeJob.duplicatesSkipped}
            {activeJob.failedSources > 0 && (
              <span className="font-medium text-destructive">
                {" · "}Gagal: {activeJob.failedSources}
              </span>
            )}
          </>
        )}
      </span>
      <label htmlFor="refresh-interval" className="sr-only">
        Interval refresh terjadwal
      </label>
      <Select
        id="refresh-interval"
        value={interval_}
        onChange={(e) => setInterval_(e.target.value)}
        className="h-9 w-40"
        aria-label="Interval refresh terjadwal"
        disabled={Boolean(loading) || isRunning}
      >
        {INTERVALS.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </Select>
      <Button size="sm" onClick={() => runRefresh("manual", ["social", "news", "blog"])} disabled={Boolean(loading) || isRunning}>
        <RefreshCw className={`h-4 w-4 ${loading === "all" || (isRunning && !loading) ? "animate-spin" : ""}`} aria-hidden="true" />
        {loading === "all" || (isRunning && !loading) ? "Memuat..." : "Reload all"}
      </Button>
      <div className="flex items-center">
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 rounded-r-none border-r-0"
          onClick={() => runRefresh("manual", ["social"])}
          disabled={Boolean(loading) || isRunning}
          aria-label="Reload Social"
        >
          <AtSign className={`h-4 w-4 ${loading === "social" ? "animate-spin" : ""}`} />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 rounded-l-none"
          onClick={() => runRefresh("manual", ["news", "blog"])}
          disabled={Boolean(loading) || isRunning}
          aria-label="Reload News"
        >
          <Newspaper className={`h-4 w-4 ${loading === "news,blog" ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}
