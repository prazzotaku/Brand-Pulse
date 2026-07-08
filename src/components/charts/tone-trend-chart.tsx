"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { SENTIMENT_CHART_COLORS } from "@/lib/constants";

interface ToneTrendPoint {
  date: string;
  positive: number;
  negative: number;
  neutral: number;
  mixed: number;
}

export function ToneTrendChart({ data }: { data: ToneTrendPoint[] }) {
  return (
    <div className="h-64" role="img" aria-label="Grafik tren tone per sentiment pada periode terpilih">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 40% 90%)" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Legend formatter={(v: string) => <span className="text-xs capitalize">{v}</span>} />
          <Area type="monotone" dataKey="positive" stackId="1" stroke={SENTIMENT_CHART_COLORS.positive} fill={SENTIMENT_CHART_COLORS.positive} fillOpacity={0.5} />
          <Area type="monotone" dataKey="neutral" stackId="1" stroke={SENTIMENT_CHART_COLORS.neutral} fill={SENTIMENT_CHART_COLORS.neutral} fillOpacity={0.4} />
          <Area type="monotone" dataKey="mixed" stackId="1" stroke={SENTIMENT_CHART_COLORS.mixed} fill={SENTIMENT_CHART_COLORS.mixed} fillOpacity={0.4} />
          <Area type="monotone" dataKey="negative" stackId="1" stroke={SENTIMENT_CHART_COLORS.negative} fill={SENTIMENT_CHART_COLORS.negative} fillOpacity={0.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
