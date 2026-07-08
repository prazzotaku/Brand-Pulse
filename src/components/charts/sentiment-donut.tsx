"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { SENTIMENT_CHART_COLORS } from "@/lib/constants";
import type { Sentiment } from "@/lib/types";

export function SentimentDonut({ split }: { split: Record<Sentiment, number> }) {
  const data = (Object.entries(split) as [Sentiment, number][])
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data sentiment.</p>;
  }

  return (
    <div className="h-56" role="img" aria-label={`Sentiment split: ${data.map((d) => `${d.name} ${d.value}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
            {data.map((d) => (
              <Cell key={d.name} fill={SENTIMENT_CHART_COLORS[d.name]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend formatter={(v: string) => <span className="text-xs capitalize">{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
