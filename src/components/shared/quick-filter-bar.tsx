"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PLATFORMS, SENTIMENTS, ISSUE_CATEGORIES } from "@/lib/constants";

/**
 * Filter cepat generik (platform, sentiment, issue, keyword, risk) yang
 * mempertahankan parameter periode dari PeriodFilter. Dipakai Buzz Geo,
 * Sociograph, dan halaman analitik lain agar semua angka filter-aware.
 */
export function QuickFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const get = (key: string) => params.get(key) ?? "";

  function apply(formData: FormData) {
    const next = new URLSearchParams();
    for (const k of ["range", "month", "year"]) {
      const v = params.get(k);
      if (v) next.set(k, v);
    }
    for (const [key, value] of formData.entries()) {
      const v = String(value).trim();
      if (v) next.set(key, v);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  function reset() {
    const next = new URLSearchParams();
    for (const k of ["range", "month", "year"]) {
      const v = params.get(k);
      if (v) next.set(k, v);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <form action={apply} className="rounded-lg border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="qf-platform">Platform</Label>
          <Select id="qf-platform" name="platform" defaultValue={get("platform")} className="h-9">
            <option value="">Semua platform</option>
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="qf-sentiment">Sentiment</Label>
          <Select id="qf-sentiment" name="sentiment" defaultValue={get("sentiment")} className="h-9">
            <option value="">Semua sentiment</option>
            {SENTIMENTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
            <option value="negative,mixed">Negative + Mixed</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="qf-issue">Issue category</Label>
          <Select id="qf-issue" name="issue" defaultValue={get("issue")} className="h-9">
            <option value="">Semua isu</option>
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="qf-q">Keyword</Label>
          <Input id="qf-q" name="q" defaultValue={get("q")} placeholder="mis. QRIS" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="qf-minRisk">Min risk (0-100)</Label>
          <Input id="qf-minRisk" name="minRisk" type="number" min={0} max={100} defaultValue={get("minRisk")} className="h-9" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm">Terapkan filter</Button>
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset
        </Button>
      </div>
    </form>
  );
}
