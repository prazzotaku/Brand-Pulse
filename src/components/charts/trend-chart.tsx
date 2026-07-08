"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { SENTIMENT_CHART_COLORS } from "@/lib/constants";
import { GRANULARITIES } from "@/lib/period";
import type { TrendPoint } from "@/lib/trend";

/**
 * Trendline sentimen dari waktu ke waktu dengan selektor granularity
 * (Per Jam / Per Hari / Per Bulan / Per Tahun). Granularity disimpan di URL
 * (`gran`) sehingga tetap konsisten dengan filter platform/sentimen/periode.
 */
export function TrendChart({
  data,
  granularity,
  height = 300,
}: {
  data: TrendPoint[];
  granularity: string;
  height?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setGran(g: string) {
    const next = new URLSearchParams(params.toString());
    next.set("gran", g);
    router.push(`${pathname}?${next.toString()}`);
  }

  const hasData = data.some((d) => d.total > 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Granularity:</span>
        {GRANULARITIES.map((g) => (
          <button
            key={g.value}
            type="button"
            onClick={() => setGran(g.value)}
            aria-pressed={granularity === g.value}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              granularity === g.value
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {!hasData ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Belum ada data pada rentang & filter ini.
        </p>
      ) : (
        <div style={{ height }} role="img" aria-label="Trendline sentimen dari waktu ke waktu">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 40% 90%)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend formatter={(v: string) => <span className="text-xs capitalize">{v}</span>} />
              <Line type="monotone" dataKey="positive" stroke={SENTIMENT_CHART_COLORS.positive} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="negative" stroke={SENTIMENT_CHART_COLORS.negative} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="neutral" stroke={SENTIMENT_CHART_COLORS.neutral} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="mixed" stroke={SENTIMENT_CHART_COLORS.mixed} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
