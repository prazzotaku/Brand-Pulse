import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SentimentBadge, RiskBadge } from "@/components/shared/badges";
import { Progress } from "@/components/ui/progress";

export const dynamic = "force-dynamic";

/**
 * Panduan Metrik — menjelaskan SEMUA parameter penilaian dalam bahasa awam,
 * lengkap dengan rumus, ambang batas, dan contoh use case nyata. Tujuannya:
 * siapa pun yang membaca dashboard paham "kenapa angkanya segini".
 */
export default function GuidePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panduan Metrik</h1>
        <p className="text-sm text-muted-foreground">
          Penjelasan setiap parameter penilaian di dashboard ini — supaya Anda paham kenapa
          Brand Health Score-nya sekian, kenapa sebuah mention dinilai high, dan seterusnya.
        </p>
      </div>

      {/* ===== Brand Health Score ===== */}
      <Card>
        <CardHeader>
          <CardTitle>1. Brand Health Score (0–100)</CardTitle>
          <CardDescription>Satu angka ringkas untuk menjawab: &ldquo;brand saya sedang aman atau tidak?&rdquo;</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>Skor ini gabungan dari dua hal:</p>
          <div className="rounded-md bg-muted p-3 font-mono text-xs">
            Brand Health = (Komposisi Sentimen × 60%) + ((100 − Rata-rata Risk Score) × 40%)
          </div>
          <ul className="list-inside list-disc space-y-1">
            <li><strong>Komposisi Sentimen (bobot 60%)</strong> — makin banyak percakapan positif, makin tinggi. Netral dihitung 60% nilai positif, mixed 40% (karena tidak sepenuhnya buruk).</li>
            <li><strong>Kebalikan Risiko (bobot 40%)</strong> — rata-rata risk score semua mention pada periode itu, dibalik. Makin rendah risikonya, makin tinggi kontribusinya.</li>
          </ul>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="font-mono text-lg font-bold text-emerald-600">≥ 70</p>
              <p className="font-semibold">Sehat</p>
              <p className="text-xs text-muted-foreground">Percakapan didominasi positif/netral, risiko rendah. Fokus: amplifikasi.</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-mono text-lg font-bold text-amber-600">45–69</p>
              <p className="font-semibold">Waspada</p>
              <p className="text-xs text-muted-foreground">Ada isu yang perlu direspons sebelum membesar. Pantau lebih sering.</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-mono text-lg font-bold text-red-600">&lt; 45</p>
              <p className="font-semibold">Berisiko</p>
              <p className="text-xs text-muted-foreground">Percakapan negatif/risiko tinggi dominan. Perlu tindakan aktif tim PR.</p>
            </div>
          </div>
          <div className="rounded-md border-l-4 border-primary bg-accent/30 p-3">
            <p className="font-semibold">Contoh use case</p>
            <p className="text-muted-foreground">
              Dalam sepekan ada 100 mention: 30 positif, 40 netral, 20 mixed, 10 negatif, dengan rata-rata
              risk score 25. Komposisi sentimen = (30 + 40×0,6 + 20×0,4) / 100 × 100 = 62.
              Brand Health = 62×60% + (100−25)×40% = 37,2 + 30 = <strong>67 → Waspada</strong>.
              Artinya: belum krisis, tapi 10 mention negatif itu layak ditindaklanjuti minggu ini.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ===== Sentiment ===== */}
      <Card>
        <CardHeader>
          <CardTitle>2. Sentiment (Positive / Negative / Neutral / Mixed)</CardTitle>
          <CardDescription>Menilai <strong>nada bahasa</strong> dalam teks itu sendiri — bukan dampaknya.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kategori</TableHead>
                <TableHead>Artinya</TableHead>
                <TableHead>Contoh kalimat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell><SentimentBadge sentiment="positive" /></TableCell>
                <TableCell>Pujian, apresiasi, pengalaman baik, rekomendasi</TableCell>
                <TableCell className="text-muted-foreground">&ldquo;Transfer sekarang gratis, makin sering pakai!&rdquo;</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><SentimentBadge sentiment="negative" /></TableCell>
                <TableCell>Keluhan, kekecewaan, kritik, melaporkan masalah</TableCell>
                <TableCell className="text-muted-foreground">&ldquo;Aplikasi lemot terus, kecewa banget.&rdquo;</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><SentimentBadge sentiment="neutral" /></TableCell>
                <TableCell>Informasi faktual tanpa muatan emosi</TableCell>
                <TableCell className="text-muted-foreground">&ldquo;Bank Jakarta kerja sama dengan TransJakarta.&rdquo;</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><SentimentBadge sentiment="mixed" /></TableCell>
                <TableCell>Ada pujian DAN kritik dalam satu mention</TableCell>
                <TableCell className="text-muted-foreground">&ldquo;CS-nya ramah, tapi biaya adminnya mahal.&rdquo;</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="text-muted-foreground">
            Sentiment score (-100 s.d. +100) menunjukkan seberapa kuat nadanya: -70 berarti sangat negatif,
            +20 berarti agak positif.
          </p>
        </CardContent>
      </Card>

      {/* ===== Risk ===== */}
      <Card>
        <CardHeader>
          <CardTitle>3. Risk Score &amp; Dampak Reputasi (Low / Medium / High / Critical)</CardTitle>
          <CardDescription>
            Menilai <strong>dampak ke reputasi brand</strong> — dan ini SENGAJA dibedakan dari sentiment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            Kenapa dibedakan? Karena artikel berita yang ditulis dengan bahasa netral tentang
            &ldquo;dugaan kebocoran data&rdquo; tetap sangat berbahaya bagi brand — sentimennya netral,
            tapi risikonya critical. Sebaliknya, satu komentar kesal soal antrean panjang itu negatif,
            tapi risikonya rendah.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Level</TableHead>
                <TableHead>Skor</TableHead>
                <TableHead>Kriteria</TableHead>
                <TableHead>Tindakan yang diharapkan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell><RiskBadge impact="low" /></TableCell>
                <TableCell className="font-mono">0–24</TableCell>
                <TableCell>Percakapan biasa, tidak berdampak ke reputasi</TableCell>
                <TableCell className="text-muted-foreground">Tidak perlu aksi, cukup dipantau</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><RiskBadge impact="medium" /></TableCell>
                <TableCell className="font-mono">25–49</TableCell>
                <TableCell>Keluhan individu yang wajar</TableCell>
                <TableCell className="text-muted-foreground">Respons customer service normal</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><RiskBadge impact="high" /></TableCell>
                <TableCell className="font-mono">50–74</TableCell>
                <TableCell>Masalah berulang/berpotensi menyebar, menyentuh keyword isu sensitif, atau diberitakan media tier 1/2</TableCell>
                <TableCell className="text-muted-foreground">Respons resmi &lt; 24 jam, pantau ketat</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><RiskBadge impact="critical" /></TableCell>
                <TableCell className="font-mono">75–100</TableCell>
                <TableCell>Dugaan fraud/scam, kebocoran data, isu hukum/regulasi, viral negatif skala besar</TableCell>
                <TableCell className="text-muted-foreground">Eskalasi tim krisis sekarang</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="rounded-md border-l-4 border-primary bg-accent/30 p-3">
            <p className="font-semibold">Contoh use case: kenapa &ldquo;high 55&rdquo;, bukan critical?</p>
            <p className="mb-2 mt-1 rounded bg-muted p-2 text-xs italic">
              &ldquo;JakOne Mobile ngadat lagi? Gabisa login dari pagi di Jakarta, OTP ga masuk-masuk.
              Ada yang sama? #BankJakarta&rdquo; — 1.070 engagement
            </p>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>✔ Menyentuh keyword sensitif brand (&ldquo;gagal login&rdquo;) → memenuhi kriteria <strong>high</strong></li>
              <li>✔ Engagement tinggi &amp; berpotensi menyebar (ada hashtag) → menguatkan <strong>high</strong></li>
              <li>✘ Bukan fraud, bukan kebocoran data, bukan isu hukum, belum viral massal → <strong>tidak memenuhi critical</strong></li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              Kesimpulan: ini insiden operasional yang harus direspons cepat (high 55), bukan krisis brand.
              Kalau keluhan serupa muncul dari puluhan akun sekaligus atau diberitakan media nasional,
              skornya naik ke critical secara otomatis.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ===== Relevance & Confidence ===== */}
      <Card>
        <CardHeader>
          <CardTitle>4. Relevance Score &amp; Confidence Score (0–100)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="font-semibold">Relevance — &ldquo;seberapa nyambung dengan brand saya?&rdquo;</p>
              <p className="mt-1 text-muted-foreground">
                Tinggi jika menyebut nama brand/alias/produk secara jelas. Rendah jika hanya kebetulan
                mirip (mis. mengandung kata &ldquo;lowongan&rdquo; yang sudah Anda kecualikan). Mention
                ber-relevance rendah otomatis dikategorikan <em>irrelevant</em> agar tidak mengotori statistik.
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-semibold">Confidence — &ldquo;seberapa yakin AI dengan penilaiannya?&rdquo;</p>
              <p className="mt-1 text-muted-foreground">
                Kalimat yang jelas emosinya → confidence tinggi (85–95). Kalimat ambigu/sarkasme →
                confidence lebih rendah. Mention penting dengan confidence rendah sebaiknya dicek manusia
                (ada alert khusus Low Confidence untuk ini).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== Intent ===== */}
      <Card>
        <CardHeader>
          <CardTitle>5. Intent — maksud di balik percakapan</CardTitle>
          <CardDescription>Dipakai di Social Listening untuk mengelompokkan &ldquo;audiens sebenarnya mau apa&rdquo;.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Intent</TableHead><TableHead>Artinya &amp; manfaat bisnisnya</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["complaint", "Keluhan — butuh respons; sumber perbaikan layanan"],
                ["question", "Pertanyaan — kandidat konten FAQ; tanda informasi resmi kurang jelas"],
                ["praise", "Pujian — bahan social proof/testimoni"],
                ["objection", "Keraguan sebelum memakai layanan — bahan konten edukasi/klarifikasi"],
                ["desire", "Keinginan audiens — sinyal permintaan fitur/produk"],
                ["fear", "Kekhawatiran — perlu konten yang menenangkan/menjelaskan"],
                ["crisis signal", "Sinyal risiko reputasi — prioritas pemantauan tertinggi"],
                ["information", "Sekadar informasi netral"],
              ].map(([k, v]) => (
                <TableRow key={k}>
                  <TableCell className="font-medium capitalize">{k}</TableCell>
                  <TableCell className="text-muted-foreground">{v}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ===== Geo confidence ===== */}
      <Card>
        <CardHeader>
          <CardTitle>6. Geo Confidence — seberapa yakin soal lokasi (Buzz Geo)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Level</TableHead><TableHead>Sumber lokasi</TableHead><TableHead>Contoh</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">High (≥80)</TableCell>
                <TableCell>Lokasi eksplisit / place tag dari platform</TableCell>
                <TableCell className="text-muted-foreground">Post ber-tag lokasi &ldquo;Jakarta Selatan&rdquo;</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Medium (60–79)</TableCell>
                <TableCell>Profil akun atau domain media lokal</TableCell>
                <TableCell className="text-muted-foreground">Artikel dari wartakota → Jakarta</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Low (&lt;60)</TableCell>
                <TableCell>Inferensi dari teks</TableCell>
                <TableCell className="text-muted-foreground">&ldquo;...gabisa login dari pagi di Jakarta&rdquo;</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            Privasi: lokasi selalu level agregat (negara/provinsi/kota) — tidak pernah alamat personal.
          </p>
        </CardContent>
      </Card>

      {/* ===== Traceability ===== */}
      <Card>
        <CardHeader>
          <CardTitle>7. Dari mana angka-angka ini berasal?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            Setiap angka di dashboard dihitung langsung dari data mention di database — bukan estimasi.
            Anda bisa membuktikannya sendiri:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>Klik <strong>More</strong> pada kartu kategori mana pun → drawer menampilkan semua data mentah di balik angka itu, dan totalnya harus persis sama.</li>
            <li>Setiap mention punya link <strong>sumber asli</strong> untuk verifikasi ke platformnya.</li>
            <li>Data duplikat tidak pernah dihitung dua kali (deduplikasi 2 lapis saat data masuk).</li>
            <li>Penilaian AI dilakukan sekali saat mention masuk, mengikuti rubrik baku (ambang batas di halaman ini) — bukan dinilai ulang acak tiap kali halaman dibuka.</li>
          </ul>
          <div className="mt-1">
            <p className="mb-1 font-semibold text-foreground">Alur singkatnya:</p>
            <Progress value={100} className="hidden" />
            <div className="rounded-md bg-muted p-3 font-mono text-xs">
              Data masuk (connector/import) → dedup → AI menilai per rubrik → tersimpan → dashboard menghitung agregat dari data tersimpan
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
