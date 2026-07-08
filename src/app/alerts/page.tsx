import { AlertTriangle, Bell, ShieldAlert, TrendingDown, Users, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/shared/badges";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TYPE_META: Record<string, { label: string; icon: typeof Bell }> = {
  negative_spike: { label: "Negative Spike", icon: TrendingDown },
  media_risk: { label: "Media Risk", icon: AlertTriangle },
  crisis_keyword: { label: "Crisis Keyword", icon: ShieldAlert },
  competitor_spike: { label: "Competitor Spike", icon: Users },
  campaign_drop: { label: "Campaign Drop", icon: TrendingDown },
  low_confidence: { label: "Low Confidence", icon: HelpCircle },
};

export default async function AlertsPage() {
  const brand = await getActiveBrand();
  const alerts = await prisma.alert.findMany({
    where: { brandId: brand.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const open = alerts.filter((a) => a.status === "open").length;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          {open} alert terbuka dari {alerts.length} total. Alert baru dibuat otomatis saat refresh
          mendeteksi lonjakan negatif atau keyword sensitif.
        </p>
      </div>

      <div className="space-y-3">
        {alerts.map((a) => {
          const meta = TYPE_META[a.type] ?? { label: a.type, icon: Bell };
          const Icon = meta.icon;
          return (
            <Card key={a.id} className={a.severity === "critical" ? "border-red-300" : ""}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Badge variant="outline">{meta.label}</Badge>
                  <RiskBadge impact={a.severity} />
                  <Badge variant={a.status === "open" ? "default" : "secondary"} className="capitalize">
                    {a.status}
                  </Badge>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {formatDateTime(a.createdAt)}
                  </span>
                </div>
                <CardTitle className="text-base">{a.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{a.description}</p>
              </CardContent>
            </Card>
          );
        })}
        {alerts.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Tidak ada alert. Kondisi brand aman.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
