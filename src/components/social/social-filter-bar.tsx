"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SENTIMENTS } from "@/lib/constants";
import { useQueryState } from "@/lib/use-query-state";

const SOCIAL_PLATFORM_OPTIONS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X / Twitter" },
  { value: "threads", label: "Threads" },
  { value: "tiktok", label: "TikTok" },
  { value: "tiktok,x", label: "TikTok + X" },
  { value: "facebook,instagram", label: "Facebook + Instagram" },
];

/**
 * Filter Social Listening (platform, sentiment, keyword, risk, relevance).
 * Semua angka summary + drawer detail mengikuti filter ini (filter-aware count).
 * Parameter periode (range/month/year) dari PeriodFilter tetap dipertahankan.
 */
export function SocialFilterBar() {
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1">
          <Label htmlFor="sf-platform">Platform</Label>
          <Select id="sf-platform" name="platform" defaultValue={get("platform")} className="h-9">
            <option value="">Semua sosial</option>
            {SOCIAL_PLATFORM_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sf-sentiment">Sentiment</Label>
          <Select id="sf-sentiment" name="sentiment" defaultValue={get("sentiment")} className="h-9">
            <option value="">Semua sentiment</option>
            {SENTIMENTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
            <option value="negative,mixed">Negative + Mixed</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sf-q">Keyword</Label>
          <Input id="sf-q" name="q" defaultValue={get("q")} placeholder="mis. QRIS" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sf-sourceType">Source type</Label>
          <Select id="sf-sourceType" name="sourceType" defaultValue={get("sourceType")} className="h-9">
            <option value="">Semua tipe</option>
            <option value="post">Post</option>
            <option value="comment">Comment</option>
            <option value="reply">Reply</option>
            <option value="video">Video</option>
            <option value="caption">Caption</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sf-minRisk">Min risk (0-100)</Label>
          <Input id="sf-minRisk" name="minRisk" type="number" min={0} max={100} defaultValue={get("minRisk")} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sf-minRelevance">Min relevance (0-100)</Label>
          <Input id="sf-minRelevance" name="minRelevance" type="number" min={0} max={100} defaultValue={get("minRelevance")} className="h-9" />
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
