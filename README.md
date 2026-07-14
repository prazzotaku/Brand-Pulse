# Brand Pulse OS

Dashboard AI untuk monitoring brand dari berbagai sumber publik — Facebook, Instagram, X/Twitter, Threads, TikTok, dan berita online. Mengubah mention, komentar, artikel, dan tren menjadi insight reputasi, alert, ide konten, serta review hook/caption.

## Menjalankan (dev)

```bash
npm install        # otomatis menjalankan prisma generate
npm run db:push    # buat database (SQLite dev)
npm run db:seed    # isi brand contoh "Bank Jakarta" + sumber data live
npm run dev        # buka http://localhost:3000
```

Reset data kapan pun: `npm run db:reset`.

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS, komponen gaya shadcn/ui (`src/components/ui`) |
| Chart | Recharts |
| API | Next.js API Routes (`src/app/api/*`) |
| Database | Prisma — SQLite untuk dev, **PostgreSQL/Supabase untuk produksi** |
| AI Layer | Abstraction `AIProvider` (Gemini / Anthropic / DeepSeek) |
| Auth | Basic auth via middleware (opsional), siap upgrade ke NextAuth |
| Scheduler | Client-side interval (manual/5m/30m/1h) → job pipeline server; siap naik ke Redis/BullMQ |

## Pindah ke PostgreSQL/Supabase

1. Di `prisma/schema.prisma`, ganti `provider = "sqlite"` → `provider = "postgresql"`.
2. Isi `DATABASE_URL` di `.env` dengan connection string Postgres/Supabase.
3. `npm run db:push && npm run db:seed`.

Schema sengaja ditulis portable (union types sebagai `String`, JSON sebagai string) sehingga tidak ada perubahan kode lain.

## Mengganti AI Provider

- Set `AI_PROVIDER` ke `gemini`, `anthropic`, atau `deepseek`, lalu isi API key provider yang sesuai.
- Claude: set `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` (model via `ANTHROPIC_MODEL`).
- Provider lain: implement interface `AIProvider` di `src/lib/ai/provider.ts`, daftarkan di `src/lib/ai/index.ts`.

Kontrak output analisis mengikuti PRD:

```json
{
  "isRelevant": true, "relevanceScore": 0, "sentiment": "positive|negative|neutral|mixed",
  "sentimentScore": 0, "confidenceScore": 0, "reputationalImpact": "low|medium|high|critical",
  "riskScore": 0, "issueCategory": "", "emotion": "", "intent": "",
  "summary": "", "reasoning": "", "suggestedAction": ""
}
```

## Connector & Compliance

Semua sumber data lewat interface `SourceConnector` (`src/lib/connectors/types.ts`). MVP memakai:

- **Apify connector** untuk Facebook, Instagram, X, Threads, dan TikTok bila `APIFY_TOKEN` tersedia.
- **Official API / RSS connector** untuk YouTube, Google News, blog, dan platform resmi lain.
- **Manual import** CSV/JSON di halaman Sources.

Prinsip: tidak bypass login/captcha/paywall, tidak scraping agresif, patuh robots.txt, hanya data publik/berizin, selalu simpan source URL.

## Struktur Penting

```
prisma/schema.prisma      Model inti untuk brand, mention, analysis, refresh, account tracking, dan reporting
prisma/seed.ts            Seed brand "Bank Jakarta" + sumber data live
src/lib/ai/               AI abstraction (Gemini / Anthropic / DeepSeek + factory)
src/lib/connectors/       Adapter connector live (Apify / API resmi / RSS)
src/lib/pipeline.ts       Ingest: dedup → simpan → analyze → deteksi spike
src/lib/filters.ts        Filter engine (URL params → Prisma where)
src/lib/stats.ts          Agregasi Overview (health score, spike, trend)
src/app/api/              refresh, import, analyze, content-ideas, hook-review, reports
src/app/                  Halaman dashboard utama (Overview → Settings)
```

## Auth

Basic auth dimatikan secara default. Aktifkan di `.env`:

```
BASIC_AUTH_ENABLED="true"
BASIC_AUTH_USER="admin"
BASIC_AUTH_PASSWORD="brandpulse"
```

## Deploy

- **Frontend/API**: Vercel (set env `DATABASE_URL`, `AI_PROVIDER`, dst).
- **Database**: Supabase PostgreSQL (lihat bagian pindah ke PostgreSQL).
- **Scheduler produksi**: ganti trigger client-side dengan Vercel Cron / worker BullMQ yang memanggil logika yang sama di `/api/refresh`.
