"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const ACCOUNT_PLATFORMS = [
  { value: "facebook", label: "Facebook Page" },
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X / Twitter" },
  { value: "threads", label: "Threads" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube Channel" },
];

export function AddAccountForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform: form.get("platform"),
          handle: form.get("handle"),
          displayName: form.get("displayName"),
          accountType: form.get("accountType"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg("Akun ditambahkan.");
      (e.target as HTMLFormElement).reset?.();
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal menambah akun.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1">
        <Label htmlFor="acc-platform">Platform</Label>
        <Select id="acc-platform" name="platform" className="h-9">
          {ACCOUNT_PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="acc-handle">Handle <span className="text-destructive">*</span></Label>
        <Input id="acc-handle" name="handle" required placeholder="@namaakun" className="h-9" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="acc-name">Nama tampilan</Label>
        <Input id="acc-name" name="displayName" placeholder="opsional" className="h-9" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="acc-type">Tipe</Label>
        <Select id="acc-type" name="accountType" className="h-9">
          <option value="own">Akun brand (own)</option>
          <option value="competitor">Kompetitor</option>
        </Select>
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" disabled={loading} className="h-9">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Tambah akun
        </Button>
      </div>
      {msg && <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-5" aria-live="polite">{msg}</p>}
    </form>
  );
}

export function AddSearchProfileForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/search-profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          platform: form.get("platform"),
          scope: form.get("scope"),
          query: form.get("query"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg("Search profile ditambahkan.");
      (e.target as HTMLFormElement).reset?.();
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal menambah profil.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1">
        <Label htmlFor="sp-name">Nama Profil <span className="text-destructive">*</span></Label>
        <Input id="sp-name" name="name" required placeholder="Contoh: TikTok mentions" className="h-9" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="sp-platform">Platform</Label>
        <Select id="sp-platform" name="platform" className="h-9">
          {ACCOUNT_PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="sp-scope">Scope</Label>
        <Select id="sp-scope" name="scope" className="h-9">
          <option value="public_keyword">Keyword/Frasa</option>
          <option value="public_hashtag">Hashtag</option>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="sp-query">Query <span className="text-destructive">*</span></Label>
        <Input id="sp-query" name="query" required placeholder='"bank jakarta"' className="h-9" />
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" disabled={loading} className="h-9">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Tambah Profil
        </Button>
      </div>
      {msg && <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-5" aria-live="polite">{msg}</p>}
    </form>
  );
}

export function FetchMetricsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function fetchMetrics() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/accounts", { method: "PATCH" });
      const data = await res.json();
      setResult(
        `${data.fetched} akun tersinkron${data.skipped?.length ? `; ${data.skipped.length} dilewati (butuh API key)` : ""}.`
      );
      router.refresh();
    } catch {
      setResult("Gagal menarik metrik.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={fetchMetrics} disabled={loading}>
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
        {loading ? "Menarik metrik..." : "Tarik metrik dari API"}
      </Button>
      {result && <span className="text-xs text-muted-foreground" aria-live="polite">{result}</span>}
    </div>
  );
}
