/**
 * Resolusi periode analisis — dipakai lintas halaman agar pengambil keputusan
 * bisa melihat data per hari, minggu, bulan, atau tahun:
 *   ?range=24h|7d|30d|90d|1y|all   → preset relatif
 *   ?month=2026-01                 → satu bulan kalender (bucket harian)
 *   ?year=2026                     → satu tahun kalender (bucket bulanan)
 */

const DAY = 24 * 60 * 60 * 1000;

export interface PeriodSearchParams {
  range?: string;
  month?: string;
  year?: string;
}

export type PeriodBucket = "hour" | "day" | "week" | "month";

export interface ResolvedPeriod {
  from: Date | null; // null = tanpa batas bawah (semua waktu)
  to: Date;
  label: string;
  bucket: PeriodBucket;
}

const PRESETS: Record<string, { ms: number | null; label: string; bucket: PeriodBucket }> = {
  "24h": { ms: DAY, label: "24 jam terakhir", bucket: "hour" },
  "7d": { ms: 7 * DAY, label: "7 hari terakhir", bucket: "day" },
  "30d": { ms: 30 * DAY, label: "30 hari terakhir", bucket: "day" },
  "90d": { ms: 90 * DAY, label: "90 hari terakhir", bucket: "week" },
  "1y": { ms: 365 * DAY, label: "1 tahun terakhir", bucket: "month" },
  all: { ms: null, label: "Semua waktu", bucket: "month" },
};

export function resolvePeriod(p: PeriodSearchParams): ResolvedPeriod {
  if (p.month && /^\d{4}-\d{2}$/.test(p.month)) {
    const [y, m] = p.month.split("-").map(Number);
    const from = new Date(y, m - 1, 1);
    return {
      from,
      to: new Date(y, m, 1),
      label: from.toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
      bucket: "day",
    };
  }
  if (p.year && /^\d{4}$/.test(p.year)) {
    const y = Number(p.year);
    return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1), label: `Tahun ${y}`, bucket: "month" };
  }
  const preset = PRESETS[p.range ?? "7d"] ?? PRESETS["7d"];
  return {
    from: preset.ms ? new Date(Date.now() - preset.ms) : null,
    to: new Date(),
    label: preset.label,
    bucket: preset.bucket,
  };
}

/** Prisma where clause untuk publishedAt sesuai periode. */
export function periodWhere(period: ResolvedPeriod): { gte?: Date; lte: Date } {
  return { ...(period.from ? { gte: period.from } : {}), lte: period.to };
}

export interface TimeBucket {
  start: Date;
  end: Date;
  label: string;
}

/** Granularity trendline eksplisit yang bisa dipilih user. */
export type Granularity = "hour" | "day" | "month" | "year";

export const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "hour", label: "Per Jam" },
  { value: "day", label: "Per Hari" },
  { value: "month", label: "Per Bulan" },
  { value: "year", label: "Per Tahun" },
];

/** Pilih granularity dari URL param `gran`; default menyesuaikan periode. */
export function resolveGranularity(param: string | undefined, period: ResolvedPeriod): Granularity {
  if (param === "hour" || param === "day" || param === "month" || param === "year") return param;
  if (period.bucket === "hour") return "hour";
  if (period.bucket === "month") return "month";
  return "day"; // day / week
}

function startOfBucket(d: Date, gran: Granularity): Date {
  const x = new Date(d);
  if (gran === "hour") x.setMinutes(0, 0, 0);
  else if (gran === "day") x.setHours(0, 0, 0, 0);
  else if (gran === "month") { x.setHours(0, 0, 0, 0); x.setDate(1); }
  else { x.setHours(0, 0, 0, 0); x.setMonth(0, 1); }
  return x;
}

function nextBucket(d: Date, gran: Granularity): Date {
  const x = new Date(d);
  if (gran === "hour") x.setHours(x.getHours() + 1);
  else if (gran === "day") x.setDate(x.getDate() + 1);
  else if (gran === "month") x.setMonth(x.getMonth() + 1);
  else x.setFullYear(x.getFullYear() + 1);
  return x;
}

function bucketLabel(d: Date, gran: Granularity): string {
  if (gran === "hour") return d.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  if (gran === "day") return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  if (gran === "month") return d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
  return String(d.getFullYear());
}

/** Bangun deret bucket menurut granularity eksplisit (untuk trendline). */
export function buildBucketsByGranularity(from: Date, to: Date, gran: Granularity): TimeBucket[] {
  const buckets: TimeBucket[] = [];
  let cur = startOfBucket(from, gran);
  const CAP = 400; // batasi agar chart tidak meledak (mis. jam × 1 tahun)
  while (cur < to && buckets.length < CAP) {
    const end = nextBucket(cur, gran);
    buckets.push({ start: cur, end, label: bucketLabel(cur, gran) });
    cur = end;
  }
  return buckets;
}

/** Bangun deret bucket waktu untuk chart tren sesuai granularity periode. */
export function buildTimeBuckets(period: ResolvedPeriod, fallbackFrom: Date): TimeBucket[] {
  const from = period.from ?? fallbackFrom;
  const buckets: TimeBucket[] = [];

  if (period.bucket === "month") {
    let cur = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cur < period.to && buckets.length < 24) {
      const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      buckets.push({
        start: cur,
        end,
        label: cur.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
      });
      cur = end;
    }
    return buckets;
  }

  if (period.bucket === "hour") {
    const start = new Date(from);
    start.setMinutes(0, 0, 0);
    let cur = start;
    while (cur < period.to && buckets.length < 26) {
      const end = new Date(cur.getTime() + 60 * 60 * 1000);
      buckets.push({ start: cur, end, label: `${String(cur.getHours()).padStart(2, "0")}:00` });
      cur = end;
    }
    // Jarangkan label agar sumbu X tidak sesak (tiap 3 jam).
    return buckets.map((b, i) => (i % 3 === 0 ? b : { ...b, label: "" }));
  }

  const stepMs = period.bucket === "week" ? 7 * DAY : DAY;
  let cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  while (cur < period.to && buckets.length < 62) {
    const end = new Date(cur.getTime() + stepMs);
    buckets.push({
      start: cur,
      end,
      label: cur.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
    });
    cur = end;
  }
  return buckets;
}
