"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { SOURCE_TYPES, SOURCE_TYPE_LABELS } from "@/lib/content-breakdown";

const TYPE_COLORS: Record<string, string> = {
  post: "#128C7E",
  comment: "#25D366",
  article: "#075E54",
  video: "#34B7F1",
  caption: "#66BB6A",
  reply: "#00A884",
  thread: "#D97706",
};

type Row = Record<string, string | number>; // { platform: label, [type]: count }

/** Bar chart bertumpuk: platform di sumbu X, segmen = tipe konten. */
export function StackedTypeChart({ data, height = 300 }: { data: Row[]; height?: number }) {
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data pada filter ini.</p>;
  }
  return (
    <div style={{ height }} role="img" aria-label="Komposisi tipe konten per platform">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 40% 90%)" vertical={false} />
          <XAxis dataKey="platform" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend formatter={(v: string) => <span className="text-xs">{SOURCE_TYPE_LABELS[v] ?? v}</span>} />
          {SOURCE_TYPES.map((t) => (
            <Bar key={t} dataKey={t} stackId="a" fill={TYPE_COLORS[t]} radius={[0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
