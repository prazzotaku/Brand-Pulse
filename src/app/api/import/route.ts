import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBrand, toBrandContext } from "@/lib/brand";
import { ingestMentions } from "@/lib/pipeline";
import type { RawMention, SourcePlatform, SourceType } from "@/lib/types";

const PLATFORMS: SourcePlatform[] = ["facebook", "instagram", "x", "threads", "tiktok", "news", "rss", "manual"];
const TYPES: SourceType[] = ["post", "comment", "article", "video", "caption", "reply"];

interface ImportRow {
  sourcePlatform?: string;
  sourceType?: string;
  externalId?: string;
  url?: string;
  authorName?: string;
  authorHandle?: string;
  title?: string;
  content?: string;
  publishedAt?: string;
  likeCount?: string | number;
  commentCount?: string | number;
  shareCount?: string | number;
  viewCount?: string | number;
  language?: string;
  mediaTier?: string;
}

/** Parser CSV sederhana (mendukung kolom ber-quote dan koma di dalam quote). */
function parseCsv(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuote = false;
        else cur += ch;
      } else if (ch === '"') inQuote = true;
      else if (ch === ",") { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    return cells;
  };
  const headers = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row as ImportRow;
  });
}

function rowToRawMention(row: ImportRow, index: number): RawMention | null {
  if (!row.content) return null;
  const platform = PLATFORMS.includes(row.sourcePlatform as SourcePlatform)
    ? (row.sourcePlatform as SourcePlatform)
    : "manual";
  const sourceType = TYPES.includes(row.sourceType as SourceType)
    ? (row.sourceType as SourceType)
    : "post";
  const likes = Number(row.likeCount) || 0;
  const comments = Number(row.commentCount) || 0;
  const shares = Number(row.shareCount) || 0;
  return {
    origin: "import",
    sourcePlatform: platform,
    sourceType,
    externalId: row.externalId || `import-${Date.now()}-${index}`,
    url: row.url ?? "",
    authorName: row.authorName ?? "",
    authorHandle: row.authorHandle ?? "",
    title: row.title ?? "",
    content: row.content,
    publishedAt: row.publishedAt ? new Date(row.publishedAt) : new Date(),
    engagementCount: likes + comments + shares,
    likeCount: likes,
    commentCount: comments,
    shareCount: shares,
    viewCount: Number(row.viewCount) || 0,
    language: row.language || "id",
    mediaTier: (row.mediaTier as RawMention["mediaTier"]) ?? "",
    rawPayload: { importedRow: row as Record<string, unknown> },
  };
}

/**
 * POST /api/import — manual import CSV atau JSON.
 * multipart/form-data dengan field "file" (.csv/.json),
 * atau application/json dengan body { rows: ImportRow[] }.
 */
export async function POST(req: NextRequest) {
  const brand = await getActiveBrand();
  const brandCtx = toBrandContext(brand);

  let rows: ImportRow[] = [];
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "File tidak ditemukan." }, { status: 400 });
    }
    const text = await file.text();
    if (file.name.endsWith(".json")) {
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed : parsed.rows ?? [];
    } else {
      rows = parseCsv(text);
    }
  } else {
    const body = await req.json().catch(() => ({}));
    rows = Array.isArray(body) ? body : body.rows ?? [];
  }

  const raws = rows
    .map((row, i) => rowToRawMention(row, i))
    .filter((r): r is RawMention => r !== null);

  if (raws.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Tidak ada baris valid. Minimal butuh kolom 'content'." },
      { status: 400 }
    );
  }

  const manualSource = await prisma.source.findFirst({
    where: { brandId: brand.id, platform: "manual" },
  });
  const result = await ingestMentions(brand.id, raws, brandCtx, manualSource?.id);

  return NextResponse.json({ ok: true, ...result });
}
