"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import type { HookReviewResult } from "@/lib/types";

const RUBRIC_LABELS: Record<string, string> = {
  hookStrength: "Hook Strength",
  curiosityGap: "Curiosity Gap",
  conflictContrast: "Conflict / Contrast",
  promiseClarity: "Promise Clarity",
  audienceRelevance: "Audience Relevance",
  brandFit: "Brand Fit",
  ctaStrength: "CTA Strength",
  retentionPotential: "Retention Potential",
  riskLevel: "Risk Level (10 = aman)",
};

export function HookReviewForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HookReviewResult | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hook-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caption: form.get("caption"),
          platform: form.get("platform"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Review gagal");
      setResult(data.result);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review gagal. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Review Hook &amp; Caption</CardTitle>
          <CardDescription>
            Tempel caption lengkap yang sudah kamu tulis — AI otomatis mendeteksi hook (baris pembuka),
            struktur isi, dan CTA-nya, lalu memberi skor + saran revisi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="caption">Caption lengkap <span className="text-destructive">*</span></Label>
              <Textarea
                id="caption"
                name="caption"
                required
                rows={9}
                placeholder={"Tempel seluruh caption di sini, termasuk hook pembuka, isi, dan CTA.\n\nContoh:\nSaatnya upgrade perlengkapan olahraga, hemat sampai 20%!\n\nNikmati diskon 20% di Blibli dengan Kartu Debit Visa Bank Jakarta..."}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="platform">Platform target</Label>
              <Select id="platform" name="platform" defaultValue="instagram">
                <option value="instagram">Instagram (Feed/Post)</option>
                <option value="reels">Instagram Reels</option>
                <option value="tiktok">TikTok</option>
                <option value="x">X / Twitter</option>
                <option value="threads">Threads</option>
                <option value="facebook">Facebook</option>
                <option value="youtube">YouTube Shorts</option>
              </Select>
            </div>
            {error && (
              <p role="alert" className="text-sm font-medium text-destructive">{error}</p>
            )}
            <Button type="submit" disabled={loading}>
              <Wand2 className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} aria-hidden="true" />
              {loading ? "Mereview..." : "Review sekarang"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hasil Review</CardTitle>
          <CardDescription>Skor 0-10 berdasarkan rubrik hook engine.</CardDescription>
        </CardHeader>
        <CardContent>
          {!result ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Hasil review akan tampil di sini.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className={`font-mono text-4xl font-bold ${result.totalScore >= 7.5 ? "text-emerald-600" : result.totalScore >= 5 ? "text-amber-600" : "text-red-600"}`}>
                  {result.totalScore.toFixed(1)}
                </span>
                <span className="text-muted-foreground">/10 · terdeteksi: {result.detectedHookType}</span>
              </div>

              <div className="space-y-2">
                {Object.entries(result.scoreBreakdown).map(([key, value]) => (
                  <div key={key}>
                    <div className="mb-0.5 flex justify-between text-xs">
                      <span className="text-muted-foreground">{RUBRIC_LABELS[key] ?? key}</span>
                      <span className="font-mono font-medium">{value}/10</span>
                    </div>
                    <Progress
                      value={value * 10}
                      indicatorClassName={value >= 7 ? "bg-emerald-500" : value >= 4 ? "bg-amber-500" : "bg-red-500"}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2 text-sm">
                <p><strong>Kelemahan utama:</strong> <span className="text-muted-foreground">{result.mainWeakness}</span></p>
                <p><strong>Kenapa penting:</strong> <span className="text-muted-foreground">{result.whyItMatters}</span></p>
                <p><strong>Hook type yang disarankan:</strong> <span className="text-muted-foreground">{result.recommendedHookType}</span></p>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Opsi revisi hook:</p>
                <ul className="space-y-2">
                  {result.rewrittenOptions.map((opt, i) => (
                    <li key={i} className="rounded-md bg-accent p-2.5 text-sm italic">&ldquo;{opt}&rdquo;</li>
                  ))}
                </ul>
              </div>

              {result.suggestedCaption && (
                <div>
                  <p className="mb-2 text-sm font-semibold">
                    Saran hook + caption siap pakai{result.totalScore < 7.5 ? " (pengganti versi kamu)" : ""}:
                  </p>
                  <div className="whitespace-pre-wrap rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950">
                    {result.suggestedCaption}
                  </div>
                </div>
              )}

              <p className="rounded-md border-l-4 border-primary bg-muted p-3 text-sm">
                <strong>Rekomendasi final:</strong> {result.finalRecommendation}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
