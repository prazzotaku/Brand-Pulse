"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

const INTERVALS: { value: string; label: string; ms: number }[] = [
  { value: "manual", label: "Manual", ms: 0 },
  { value: "1m", label: "Near-realtime (1 menit)", ms: 60 * 1000 },
  { value: "5m", label: "Setiap 5 menit", ms: 5 * 60 * 1000 },
  { value: "30m", label: "Setiap 30 menit", ms: 30 * 60 * 1000 },
  { value: "1h", label: "Setiap 1 jam", ms: 60 * 60 * 1000 },
];

interface RefreshDiagnostics {
  finishedAt: string;
  newMentions: number;
  updatedMentions: number;
  duplicatesSkipped: number;
  failedSources: number;
}

/**
 * Refresh scheduler sisi client (manual/5m/30m/1h) + refresh diagnostics:
 * setelah refresh, tampilkan New / Updated / Duplicates skipped / Failed
 * supaya user tahu persis kenapa angka summary berubah.
 */
export function RefreshControl() {
  const router = useRouter();
  const [interval_, setInterval_] = useState("manual");
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState<RefreshDiagnostics | null>(null);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runRefresh = useCallback(
    async (trigger: "manual" | "scheduled") => {
      setLoading(true);
      try {
        const res = await fetch("/api/refresh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trigger, interval: trigger === "scheduled" ? interval_ : "" }),
        });
        const data = await res.json();
        if (res.ok) {
          setDiag(data);
          setFailed(false);
        } else {
          setFailed(true);
        }
        router.refresh();
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [router, interval_]
  );

  useEffect(() => {
    const saved = localStorage.getItem("bp-refresh-interval");
    if (saved) setInterval_(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("bp-refresh-interval", interval_);
    if (timerRef.current) clearInterval(timerRef.current);
    const cfg = INTERVALS.find((i) => i.value === interval_);
    if (cfg && cfg.ms > 0) {
      timerRef.current = setInterval(() => runRefresh("scheduled"), cfg.ms);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [interval_, runRefresh]);

  const diagTime = diag
    ? new Date(diag.finishedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground lg:inline" aria-live="polite">
        {failed && <span className="font-medium text-destructive">Refresh gagal — coba lagi.</span>}
        {!failed && diag && (
          <>
            Refresh {diagTime} —{" "}
            <span className="font-medium text-emerald-700">Baru: {diag.newMentions}</span>
            {" · "}Update: {diag.updatedMentions}
            {" · "}Duplikat dilewati: {diag.duplicatesSkipped}
            {diag.failedSources > 0 && (
              <span className="font-medium text-destructive"> · Gagal: {diag.failedSources} source</span>
            )}
          </>
        )}
      </span>
      <label htmlFor="refresh-interval" className="sr-only">
        Interval refresh
      </label>
      <Select
        id="refresh-interval"
        value={interval_}
        onChange={(e) => setInterval_(e.target.value)}
        className="h-9 w-40"
      >
        {INTERVALS.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </Select>
      <Button size="sm" onClick={() => runRefresh("manual")} disabled={loading}>
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
        {loading ? "Memuat..." : "Reload now"}
      </Button>
    </div>
  );
}
