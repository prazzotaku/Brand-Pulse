"use client";

import { useState } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PLATFORMS, SENTIMENTS, ISSUE_CATEGORIES, DATE_RANGES } from "@/lib/constants";
import { useQueryState } from "@/lib/use-query-state";

/**
 * Filter engine UI — semua state filter hidup di URL (shareable & bisa
 * disimpan sebagai saved view). Server component membaca searchParams
 * yang sama lalu menerjemahkannya lewat buildMentionWhere().
 */
export function FilterBar() {
  const { get, push } = useQueryState();
  const [expanded, setExpanded] = useState(false);

  function apply(formData: FormData) {
    const patch: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      const v = String(value).trim();
      if (v) patch[key] = v;
    }
    push(patch, {
      base: "whitelist",
      preserveKeys: ["pageSize"],
      resetPage: true,
    });
  }

  function reset() {
    push({}, {
      base: "whitelist",
      preserveKeys: ["pageSize"],
      resetPage: true,
    });
  }

  return (
    <form action={apply} className="rounded-lg border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="f-range">Date range</Label>
          <Select id="f-range" name="range" defaultValue={get("range") || "7d"} className="h-9">
            {DATE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-platform">Platform</Label>
          <Select id="f-platform" name="platform" defaultValue={get("platform")} className="h-9">
            <option value="">Semua platform</option>
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-sentiment">Sentiment</Label>
          <Select id="f-sentiment" name="sentiment" defaultValue={get("sentiment")} className="h-9">
            <option value="">Semua sentiment</option>
            {SENTIMENTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
            <option value="negative,mixed">Negative + Mixed</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-issue">Issue category</Label>
          <Select id="f-issue" name="issue" defaultValue={get("issue")} className="h-9">
            <option value="">Semua isu</option>
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-q">Keyword include</Label>
          <Input id="f-q" name="q" defaultValue={get("q")} placeholder="mis. QRIS" className="h-9" />
        </div>
      </div>

      {expanded && (
        <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="f-exclude">Keyword exclude</Label>
            <Input id="f-exclude" name="exclude" defaultValue={get("exclude")} placeholder="mis. lowongan" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-minRelevance">Min relevance (0-100)</Label>
            <Input id="f-minRelevance" name="minRelevance" type="number" min={0} max={100} defaultValue={get("minRelevance")} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-minRisk">Min risk score (0-100)</Label>
            <Input id="f-minRisk" name="minRisk" type="number" min={0} max={100} defaultValue={get("minRisk")} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-minConfidence">Min confidence (0-100)</Label>
            <Input id="f-minConfidence" name="minConfidence" type="number" min={0} max={100} defaultValue={get("minConfidence")} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-minEngagement">Min engagement</Label>
            <Input id="f-minEngagement" name="minEngagement" type="number" min={0} defaultValue={get("minEngagement")} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-mediaTier">Media tier (berita)</Label>
            <Select id="f-mediaTier" name="mediaTier" defaultValue={get("mediaTier")} className="h-9">
              <option value="">Semua tier</option>
              <option value="tier1">Tier 1 Nasional</option>
              <option value="tier2">Tier 2 Industri</option>
              <option value="tier1,tier2">Tier 1 + 2</option>
              <option value="local">Media lokal</option>
              <option value="blog">Blog</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-language">Language</Label>
            <Select id="f-language" name="language" defaultValue={get("language")} className="h-9">
              <option value="">Semua bahasa</option>
              <option value="id">Indonesia</option>
              <option value="en">English</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-author">Author / account</Label>
            <Input id="f-author" name="author" defaultValue={get("author")} placeholder="nama akun / media" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-hashtag">Hashtag</Label>
            <Input id="f-hashtag" name="hashtag" defaultValue={get("hashtag")} placeholder="#promo" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-location">Lokasi</Label>
            <Input id="f-location" name="location" defaultValue={get("location")} placeholder="mis. Jakarta" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-geoConfidence">Min geo confidence</Label>
            <Input id="f-geoConfidence" name="geoConfidence" type="number" min={0} max={100} defaultValue={get("geoConfidence")} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-slang">Slang word</Label>
            <Input id="f-slang" name="slang" defaultValue={get("slang")} placeholder="mis. lemot" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-minViews">Min views</Label>
            <Input id="f-minViews" name="minViews" type="number" min={0} defaultValue={get("minViews")} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-minComments">Min comments</Label>
            <Input id="f-minComments" name="minComments" type="number" min={0} defaultValue={get("minComments")} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-minShares">Min shares</Label>
            <Input id="f-minShares" name="minShares" type="number" min={0} defaultValue={get("minShares")} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-sourceType">Media type</Label>
            <Select id="f-sourceType" name="sourceType" defaultValue={get("sourceType")} className="h-9">
              <option value="">Semua tipe</option>
              <option value="post">Post</option>
              <option value="comment">Comment</option>
              <option value="reply">Reply</option>
              <option value="video">Video</option>
              <option value="article">Article</option>
              <option value="thread">Forum thread</option>
              <option value="caption">Caption</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-from">Custom: dari tanggal</Label>
            <Input id="f-from" name="from" type="date" defaultValue={get("from")} className="h-9 cursor-pointer" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-to">Custom: sampai tanggal</Label>
            <Input id="f-to" name="to" type="date" defaultValue={get("to")} className="h-9 cursor-pointer" />
          </div>
          <div className="flex items-end pb-1.5">
            <label htmlFor="f-includeIrrelevant" className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                id="f-includeIrrelevant"
                name="includeIrrelevant"
                type="checkbox"
                value="1"
                defaultChecked={get("includeIrrelevant") === "1"}
                className="h-4 w-4 cursor-pointer"
              />
              Sertakan yang ditandai tidak relevan
            </label>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm">Terapkan filter</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => push({}, { base: "whitelist", preserveKeys: ["pageSize"], resetPage: true })}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          {expanded ? "Sembunyikan filter lanjutan" : "Filter lanjutan"}
        </Button>
      </div>
    </form>
  );
}
