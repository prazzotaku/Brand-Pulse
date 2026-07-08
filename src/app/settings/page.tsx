import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { parseJsonArray } from "@/lib/types";

export const dynamic = "force-dynamic";

function splitList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const brand = await getActiveBrand();

  async function updateBrand(formData: FormData) {
    "use server";
    const current = await prisma.brand.findFirstOrThrow({ orderBy: { createdAt: "asc" } });

    await prisma.brand.update({
      where: { id: current.id },
      data: {
        name: String(formData.get("name") ?? current.name),
        aliases: JSON.stringify(splitList(formData.get("aliases"))),
        competitors: JSON.stringify(splitList(formData.get("competitors"))),
        products: JSON.stringify(splitList(formData.get("products"))),
        brandVoice: String(formData.get("brandVoice") ?? ""),
        prohibitedClaims: JSON.stringify(splitList(formData.get("prohibitedClaims"))),
        targetAudience: String(formData.get("targetAudience") ?? ""),
      },
    });

    // Sinkronkan keyword include/exclude/issue dari form.
    await prisma.brandKeyword.deleteMany({ where: { brandId: current.id } });
    const keywordSets: [string, string[]][] = [
      ["include", splitList(formData.get("includeKeywords"))],
      ["exclude", splitList(formData.get("excludeKeywords"))],
      ["issue", splitList(formData.get("issueKeywords"))],
    ];
    for (const [type, list] of keywordSets) {
      if (list.length) {
        await prisma.brandKeyword.createMany({
          data: list.map((keyword) => ({ brandId: current.id, keyword, type })),
        });
      }
    }
    revalidatePath("/settings");
    revalidatePath("/", "layout");
    // Redirect dengan penanda sukses agar user melihat konfirmasi tersimpan.
    redirect("/settings?saved=1");
  }

  const kw = (type: string) =>
    brand.keywords.filter((k) => k.type === type).map((k) => k.keyword).join(", ");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Brand knowledge base — semua analisis AI mengacu ke konteks ini agar output tidak generik.
        </p>
      </div>

      {searchParams.saved === "1" && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Perubahan tersimpan. Nama brand di bar atas, analisis AI, dan query Google News kini memakai
          data terbaru — tekan Reload now untuk menarik berita brand ini.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Brand Setup</CardTitle>
          <CardDescription>Pisahkan beberapa nilai dengan koma.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateBrand} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Brand name <span className="text-destructive">*</span></Label>
              <Input id="name" name="name" required defaultValue={brand.name} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="aliases">Aliases</Label>
                <Input id="aliases" name="aliases" defaultValue={parseJsonArray(brand.aliases).join(", ")} placeholder="Bank DKI, JakOne" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="competitors">Competitors</Label>
                <Input id="competitors" name="competitors" defaultValue={parseJsonArray(brand.competitors).join(", ")} placeholder="BCA, Livin, Jago" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="products">Product keywords</Label>
              <Input id="products" name="products" defaultValue={parseJsonArray(brand.products).join(", ")} placeholder="mobile banking, kartu, QRIS" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="includeKeywords">Include keywords</Label>
                <Input id="includeKeywords" name="includeKeywords" defaultValue={kw("include")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="excludeKeywords">Exclude keywords</Label>
                <Input id="excludeKeywords" name="excludeKeywords" defaultValue={kw("exclude")} placeholder="lowongan, loker" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issueKeywords">Issue keywords (dipantau ketat)</Label>
              <Input id="issueKeywords" name="issueKeywords" defaultValue={kw("issue")} placeholder="error, gagal login, penipuan" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brandVoice">Brand voice</Label>
              <Input id="brandVoice" name="brandVoice" defaultValue={brand.brandVoice} placeholder="Profesional, hangat, solutif" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prohibitedClaims">Prohibited claims (AI tidak boleh menyarankan)</Label>
              <Input id="prohibitedClaims" name="prohibitedClaims" defaultValue={parseJsonArray(brand.prohibitedClaims).join(", ")} placeholder="nomor 1, pasti untung" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="targetAudience">Target audience</Label>
              <Textarea id="targetAudience" name="targetAudience" defaultValue={brand.targetAudience} />
            </div>
            <Button type="submit">Simpan perubahan</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI & Autentikasi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">AI provider:</strong> diatur lewat env{" "}
            <code className="font-mono">AI_PROVIDER</code> (<code className="font-mono">mock</code> tanpa API key,{" "}
            <code className="font-mono">anthropic</code> dengan <code className="font-mono">ANTHROPIC_API_KEY</code>).
            Provider lain tinggal implement interface <code className="font-mono">AIProvider</code>.
          </p>
          <p>
            <strong className="text-foreground">Basic auth:</strong> aktifkan dengan{" "}
            <code className="font-mono">BASIC_AUTH_ENABLED=true</code> di <code className="font-mono">.env</code>.
            Struktur middleware siap diganti NextAuth pada fase berikutnya.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
