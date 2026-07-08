"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ImportForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setMessage({ ok: false, text: "Pilih file CSV atau JSON terlebih dahulu." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import gagal");
      setMessage({
        ok: true,
        text: `Import berhasil: ${data.inserted} baru dianalisis, ${data.skipped} duplikat dilewati.`,
      });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Import gagal." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="import-file">File CSV / JSON</Label>
        <Input id="import-file" name="file" type="file" accept=".csv,.json" className="cursor-pointer" />
        <p className="text-xs text-muted-foreground">
          Kolom minimal: <code className="font-mono">content</code>. Kolom lain (opsional):
          sourcePlatform, sourceType, externalId, url, authorName, authorHandle, title,
          publishedAt, likeCount, commentCount, shareCount, viewCount, language, mediaTier.
        </p>
      </div>
      {message && (
        <p role="status" className={`text-sm font-medium ${message.ok ? "text-emerald-600" : "text-destructive"}`}>
          {message.text}
        </p>
      )}
      <Button type="submit" disabled={loading}>
        <Upload className="h-4 w-4" aria-hidden="true" />
        {loading ? "Mengimport & menganalisis..." : "Import data"}
      </Button>
    </form>
  );
}
