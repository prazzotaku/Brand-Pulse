"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SgNode {
  label: string;
  type: string; // brand | keyword | hashtag | competitor | slang | location | issue
  weight: number;
  sentimentScore: number; // -100..100
}

export interface SgEdge {
  source: string;
  target: string;
  count: number;
  strength: number; // 0..1
}

const TYPE_RING: Record<string, number> = {
  issue: 120, competitor: 160, slang: 160, keyword: 210, hashtag: 250, location: 250,
};
const TYPE_LABEL: Record<string, string> = {
  brand: "Brand", keyword: "Keyword", hashtag: "Hashtag", competitor: "Kompetitor",
  slang: "Slang", location: "Lokasi", issue: "Issue",
};

function nodeColor(s: number): string {
  if (s > 15) return "#059669";
  if (s < -15) return "#DC2626";
  return "#64748B";
}

/** Network graph interaktif (SVG radial): brand di tengah, node lain melingkar per tipe. */
export function SociographView({
  nodes,
  edges,
  periodLabel,
}: {
  nodes: SgNode[];
  edges: SgEdge[];
  periodLabel: string;
}) {
  const [selected, setSelected] = useState<SgNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const W = 860;
  const H = 560;
  const cx = W / 2;
  const cy = H / 2;

  const positioned = useMemo(() => {
    const brand = nodes.find((n) => n.type === "brand");
    const others = nodes.filter((n) => n.type !== "brand");
    // Kelompokkan per tipe agar ring konsisten, sebar sudut merata.
    const pos = new Map<string, { x: number; y: number; node: SgNode }>();
    if (brand) pos.set(brand.label, { x: cx, y: cy, node: brand });
    others.forEach((n, i) => {
      const angle = (i / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const ring = TYPE_RING[n.type] ?? 210;
      pos.set(n.label, {
        x: cx + Math.cos(angle) * ring,
        y: cy + Math.sin(angle) * (ring * 0.72),
        node: n,
      });
    });
    return pos;
  }, [nodes, cx, cy]);

  const maxWeight = Math.max(...nodes.map((n) => n.weight), 1);
  const radius = (w: number) => 7 + Math.sqrt(w / maxWeight) * 16;

  const relatedEdges = selected
    ? edges.filter((e) => e.source === selected.label || e.target === selected.label)
    : [];

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    download("sociograph.json", JSON.stringify({ periodLabel, nodes, edges }, null, 2), "application/json");
  }
  function exportCsv() {
    const lines = ["source,target,coOccurrenceCount,strength"];
    edges.forEach((e) => lines.push(`${e.source},${e.target},${e.count},${e.strength.toFixed(3)}`));
    download("sociograph-edges.csv", lines.join("\n"), "text/csv");
  }
  async function saveSnapshot() {
    setSaving(true);
    try {
      const res = await fetch("/api/sociograph", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodes, edges, periodLabel }),
      });
      const data = await res.json();
      setSavedMsg(res.ok ? `Snapshot tersimpan (${data.nodeCount} node, ${data.edgeCount} edge).` : "Gagal menyimpan snapshot.");
    } finally {
      setSaving(false);
    }
  }

  if (nodes.length <= 1) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Belum cukup data untuk membangun graph pada periode/filter ini.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={exportJson}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> JSON
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV
        </Button>
        <Button size="sm" variant="outline" onClick={saveSnapshot} disabled={saving}>
          <Save className="h-3.5 w-3.5" aria-hidden="true" /> {saving ? "Menyimpan..." : "Simpan snapshot"}
        </Button>
        {savedMsg && <span className="text-xs text-muted-foreground" aria-live="polite">{savedMsg}</span>}
        <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> positif</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> netral</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-600" /> negatif</span>
        </span>
      </div>

      <div className="overflow-auto rounded-lg border bg-card">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[700px]" role="img" aria-label="Sociograph hubungan keyword dengan brand">
          {/* Edges */}
          {edges.map((e, i) => {
            const a = positioned.get(e.source);
            const b = positioned.get(e.target);
            if (!a || !b) return null;
            const highlighted = selected && (e.source === selected.label || e.target === selected.label);
            return (
              <line
                key={i}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={highlighted ? "#128C7E" : "#CBD5E1"}
                strokeWidth={0.5 + e.strength * 4}
                strokeOpacity={selected && !highlighted ? 0.15 : 0.6}
              />
            );
          })}
          {/* Nodes */}
          {[...positioned.values()].map(({ x, y, node }) => {
            const r = node.type === "brand" ? 26 : radius(node.weight);
            const dimmed = selected && selected.label !== node.label &&
              !relatedEdges.some((e) => e.source === node.label || e.target === node.label);
            return (
              <g
                key={node.label}
                transform={`translate(${x},${y})`}
                opacity={dimmed ? 0.25 : 1}
                onClick={() => setSelected(selected?.label === node.label ? null : node)}
                className="cursor-pointer"
              >
                <circle
                  r={r}
                  fill={node.type === "brand" ? "#075E54" : nodeColor(node.sentimentScore)}
                  fillOpacity={node.type === "brand" ? 1 : 0.85}
                  stroke={selected?.label === node.label ? "#D97706" : "white"}
                  strokeWidth={selected?.label === node.label ? 3 : 1.5}
                />
                <title>{`${TYPE_LABEL[node.type] ?? node.type}: ${node.label} — ${node.weight}x, sentiment ${node.sentimentScore}`}</title>
                <text
                  y={r + 12}
                  textAnchor="middle"
                  className="select-none"
                  fontSize={node.type === "brand" ? 13 : 10.5}
                  fontWeight={node.type === "brand" ? 700 : 500}
                  fill="currentColor"
                >
                  {node.label.length > 16 ? `${node.label.slice(0, 15)}…` : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selected && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">
                {TYPE_LABEL[selected.type] ?? selected.type}: <span className="text-primary">{selected.label}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Muncul {selected.weight}× · sentiment rata-rata {selected.sentimentScore} ·{" "}
                {relatedEdges.length} hubungan. Hubungan terkuat:{" "}
                {relatedEdges
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 4)
                  .map((e) => (e.source === selected.label ? e.target : e.source))
                  .join(", ") || "-"}
              </p>
            </div>
            <Link
              href={`/mentions?q=${encodeURIComponent(selected.label.replace(/^#/, ""))}&range=all`}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              Lihat mention terkait →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
