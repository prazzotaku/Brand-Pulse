# Brand Pulse OS

Dashboard AI untuk monitoring brand dari berbagai sumber publik — Facebook, Instagram, X/Twitter, Threads, TikTok, dan berita online. Mengubah mention, komentar, artikel, dan tren menjadi insight reputasi, alert, ide konten, serta review hook/caption.

## Menjalankan (dev)

```bash
npm install        # otomatis menjalankan prisma generate
npm run db:push    # buat database (SQLite dev)
npm run db:seed    # isi brand contoh "Bank Jakarta" + 56 mention mock
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
| AI Layer | Abstraction `AIProvider` (mock rule-based / Anthropic Claude) |
| Auth | Basic auth via middleware (opsional), siap upgrade ke NextAuth |
| Scheduler | Client-side interval (manual/5m/30m/1h) → job pipeline server; siap naik ke Redis/BullMQ |

## Pindah ke PostgreSQL/Supabase

1. Di `prisma/schema.prisma`, ganti `provider = "sqlite"` → `provider = "postgresql"`.
2. Isi `DATABASE_URL` di `.env` dengan connection string Postgres/Supabase.
3. `npm run db:push && npm run db:seed`.

Schema sengaja ditulis portable (union types sebagai `String`, JSON sebagai string) sehingga tidak ada perubahan kode lain.

## Mengganti AI Provider

- Default: `AI_PROVIDER=mock` — analisis rule-based deterministik, tanpa API key.
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

- **MockConnector** untuk Facebook, Instagram, X, Threads, TikTok, News — mensimulasikan API resmi.
- **RssSampleConnector** untuk blog/RSS.
- **Manual import** CSV/JSON di halaman Sources (kolom minimal `content`; lihat `sample-import.csv`).

Prinsip: tidak bypass login/captcha/paywall, tidak scraping agresif, patuh robots.txt, hanya data publik/berizin, selalu simpan source URL. Untuk produksi ganti mock dengan Meta Graph API, Instagram Graph API, X API, Threads API, TikTok Research API, dan News API/GDELT — pipeline (`src/lib/pipeline.ts`) tidak berubah.

## Struktur Penting

```
prisma/schema.prisma      14 model: User, Workspace, Brand, BrandKeyword, Source,
                          SearchProfile, Mention, MentionAnalysis, Alert, SavedFilter,
                          ContentIdea, ContentReview, Report, RefreshJob
prisma/seed.ts            Seed brand "Bank Jakarta" + mention mock 7 platform
src/lib/ai/               AI abstraction (mock + Anthropic + factory)
src/lib/connectors/       Adapter connector + mock data
src/lib/pipeline.ts       Ingest: dedup → simpan → analyze → deteksi spike
src/lib/filters.ts        Filter engine (URL params → Prisma where)
src/lib/stats.ts          Agregasi Overview (health score, spike, trend)
src/app/api/              refresh, import, analyze, content-ideas, hook-review, reports
src/app/                  12 halaman sidebar (Overview → Settings)
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
