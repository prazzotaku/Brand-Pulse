"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface VolumePoint {
  label: string;
  count: number;
}

/** Bar chart vertikal untuk volume per hari/jam. */
export function VolumeBarChart({ data, color = "#128C7E", height = 220 }: { data: VolumePoint[]; color?: string; height?: number }) {
  if (data.every((d) => d.count === 0)) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data pada periode ini.</p>;
  }
  return (
    <div style={{ height }} role="img" aria-label={`Volume: ${data.filter((d) => d.count > 0).map((d) => `${d.label} ${d.count}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 40% 90%)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
