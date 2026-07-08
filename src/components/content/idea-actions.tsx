"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Bookmark, Check, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GenerateIdeasButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      await fetch("/api/content-ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: 4 }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={generate} disabled={loading}>
      <Sparkles className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} aria-hidden="true" />
      {loading ? "Menganalisis insight..." : "Generate ide baru"}
    </Button>
  );
}

export function IdeaStatusButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(next: string) {
    setBusy(true);
    try {
      await fetch("/api/content-ideas", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-1.5">
      {status !== "saved" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("saved")}>
          <Bookmark className="h-3.5 w-3.5" aria-hidden="true" /> Simpan
        </Button>
      )}
      {status !== "used" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("used")}>
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Dipakai
        </Button>
      )}
      {status !== "archived" && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatus("archived")}>
          <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Arsip
        </Button>
      )}
    </div>
  );
}
