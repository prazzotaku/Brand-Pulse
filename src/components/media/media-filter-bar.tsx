"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SENTIMENTS } from "@/lib/constants";
import { useQueryState } from "@/lib/use-query-state";

/**
 * Filter Media Tone (platform pemberitaan + sentimen + keyword). Mempertahankan
 * parameter periode (PeriodFilter) dan granularity (TrendChart) agar konsisten.
 */
export function MediaFilterBar() {
  const { get, push } = useQueryState();

  const PRESERVE_KEYS = ["range", "month", "year", "gran", "pageSize"];

  function apply(formData: FormData) {
    const patch: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      const v = String(value).trim();
      if (v) patch[key] = v;
    }
    push(patch, {
      base: "whitelist",
      preserveKeys: PRESERVE_KEYS,
      resetPage: true,
    });
  }

  function reset() {
    push({}, {
      base: "whitelist",
      preserveKeys: PRESERVE_KEYS,
      resetPage: true,
    });
  }

  return (
    <form action={apply} className="rounded-lg border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="mf-platform">Sumber</Label>
          <Select id="mf-platform" name="platform" defaultValue={get("platform")} className="h-9">
            <option value="">Semua sumber berita</option>
            <option value="news">Online News</option>
            <option value="blog">Blog</option>
            <option value="rss">RSS</option>
            <option value="news,blog">News + Blog</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mf-sentiment">Sentiment</Label>
          <Select id="mf-sentiment" name="sentiment" defaultValue={get("sentiment")} className="h-9">
            <option value="">Semua sentiment</option>
            {SENTIMENTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
            <option value="negative,mixed">Negative + Mixed</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mf-tier">Media tier</Label>
          <Select id="mf-tier" name="mediaTier" defaultValue={get("mediaTier")} className="h-9">
            <option value="">Semua tier</option>
            <option value="tier1">Tier 1 Nasional</option>
            <option value="tier2">Tier 2 Industri</option>
            <option value="tier1,tier2">Tier 1 + 2</option>
            <option value="local">Media Lokal</option>
            <option value="blog">Blog</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mf-q">Keyword</Label>
          <Input id="mf-q" name="q" defaultValue={get("q")} placeholder="mis. QRIS" className="h-9" />
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
