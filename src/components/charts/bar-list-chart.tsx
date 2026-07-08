"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface BarListItem {
  label: string;
  count: number;
}

/** Horizontal bar chart generik untuk distribusi (platform, mood, isu). */
export function BarListChart({ data, color = "#128C7E", height = 240 }: { data: BarListItem[]; color?: string; height?: number }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data.</p>;
  }
  return (
    <div style={{ height }} role="img" aria-label={`Distribusi: ${data.map((d) => `${d.label} ${d.count}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 40% 90%)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
