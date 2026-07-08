import { prisma } from "./prisma";

const DAY = 24 * 60 * 60 * 1000;

export interface ProviderBalance {
  provider: string;
  available: boolean;
  balanceUsd: number | null;
  currency: string;
  error?: string;
}

/** Cek saldo DeepSeek live dari akun (bukan disimpan di DB — selalu real-time). */
export async function getDeepSeekBalance(): Promise<ProviderBalance | null> {
  if (!process.env.DEEPSEEK_API_KEY) return null;
  try {
    const res = await fetch("https://api.deepseek.com/user/balance", {
      headers: { authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      cache: "no-store",
    });
    if (!res.ok) return { provider: "deepseek", available: false, balanceUsd: null, currency: "USD", error: `HTTP ${res.status}` };
    const data = await res.json();
    const info = data.balance_infos?.[0];
    return {
      provider: "deepseek",
      available: Boolean(data.is_available),
      balanceUsd: info ? Number(info.total_balance) : null,
      currency: info?.currency ?? "USD",
    };
  } catch (err) {
    return { provider: "deepseek", available: false, balanceUsd: null, currency: "USD", error: String(err).slice(0, 150) };
  }
}

export interface AiUsageSummary {
  grandTotal: number;
  callsToday: number;
  byProvider: { provider: string; calls: number; promptTokens: number; completionTokens: number; totalTokens: number }[];
  byOperation: { provider: string; operation: string; calls: number; totalTokens: number }[];
  dailyTrend: { date: string; label: string; total: number; byProvider: Record<string, number> }[];
  balances: ProviderBalance[];
}

/**
 * Ringkasan pemakaian token AI: total per provider, per operasi, tren harian
 * 14 hari, dan saldo live provider berbayar (DeepSeek). Dipakai halaman
 * Token Meter (/ai-usage) dan endpoint /api/ai-usage.
 */
export async function getAiUsageSummary(): Promise<AiUsageSummary> {
  const now = Date.now();
  const since14d = new Date(now - 14 * DAY);

  const [byProvider, byOperation, recentLogs, todayCount, balance] = await Promise.all([
    prisma.aiUsageLog.groupBy({
      by: ["provider"],
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
      _count: { _all: true },
    }),
    prisma.aiUsageLog.groupBy({
      by: ["provider", "operation"],
      _sum: { totalTokens: true },
      _count: { _all: true },
      orderBy: { _sum: { totalTokens: "desc" } },
    }),
    prisma.aiUsageLog.findMany({
      where: { createdAt: { gte: since14d } },
      select: { provider: true, totalTokens: true, createdAt: true },
    }),
    prisma.aiUsageLog.count({ where: { createdAt: { gte: new Date(now - DAY) } } }),
    getDeepSeekBalance(),
  ]);

  const dayBuckets: AiUsageSummary["dailyTrend"] = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(now - i * DAY);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + DAY);
    const dayLogs = recentLogs.filter((l) => l.createdAt >= start && l.createdAt < end);
    const byProv: Record<string, number> = {};
    for (const l of dayLogs) byProv[l.provider] = (byProv[l.provider] ?? 0) + l.totalTokens;
    dayBuckets.push({
      date: start.toISOString().slice(0, 10),
      label: start.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
      total: dayLogs.reduce((a, l) => a + l.totalTokens, 0),
      byProvider: byProv,
    });
  }

  const grandTotal = byProvider.reduce((a, p) => a + (p._sum.totalTokens ?? 0), 0);

  return {
    grandTotal,
    callsToday: todayCount,
    byProvider: byProvider.map((p) => ({
      provider: p.provider,
      calls: p._count._all,
      promptTokens: p._sum.promptTokens ?? 0,
      completionTokens: p._sum.completionTokens ?? 0,
      totalTokens: p._sum.totalTokens ?? 0,
    })),
    byOperation: byOperation.map((o) => ({
      provider: o.provider,
      operation: o.operation,
      calls: o._count._all,
      totalTokens: o._sum.totalTokens ?? 0,
    })),
    dailyTrend: dayBuckets,
    balances: [balance].filter((b): b is ProviderBalance => b !== null),
  };
}
