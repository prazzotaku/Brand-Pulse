import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { getConnectors } from "@/lib/connectors/registry";

/** POST /api/accounts — tambah source account (own/competitor) per platform. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const platform = String(body.platform ?? "").trim();
  // Normalisasi handle: hapus "@" di depan dan URL prefix bila user paste link
  // profil, supaya connector (yang membentuk URL dari handle) tidak dapat "@@user".
  const rawHandle = String(body.handle ?? "").trim();
  const handle = rawHandle.replace(/^https?:\/\/(www\.)?[^/]+\//i, "").replace(/^@+/, "").replace(/\/+$/, "");
  if (!platform || !handle) {
    return NextResponse.json({ ok: false, error: "Butuh 'platform' dan 'handle'." }, { status: 400 });
  }

  const brand = await getActiveBrand();
  const account = await prisma.sourceAccount.upsert({
    where: { brandId_platform_handle: { brandId: brand.id, platform, handle } },
    create: {
      brandId: brand.id,
      platform,
      handle,
      displayName: String(body.displayName ?? handle),
      accountType: body.accountType === "competitor" ? "competitor" : "own",
      url: String(body.url ?? ""),
    },
    update: { isActive: true },
  });
  return NextResponse.json({ ok: true, account });
}

/**
 * PATCH /api/accounts — tarik metrik engagement semua akun aktif dari
 * connector yang mendukung fetchEngagement (mis. YouTube). Akun pada
 * platform yang belum terkonfigurasi dilewati dengan catatan pending_auth.
 */
export async function PATCH() {
  const brand = await getActiveBrand();
  const accounts = await prisma.sourceAccount.findMany({
    where: { brandId: brand.id, isActive: true },
  });
  const connectors = new Map(getConnectors().map((c) => [c.meta.platform, c]));

  let fetched = 0;
  const skipped: string[] = [];
  for (const acc of accounts) {
    const connector = connectors.get(acc.platform as never);
    if (!connector) {
      skipped.push(`${acc.platform}/${acc.handle}: connector tidak tersedia`);
      continue;
    }
    try {
      const snap = await connector.fetchEngagement({ platform: acc.platform, handle: acc.handle });
      if (!snap) {
        skipped.push(`${acc.platform}/${acc.handle}: pending_auth atau tidak didukung`);
        continue;
      }
      const totalEngagement = (snap.totalLikes ?? 0) + (snap.totalComments ?? 0) + (snap.totalShares ?? 0);
      const followers = snap.followerCount ?? snap.subscriberCount ?? 0;
      await prisma.accountMetric.create({
        data: {
          sourceAccountId: acc.id,
          followerCount: snap.followerCount ?? 0,
          subscriberCount: snap.subscriberCount ?? 0,
          postCount: snap.postCount ?? 0,
          totalLikes: snap.totalLikes ?? 0,
          totalComments: snap.totalComments ?? 0,
          totalShares: snap.totalShares ?? 0,
          totalViews: snap.totalViews ?? 0,
          totalSaves: snap.totalSaves ?? 0,
          engagementRateByFollowers: followers > 0 ? Number(((totalEngagement / followers) * 100).toFixed(2)) : 0,
          engagementRateByViews:
            (snap.totalViews ?? 0) > 0 ? Number(((totalEngagement / snap.totalViews!) * 100).toFixed(2)) : 0,
          averageEngagementPerPost:
            (snap.postCount ?? 0) > 0 ? Number((totalEngagement / snap.postCount!).toFixed(1)) : 0,
          averageViewsPerPost:
            (snap.postCount ?? 0) > 0 && (snap.totalViews ?? 0) > 0
              ? Number((snap.totalViews! / snap.postCount!).toFixed(1))
              : 0,
          rawMetrics: JSON.stringify(snap.rawMetrics ?? {}),
        },
      });
      fetched++;
    } catch (err) {
      skipped.push(`${acc.platform}/${acc.handle}: ${String(err).slice(0, 120)}`);
    }
  }

  return NextResponse.json({ ok: true, fetched, skipped });
}
