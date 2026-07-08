"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export function GenerateReportButton() {
  const router = useRouter();
  const [type, setType] = useState("weekly");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="report-type" className="sr-only">Jenis report</label>
      <Select id="report-type" value={type} onChange={(e) => setType(e.target.value)} className="h-10 w-44">
        <option value="daily">Daily Brief</option>
        <option value="weekly">Weekly Insight</option>
        <option value="monthly">Monthly Brand Health</option>
      </Select>
      <Button onClick={generate} disabled={loading}>
        <FilePlus2 className="h-4 w-4" aria-hidden="true" />
        {loading ? "Menyusun..." : "Generate report"}
      </Button>
    </div>
  );
}
