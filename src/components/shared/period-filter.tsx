"use client";

import { CalendarRange } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DATE_RANGES } from "@/lib/constants";
import { useQueryState } from "@/lib/use-query-state";

/**
 * Filter periode analisis lintas halaman — preset relatif (24 jam s.d. 1 tahun),
 * atau pilih bulan/tahun kalender spesifik (mis. "Januari 2026", "Tahun 2025").
 * State disimpan di URL sehingga bisa dibagikan ke pengambil keputusan lain.
 */
export function PeriodFilter() {
  const { params, push } = useQueryState();

  const activeMonth = params.get("month") ?? "";
  const activeYear = params.get("year") ?? "";
  const activeRange = activeMonth || activeYear ? "" : (params.get("range") ?? "7d");

  function setPeriod(kv: Record<string, string>) {
    push(kv, {
      base: "all",
      clearKeys: ["range", "month", "year"],
      resetPage: true,
    });
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <CalendarRange className="h-4 w-4" aria-hidden="true" /> Periode:
      </span>

      <label htmlFor="period-range" className="sr-only">Preset periode</label>
      <Select
        id="period-range"
        value={activeRange}
        onChange={(e) => setPeriod({ range: e.target.value })}
        className="h-9 w-44"
      >
        {activeRange === "" && <option value="">Custom (bulan/tahun)</option>}
        {DATE_RANGES.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </Select>

      <label htmlFor="period-month" className="sr-only">Pilih bulan spesifik</label>
      <Input
        id="period-month"
        type="month"
        value={activeMonth}
        onChange={(e) => setPeriod({ month: e.target.value })}
        className="h-9 w-44 cursor-pointer"
        aria-label="Analisa satu bulan kalender"
      />

      <label htmlFor="period-year" className="sr-only">Pilih tahun spesifik</label>
      <Select
        id="period-year"
        value={activeYear}
        onChange={(e) => setPeriod({ year: e.target.value })}
        className="h-9 w-36"
      >
        <option value="">Per tahun…</option>
        {years.map((y) => (
          <option key={y} value={y}>Tahun {y}</option>
        ))}
      </Select>
    </div>
  );
}
