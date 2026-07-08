"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, Download, ExternalLink, Info, X, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SentimentBadge, RiskBadge, PlatformBadge, OriginBadge } from "@/components/shared/badges";
import { ISSUE_CATEGORIES } from "@/lib/constants";
import { cn, formatDateTime, formatNumber, truncate } from "@/lib/utils";

export interface SummaryCardData {
  key: string;
  label: string;
  count: number;
  /** Penjelasan sumber angka (tooltip) — dari mana angka ini dihitung. */
  tooltip: string;
}

/**
 * Tombol "More" reusable — dipasang di kartu kategori (Complaint, Question, dsb.)
 * untuk membuka drawer rincian yang sudah difilter ke kategori tersebut.
 * filterParams mis. { intent: "complaint" } atau { category: "negative" }.
 */
export function MoreButton({
  label,
  count,
  filterParams,
  queryString,
  className,
}: {
  label: string;
  count: number;
  filterParams: Record<string, string>;
  queryString: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={cn("h-7 px-2.5 text-xs", className)}
        onClick={() => setOpen(true)}
        aria-label={`Lihat semua ${count} data ${label}`}
      >
        More <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      {open && (
        <MentionDetailDrawer
          title={label}
          count={count}
          filterParams={filterParams}
          queryString={queryString}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface DrawerItem {
  id: string;
  origin: string;
  sourcePlatform: string;
  sourceType: string;
  authorName: string;
  authorHandle: string;
  content: string;
  url: string;
  publishedAt: string;
  createdAt: string;
  lastSeenAt: string;
  seenCount: number;
  isDuplicate: boolean;
  engagementCount: number;
  analysis: {
    sentiment: string;
    issueCategory: string;
    intent: string;
    emotion: string;
    riskScore: number;
    relevanceScore: number;
    confidenceScore: number;
    reputationalImpact: string;
    isRelevant: boolean;
  } | null;
}

const PAGE_SIZE = 20;

/**
 * Summary cards Social Listening yang traceable: setiap angka dihitung dari
 * query yang sama dengan drawer detail, punya tooltip sumber angka, dan tombol
 * "More" untuk membuktikan rinciannya satu per satu.
 */
export function SummarySection({
  cards,
  queryString,
}: {
  cards: SummaryCardData[];
  queryString: string;
}) {
  const [active, setActive] = useState<SummaryCardData | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.key} className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-1">
              <p className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                {card.label}
                <span title={card.tooltip} aria-label={card.tooltip} className="cursor-help">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </p>
            </div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <span className="font-mono text-2xl font-bold">{card.count}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setActive(card)}
                aria-label={`Lihat rincian ${card.count} data ${card.label}`}
              >
                More
              </Button>
            </div>
          </div>
        ))}
      </div>

      {active && (
        <MentionDetailDrawer
          title={active.label}
          count={active.count}
          filterParams={{ category: active.key }}
          queryString={queryString}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}

function MentionDetailDrawer({
  title,
  count,
  filterParams,
  queryString,
  onClose,
}: {
  title: string;
  count: number;
  filterParams: Record<string, string>;
  queryString: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [items, setItems] = useState<DrawerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // Setelah user melakukan koreksi (mark irrelevant dsb), angka card di halaman
  // menjadi stale sampai router.refresh — skip mismatch check setelah aksi.
  const [expectedCount, setExpectedCount] = useState<number | null>(count);
  // Filter lanjutan lokal drawer
  const [localPlatform, setLocalPlatform] = useState("");
  const [localMinRisk, setLocalMinRisk] = useState("");

  const filterKey = JSON.stringify(filterParams);
  const buildQuery = useCallback(
    (extra: Record<string, string> = {}) => {
      const qs = new URLSearchParams(queryString);
      qs.set("social", "1");
      for (const [k, v] of Object.entries(filterParams)) qs.set(k, v);
      if (localPlatform) qs.set("platform", localPlatform);
      if (localMinRisk) qs.set("minRisk", localMinRisk);
      for (const [k, v] of Object.entries(extra)) qs.set(k, v);
      return qs.toString();
    },
    [queryString, filterKey, localPlatform, localMinRisk] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mentions?${buildQuery({ page: String(page), pageSize: String(PAGE_SIZE) })}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat data");
      setTotal(data.total);
      setItems(data.items);
      const localFilterActive = localPlatform !== "" || localMinRisk !== "";
      if (!localFilterActive && expectedCount !== null && data.total !== expectedCount) {
        console.warn(
          `Aggregate mismatch detected: ${title} card count (${expectedCount}) does not match detail query count (${data.total}).`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [buildQuery, page, expectedCount, title, localPlatform, localMinRisk]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function patchMention(id: string, body: Record<string, string>) {
    setBusy(true);
    try {
      await fetch(`/api/mentions/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setExpectedCount(null); // angka card akan berubah — jangan flag mismatch
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function bulkMarkIrrelevant() {
    setBusy(true);
    try {
      for (const id of Array.from(selected)) {
        await fetch(`/api/mentions/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "mark_irrelevant" }),
        });
      }
      setSelected(new Set());
      setExpectedCount(null);
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const localFilterActive = localPlatform !== "" || localMinRisk !== "";
  const mismatch =
    !loading && !localFilterActive && expectedCount !== null && total !== null && total !== expectedCount;
  const emptyMismatch = !loading && total === 0 && expectedCount !== null && expectedCount > 0 && !localFilterActive;
  const totalPages = total ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
  const showFrom = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const showTo = total ? Math.min(page * PAGE_SIZE, total) : 0;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Rincian ${title}`}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-6xl flex-col bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b bg-card px-5 py-4">
          <div>
            <h2 className="text-lg font-bold capitalize">{title}</h2>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {loading
                ? "Memuat…"
                : total !== null
                  ? `Menampilkan ${showFrom}–${showTo} dari ${total} data`
                  : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/api/mentions?${buildQuery({ format: "csv" })}`} download>
              <Button size="sm" variant="outline">
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV
              </Button>
            </a>
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Tutup rincian">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Peringatan integritas data */}
        {mismatch && (
          <div className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-5 py-2.5 text-sm text-amber-900" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>Aggregate mismatch terdeteksi:</strong> angka card ({expectedCount}) tidak sama dengan
              hasil query detail ({total}). Data mungkin baru berubah — reload halaman untuk sinkronisasi.
            </span>
          </div>
        )}
        {emptyMismatch && (
          <div className="flex items-start gap-2 border-b border-red-300 bg-red-50 px-5 py-2.5 text-sm text-red-900" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Data detail tidak ditemukan untuk angka ini. Kemungkinan aggregate cache belum sinkron.
              Silakan reload ulang atau cek crawl job di Audit Panel.
            </span>
          </div>
        )}

        {/* Filter lanjutan drawer */}
        <div className="flex flex-wrap items-center gap-2 border-b bg-card px-5 py-2.5">
          <span className="text-xs font-medium text-muted-foreground">Persempit:</span>
          <label htmlFor="drawer-platform" className="sr-only">Filter platform</label>
          <Select
            id="drawer-platform"
            value={localPlatform}
            onChange={(e) => { setLocalPlatform(e.target.value); setPage(1); }}
            className="h-8 w-36 text-xs"
          >
            <option value="">Semua platform</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="x">X / Twitter</option>
            <option value="threads">Threads</option>
            <option value="tiktok">TikTok</option>
          </Select>
          <label htmlFor="drawer-minrisk" className="sr-only">Minimal risk score</label>
          <Select
            id="drawer-minrisk"
            value={localMinRisk}
            onChange={(e) => { setLocalMinRisk(e.target.value); setPage(1); }}
            className="h-8 w-36 text-xs"
          >
            <option value="">Semua risk</option>
            <option value="25">Risk ≥ 25</option>
            <option value="50">Risk ≥ 50</option>
            <option value="75">Risk ≥ 75</option>
          </Select>
          {localFilterActive && (
            <span className="text-xs text-muted-foreground">
              (filter lokal aktif — total berbeda dari angka card itu normal)
            </span>
          )}
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" className="ml-auto h-8 text-xs" disabled={busy} onClick={bulkMarkIrrelevant}>
              Tandai tidak relevan ({selected.size})
            </Button>
          )}
        </div>

        {/* Tabel detail — satu kontainer scroll untuk dua arah: scrollbar
            horizontal selalu terlihat di bawah area drawer tanpa harus
            scroll ke akhir data, dan header tabel tetap menempel di atas. */}
        <div className="flex-1 overflow-auto overscroll-contain [&>div]:!overflow-visible">
          {error && (
            <p className="p-6 text-sm font-medium text-destructive" role="alert">{error}</p>
          )}
          {!error && !loading && items.length === 0 && !emptyMismatch && (
            <p className="p-8 text-center text-sm text-muted-foreground">Tidak ada data untuk kombinasi filter ini.</p>
          )}
          {!error && items.length > 0 && (
            <Table className="min-w-[1450px]">
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <TableRow>
                  <TableHead>
                    <input
                      type="checkbox"
                      aria-label="Pilih semua di halaman ini"
                      checked={items.length > 0 && items.every((i) => selected.has(i.id))}
                      onChange={(e) => {
                        const next = new Set(selected);
                        items.forEach((i) => (e.target.checked ? next.add(i.id) : next.delete(i.id)));
                        setSelected(next);
                      }}
                    />
                  </TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Source / Account</TableHead>
                  <TableHead className="min-w-[220px]">Content</TableHead>
                  <TableHead>Sentiment</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Emosi</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Relev.</TableHead>
                  <TableHead>Conf.</TableHead>
                  <TableHead>Eng.</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Collected</TableHead>
                  <TableHead>Duplikasi</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((m) => (
                  <TableRow key={m.id} className={cn(m.analysis?.isRelevant === false && "opacity-50")}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Pilih mention dari ${m.authorName}`}
                        checked={selected.has(m.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(m.id);
                          else next.delete(m.id);
                          setSelected(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <PlatformBadge platform={m.sourcePlatform} />
                        <OriginBadge origin={m.origin} />
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[130px]">
                      <p className="truncate text-sm font-medium">{m.authorName || "-"}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.authorHandle}</p>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <p className="text-sm" title={m.content}>{truncate(m.content, 110)}</p>
                    </TableCell>
                    <TableCell>{m.analysis ? <SentimentBadge sentiment={m.analysis.sentiment} /> : <span className="text-xs text-muted-foreground">belum</span>}</TableCell>
                    <TableCell className="text-sm capitalize">{m.analysis?.issueCategory || "-"}</TableCell>
                    <TableCell className="text-sm capitalize">{m.analysis?.emotion || "-"}</TableCell>
                    <TableCell>{m.analysis && <RiskBadge impact={m.analysis.reputationalImpact} score={m.analysis.riskScore} />}</TableCell>
                    <TableCell className="font-mono text-sm">{m.analysis?.relevanceScore ?? "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{m.analysis?.confidenceScore ?? "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{formatNumber(m.engagementCount)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{formatDateTime(m.publishedAt)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{formatDateTime(m.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {m.isDuplicate ? (
                        <span className="font-medium text-amber-700">Duplikat</span>
                      ) : m.seenCount > 1 ? (
                        <span title={`Terakhir terlihat ${formatDateTime(m.lastSeenAt)}`}>
                          Unik · terlihat {m.seenCount}×
                        </span>
                      ) : (
                        "Unik"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {m.url && (
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Buka sumber asli"
                            title="Buka sumber asli"
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => patchMention(m.id, { action: "save_insight" })}
                          className="rounded px-1.5 py-1 text-xs text-primary hover:bg-accent disabled:opacity-50"
                          title="Simpan sebagai insight (Content Idea)"
                        >
                          Insight
                        </button>
                        <button
                          type="button"
                          disabled={busy || m.analysis?.isRelevant === false}
                          onClick={() => patchMention(m.id, { action: "mark_irrelevant" })}
                          className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
                          title="Tandai tidak relevan"
                        >
                          Irrelevant
                        </button>
                        <label className="sr-only" htmlFor={`cat-${m.id}`}>Koreksi kategori</label>
                        <select
                          id={`cat-${m.id}`}
                          disabled={busy}
                          value=""
                          onChange={(e) => e.target.value && patchMention(m.id, { action: "correct_category", issueCategory: e.target.value })}
                          className="h-7 cursor-pointer rounded border bg-background px-1 text-xs"
                          title="Koreksi issue category"
                        >
                          <option value="">Koreksi…</option>
                          {ISSUE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t bg-card px-5 py-3">
          <p className="text-sm text-muted-foreground">
            Halaman {page} dari {totalPages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Sebelumnya
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)}>
              Berikutnya <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
