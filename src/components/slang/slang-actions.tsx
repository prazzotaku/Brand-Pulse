"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SlangActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  async function setStatus(next: string) {
    setBusy(true);
    try {
      await fetch("/api/slang", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addKeyword() {
    setBusy(true);
    try {
      const res = await fetch("/api/slang", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "add_keyword" }),
      });
      if (res.ok) setAdded(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {status !== "approved" && (
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => setStatus("approved")}>
          <Check className="h-3 w-3" aria-hidden="true" /> Approve
        </Button>
      )}
      {status !== "rejected" && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => setStatus("rejected")}>
          <X className="h-3 w-3" aria-hidden="true" /> Reject
        </Button>
      )}
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy || added} onClick={addKeyword}>
        <Plus className="h-3 w-3" aria-hidden="true" /> {added ? "Ditambahkan" : "Jadikan keyword"}
      </Button>
    </div>
  );
}
