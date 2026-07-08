"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const PROVIDER_COLORS: Record<string, string> = {
  gemini: "oklch(0.65 0.18 250)",
  deepseek: "oklch(0.7 0.19 145)",
  anthropic: "oklch(0.68 0.19 40)",
};

interface DailyPoint {
  label: string;
  total: number;
  byProvider: Record<string, number>;
}

/** Tren token AI 14 hari terakhir, ditumpuk per provider. */
export function AiUsageTrendChart({ data, providers }: { data: DailyPoint[]; providers: string[] }) {
  const flat = data.map((d) => ({ label: d.label, ...d.byProvider }));
  const hasData = data.some((d) => d.total > 0);

  if (!hasData) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Belum ada pemakaian AI tercatat 14 hari terakhir.</p>;
  }

  return (
    <div style={{ height: 260 }} role="img" aria-label="Tren pemakaian token AI 14 hari terakhir per provider">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={flat} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 40% 90%)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={16} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend formatter={(v: string) => <span className="text-xs capitalize">{v}</span>} />
          {providers.map((p) => (
            <Bar key={p} dataKey={p} stackId="tokens" fill={PROVIDER_COLORS[p] ?? "oklch(0.6 0.05 250)"} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
