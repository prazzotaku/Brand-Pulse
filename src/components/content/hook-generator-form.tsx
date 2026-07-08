"use client";

import { useState } from "react";
import { Sparkles, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { HookGenerationResult } from "@/lib/types";

/** Generator: minta AI membuatkan hook & caption dari topik konten. */
export function HookGeneratorForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HookGenerationResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hook-generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: form.get("topic"),
          platform: form.get("platform"),
          goal: form.get("goal"),
          contentType: form.get("contentType"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generate gagal");
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate gagal. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard tidak tersedia — abaikan */
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Buatkan Hook & Caption</CardTitle>
          <CardDescription>
            Tulis topik + pilih format — AI membuatkan 5 opsi hook, <strong>isi konten</strong> yang
            menyesuaikan format (script video / slide carousel / teks thread), dan caption lengkap;
            mengikuti brand voice, menghindari klaim terlarang.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="gen-topic">Topik / isi konten <span className="text-destructive">*</span></Label>
              <Input
                id="gen-topic"
                name="topic"
                required
                placeholder="mis. cara aman transaksi QRIS di pasar tradisional"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="gen-platform">Platform target</Label>
                <Select id="gen-platform" name="platform" defaultValue="tiktok">
                  <option value="tiktok">TikTok</option>
                  <option value="reels">Instagram Reels</option>
                  <option value="instagram">Instagram Post</option>
                  <option value="x">X / Twitter</option>
                  <option value="threads">Threads</option>
                  <option value="facebook">Facebook</option>
                  <option value="youtube">YouTube Shorts</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gen-contentType">Format konten</Label>
                <Select id="gen-contentType" name="contentType" defaultValue="video">
                  <option value="video">Video (script)</option>
                  <option value="single">Gambar Tunggal (1 feed post)</option>
                  <option value="carousel">Carousel (multi-slide)</option>
                  <option value="text">Teks / Thread</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gen-goal">Tujuan konten</Label>
                <Select id="gen-goal" name="goal" defaultValue="edukasi">
                  <option value="edukasi">Edukasi</option>
                  <option value="promosi">Promosi</option>
                  <option value="trust">Membangun trust</option>
                  <option value="awareness">Awareness</option>
                </Select>
              </div>
            </div>
            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>
              <Sparkles className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} aria-hidden="true" />
              {loading ? "Membuatkan..." : "Buatkan hook & caption"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hasil Generator</CardTitle>
          <CardDescription>Klik ikon salin untuk memakai langsung.</CardDescription>
        </CardHeader>
        <CardContent>
          {!result ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Hook & caption buatan AI akan tampil di sini.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-semibold">Opsi hook:</p>
                <ul className="space-y-2">
                  {result.hooks.map((h, i) => (
                    <li key={i} className="flex items-start justify-between gap-2 rounded-md bg-accent p-2.5">
                      <div>
                        <Badge variant="secondary" className="mb-1">{h.type}</Badge>
                        <p className="text-sm italic">&ldquo;{h.text}&rdquo;</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copy(h.text, `hook-${i}`)}
                        aria-label={`Salin hook opsi ${i + 1}`}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-primary"
                      >
                        {copied === `hook-${i}` ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {result.contentBody && result.contentBody.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      Isi konten{" "}
                      <Badge variant="secondary" className="ml-1 align-middle">
                        {result.contentType === "video" ? "Video / Script" : result.contentType === "carousel" ? "Carousel" : result.contentType === "single" ? "Gambar Tunggal" : result.contentType === "image" ? "Carousel" : "Teks / Thread"}
                      </Badge>
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copy(result.contentBody.map((b) => `${b.label}\n${b.text}`).join("\n\n"), "content")
                      }
                    >
                      {copied === "content" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === "content" ? "Tersalin" : "Salin isi"}
                    </Button>
                  </div>
                  <ol className="space-y-2">
                    {result.contentBody.map((b, i) => (
                      <li key={i} className="rounded-md border p-2.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{b.label}</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm">{b.text}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Caption siap pakai:</p>
                  <Button size="sm" variant="outline" onClick={() => copy(result.caption, "caption")}>
                    {copied === "caption" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === "caption" ? "Tersalin" : "Salin caption"}
                  </Button>
                </div>
                <div className="whitespace-pre-wrap rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950">
                  {result.caption}
                </div>
              </div>

              <p className="text-sm"><strong>CTA:</strong> <span className="text-muted-foreground">{result.cta}</span></p>
              <p className="rounded-md border-l-4 border-primary bg-muted p-3 text-sm">
                <strong>Catatan eksekusi:</strong> {result.notes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
