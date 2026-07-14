import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AiUsageTrendChart } from "@/components/charts/ai-usage-trend-chart";
import { getAiUsageSummary } from "@/lib/ai-usage";
import { formatNumber, cn } from "@/lib/utils";
import { Coins, Wallet, Activity, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const PROVIDER_LABEL: Record<string, string> = {
  gemini: "Gemini",
  deepseek: "DeepSeek",
  anthropic: "Anthropic",
};

const OPERATION_LABEL: Record<string, string> = {
  analyzeMention: "Analisis Mention",
  generateContentIdeas: "Content Ideas",
  reviewHook: "Review Hook/Caption",
  generateHooks: "Generate Hook & Caption",
  summarizeReport: "Ringkasan Laporan",
};

/**
 * Token Meter — memantau pemakaian token AI (Gemini/DeepSeek/Anthropic) di seluruh
 * aplikasi, plus saldo live DeepSeek.
 */
export default async function AiUsagePage() {
  const summary = await getAiUsageSummary();
  const providers = summary.byProvider.map((p) => p.provider);
  const deepseek = summary.balances.find((b) => b.provider === "deepseek");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Token Meter</h1>
        <p className="text-sm text-muted-foreground">
          Pemakaian token AI sungguhan di seluruh aplikasi (analisis mention, content ideas,
          generate content, laporan) — hanya provider berbayar yang tercatat di sini.
        </p>
      </div>

      {/* ===== Stat cards ===== */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-tight">{formatNumber(summary.grandTotal)}</p>
              <p className="text-xs text-muted-foreground">Total token terpakai (semua waktu)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-tight">{summary.callsToday}</p>
              <p className="text-xs text-muted-foreground">Panggilan AI 24 jam terakhir</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md",
              deepseek?.available ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
            )}>
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-tight">
                {deepseek?.balanceUsd != null ? `$${deepseek.balanceUsd.toFixed(2)}` : "N/A"}
              </p>
              <p className="text-xs text-muted-foreground">
                Saldo DeepSeek {deepseek?.error ? `(gagal cek: ${deepseek.error})` : "(live)"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {deepseek && !deepseek.available && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Saldo DeepSeek tidak tersedia atau habis. Panggilan yang menargetkan provider ini akan
            gagal hingga saldo diisi ulang.
          </p>
        </div>
      )}

      {/* ===== Trend chart ===== */}
      <Card>
        <CardHeader>
          <CardTitle>Tren Pemakaian 14 Hari Terakhir</CardTitle>
          <CardDescription>Total token per hari, ditumpuk berdasarkan provider.</CardDescription>
        </CardHeader>
        <CardContent>
          <AiUsageTrendChart data={summary.dailyTrend} providers={providers} />
        </CardContent>
      </Card>

      {/* ===== By provider ===== */}
      <Card>
        <CardHeader>
          <CardTitle>Rincian per Provider</CardTitle>
          <CardDescription>Total token & jumlah panggilan sejak pertama kali tercatat.</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.byProvider.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada panggilan AI provider berbayar yang tercatat.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Panggilan</TableHead>
                  <TableHead className="text-right">Prompt Tokens</TableHead>
                  <TableHead className="text-right">Completion Tokens</TableHead>
                  <TableHead className="text-right">Total Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byProvider.map((p) => (
                  <TableRow key={p.provider}>
                    <TableCell>
                      <Badge variant="outline">{PROVIDER_LABEL[p.provider] ?? p.provider}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{p.calls}</TableCell>
                    <TableCell className="text-right">{formatNumber(p.promptTokens)}</TableCell>
                    <TableCell className="text-right">{formatNumber(p.completionTokens)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatNumber(p.totalTokens)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ===== By operation ===== */}
      <Card>
        <CardHeader>
          <CardTitle>Rincian per Fitur (Operasi AI)</CardTitle>
          <CardDescription>Fitur mana yang paling banyak memakai token — berguna untuk optimasi biaya.</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.byOperation.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fitur</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Panggilan</TableHead>
                  <TableHead className="text-right">Total Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byOperation.map((o) => (
                  <TableRow key={`${o.provider}-${o.operation}`}>
                    <TableCell className="font-medium">{OPERATION_LABEL[o.operation] ?? o.operation}</TableCell>
                    <TableCell className="text-muted-foreground">{PROVIDER_LABEL[o.provider] ?? o.provider}</TableCell>
                    <TableCell className="text-right">{o.calls}</TableCell>
                    <TableCell className="text-right font-semibold">{formatNumber(o.totalTokens)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
