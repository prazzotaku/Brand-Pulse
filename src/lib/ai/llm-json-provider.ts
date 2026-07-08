import type {
  AIAnalysisResult,
  BrandContext,
  ContentIdeaResult,
  HookGenerationResult,
  HookReviewResult,
} from "../types";
import type {
  AIProvider,
  HookGenerationInput,
  HookReviewInput,
  MentionForAnalysis,
  MentionInsightSnapshot,
} from "./provider";
import { MockAIProvider } from "./mock-provider";
import { ISSUE_CATEGORIES, INTENTS } from "../constants";
import { prisma } from "../prisma";

/**
 * Normalisasi field array dari respons AI. LLM kadang mengembalikan objek
 * ber-key (mis. {"ngadat":{"term":"ngadat",...}}) alih-alih array meski
 * diminta array — pulihkan lewat Object.values() alih-alih membuang datanya.
 */
function toArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") return Object.values(v) as T[];
  return [];
}

/**
 * Base provider untuk LLM yang mengembalikan JSON (Anthropic, DeepSeek, OpenAI,
 * dst.). Semua prompt + parsing + fallback-ke-mock dibagi di sini; subclass
 * cukup mengimplementasikan transport `complete(system, user)`.
 *
 * Setiap method punya fallback otomatis ke MockAIProvider bila API error/kosong,
 * sehingga dashboard tetap hidup meski API bermasalah atau kuota habis.
 */
export abstract class LLMJsonProvider implements AIProvider {
  abstract readonly name: string;
  protected fallback = new MockAIProvider();

  /**
   * Kirim prompt ke LLM, kembalikan teks jawaban (harus berisi JSON).
   * `operation` adalah label fitur pemanggil (mis. "analyzeMention") — dipakai
   * subclass untuk mencatat token usage per operasi via recordUsage().
   */
  protected abstract complete(system: string, user: string, operation: string): Promise<string>;

  /**
   * Catat pemakaian token ke AiUsageLog untuk Token Meter. Tidak pernah
   * melempar error — logging tidak boleh menggagalkan panggilan AI utama.
   */
  protected async recordUsage(params: {
    operation: string;
    model?: string;
    promptTokens: number;
    completionTokens: number;
  }): Promise<void> {
    try {
      await prisma.aiUsageLog.create({
        data: {
          provider: this.name,
          model: params.model ?? "",
          operation: params.operation,
          promptTokens: params.promptTokens,
          completionTokens: params.completionTokens,
          totalTokens: params.promptTokens + params.completionTokens,
        },
      });
    } catch (err) {
      console.error(`[${this.name}] gagal mencatat token usage:`, err);
    }
  }

  protected extractJson<T>(text: string): T {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON found in AI response");
    return JSON.parse(match[0]) as T;
  }

  protected brandBlock(brand: BrandContext): string {
    return [
      `Brand: ${brand.name}`,
      `Alias: ${brand.aliases.join(", ")}`,
      `Produk: ${brand.products.join(", ")}`,
      `Kompetitor: ${brand.competitors.join(", ")}`,
      `Brand voice: ${brand.brandVoice}`,
      `Klaim terlarang: ${brand.prohibitedClaims.join(", ")}`,
      `Target audiens: ${brand.targetAudience}`,
      brand.issueKeywords.length ? `Keyword isu sensitif brand ini (bobot risiko lebih tinggi jika muncul): ${brand.issueKeywords.join(", ")}` : "",
    ].filter(Boolean).join("\n");
  }

  async analyzeMention(m: MentionForAnalysis, brand: BrandContext): Promise<AIAnalysisResult> {
    try {
      return await this.analyzeMentionStrict(m, brand);
    } catch (err) {
      console.error(`[${this.name}] analyzeMention fallback ke mock:`, err);
      return this.fallback.analyzeMention(m, brand);
    }
  }

  /**
   * Sama seperti analyzeMention, tapi TANPA fallback — melempar error asli
   * (429/503/dll) alih-alih menelannya. Dipakai script batch/backfill yang
   * ingin retry sendiri sebelum menyerah, karena analyzeMention biasa
   * menyembunyikan kegagalan di balik hasil mock yang terlihat "sukses".
   */
  async analyzeMentionStrict(m: MentionForAnalysis, brand: BrandContext): Promise<AIAnalysisResult> {
    const rubric = `RUBRIK PENILAIAN — ikuti secara konsisten, jangan menebak bebas:

RELEVANCE (isRelevant & relevanceScore) — PALING PENTING, nilai ini SEBELUM yang lain:
- isRelevant = true HANYA JIKA nama brand, salah satu alias, ATAU nama produk brand
  disebutkan SECARA EKSPLISIT di judul atau konten (persis tertulis, bukan disingkat/diplesetkan).
- Topik yang "berkaitan" secara umum (mis. sama-sama tentang Jakarta, sama-sama tentang
  perbankan, sama-sama menyasar audiens serupa) TAPI TIDAK MENYEBUT BRAND SECARA EKSPLISIT
  → isRelevant = false, relevanceScore rendah (0-20), TIDAK PEDULI seberapa relevan topiknya
  terasa. JANGAN merasionalisasi relevansi lewat "target audiens yang sama" atau "berkaitan
  dengan industri" — itu bukan alasan yang valid untuk isRelevant = true.
- Bila isRelevant = false: sentiment tetap dinilai apa adanya, TAPI issueCategory HARUS "irrelevant",
  riskScore rendah (brand tidak disebut = tidak ada risiko reputasi langsung ke brand ini).
- relevanceScore 80-100 = brand disebut jelas sebagai subjek utama; 40-79 = brand disebut tapi
  bukan fokus utama; 0-39 = brand tidak disebut sama sekali (harus isRelevant=false).

SENTIMENT (nada bahasa dalam teks itu sendiri):
- positive: pujian, apresiasi, pengalaman baik, rekomendasi ke orang lain
- negative: keluhan, kekecewaan, kritik, melaporkan masalah
- neutral: informasi faktual tanpa muatan emosi (mis. berita straight-news, pertanyaan biasa)
- mixed: ada pujian DAN kritik dalam mention yang sama

RISK SCORE & REPUTATIONAL IMPACT — PENTING: ini BEDA dari sentiment. Nilai dari DAMPAK ke reputasi brand, bukan dari nada bahasa. Artikel bernada netral tentang dugaan fraud tetap berisiko tinggi.
- low (0-24): percakapan biasa, tidak ada dampak reputasi
- medium (25-49): keluhan individu yang wajar, perlu respons tapi tidak mendesak
- high (50-74): masalah berulang/berpotensi menyebar, menyinggung keyword isu sensitif brand, media tier 1/2 memberitakan
- critical (75-100): dugaan fraud/scam, kebocoran data, isu hukum/regulasi, viral negatif skala besar
reputationalImpact HARUS konsisten dengan riskScore (low=0-24, medium=25-49, high=50-74, critical=75-100).

issueCategory HARUS PERSIS salah satu dari daftar ini (jangan buat istilah baru): ${ISSUE_CATEGORIES.join(", ")}
intent HARUS PERSIS salah satu dari daftar ini (bahasa Inggris, jangan variasi lain): ${INTENTS.join(", ")}

CONTOH KALIBRASI:
Input: "Aplikasi lemot terus, udah 3 hari gak bisa login, kesel banget"
Output: {"sentiment":"negative","riskScore":35,"reputationalImpact":"medium","issueCategory":"app issue"}
Input: "OJK sedang menyelidiki dugaan kebocoran data nasabah beberapa bank daerah" (nada berita netral, tanpa opini)
Output: {"sentiment":"neutral","riskScore":85,"reputationalImpact":"critical","issueCategory":"fraud/scam"}
Input: "Pelayanan CS ramah, transfer dari HP juga gampang. Cuma sayang biaya adminnya agak mahal."
Output: {"sentiment":"mixed","riskScore":15,"reputationalImpact":"low","issueCategory":"pricing"}
Input (contoh relevansi): "Kepala Dinas Perhubungan DKI Jakarta mengatakan Pemprov akan memperbanyak shelter ojek daring di mal dan stasiun." (brand TIDAK disebut sama sekali)
Output: {"isRelevant":false,"relevanceScore":10,"sentiment":"neutral","riskScore":0,"reputationalImpact":"low","issueCategory":"irrelevant"}`;

    const text = await this.complete(
      "Kamu adalah analis brand intelligence yang menilai konsisten mengikuti rubrik yang diberikan, bukan intuisi bebas. Balas HANYA JSON valid tanpa teks lain.",
      `${this.brandBlock(brand)}\n\n${rubric}\n\nAnalisis mention berikut dan balas JSON persis dengan schema:\n{"isRelevant":boolean,"relevanceScore":0-100,"sentiment":"positive|negative|neutral|mixed","sentimentScore":-100..100,"confidenceScore":0-100,"reputationalImpact":"low|medium|high|critical","riskScore":0-100,"issueCategory":"","emotion":"","intent":"","summary":"","reasoning":"","suggestedAction":"","detectedLocations":[{"name":"","type":"country|province|city|district","confidence":0-100,"source":"explicit|profile|text|media_domain|inference"}],"detectedSlang":[{"term":"","meaningSuggestion":"","confidence":0-100}],"relatedKeywords":[],"relatedHashtags":[],"relatedCompetitors":[],"contentOpportunity":""}\nLokasi hanya level agregat (negara/provinsi/kota), jangan alamat personal.\n\nPlatform: ${m.sourcePlatform} (${m.sourceType})${m.mediaTier ? `, media tier: ${m.mediaTier}` : ""}\nAuthor: ${m.authorName}\nEngagement: ${m.engagementCount}\nJudul: ${m.title}\nKonten: ${m.content}`,
      "analyzeMention"
    );
    const parsed = this.extractJson<AIAnalysisResult>(text);
    return {
      ...parsed,
      detectedLocations: toArray(parsed.detectedLocations),
      detectedSlang: toArray(parsed.detectedSlang),
      relatedKeywords: Array.isArray(parsed.relatedKeywords) ? parsed.relatedKeywords : [],
      relatedHashtags: Array.isArray(parsed.relatedHashtags) ? parsed.relatedHashtags : [],
      relatedCompetitors: Array.isArray(parsed.relatedCompetitors) ? parsed.relatedCompetitors : [],
      contentOpportunity: parsed.contentOpportunity ?? "",
    };
  }

  async generateContentIdeas(
    insights: MentionInsightSnapshot[],
    brand: BrandContext,
    count = 3
  ): Promise<ContentIdeaResult[]> {
    try {
      const text = await this.complete(
        "Kamu adalah content strategist berbasis data social listening. Balas HANYA JSON array valid.",
        `${this.brandBlock(brand)}\n\nBerdasarkan insight berikut, buat ${count} ide konten. Balas JSON array of {"idea":"","sourceInsight":"","audiencePain":"","hookSuggestion":"","angle":"","format":"reels|tiktok|carousel|thread|article|linkedin","cta":"","priorityScore":0-100,"whyNow":""}.\nJangan gunakan klaim terlarang brand.\n\nInsight:\n${insights.slice(0, 30).map((i) => `- [${i.sourcePlatform}/${i.intent}/${i.sentiment}] ${i.content.slice(0, 140)}`).join("\n")}`,
        "generateContentIdeas"
      );
      return this.extractJson<ContentIdeaResult[]>(text);
    } catch (err) {
      console.error(`[${this.name}] generateContentIdeas fallback ke mock:`, err);
      return this.fallback.generateContentIdeas(insights, brand, count);
    }
  }

  async reviewHook(input: HookReviewInput, brand: BrandContext): Promise<HookReviewResult> {
    try {
      const text = await this.complete(
        "Kamu adalah reviewer konten. User menempel CAPTION LENGKAP. Deteksi sendiri hook-nya (biasanya baris/kalimat pembuka), lalu nilai keseluruhan: hook harus menghentikan scroll dalam 3 detik, tanpa basa-basi, punya daya tarik (konflik/kontras/curiosity gap/pain/gain), CTA jelas, sesuai brand voice, tanpa janji palsu/klaim terlarang. Balas HANYA JSON valid.",
        `${this.brandBlock(brand)}\n\nReview CAPTION berikut secara menyeluruh. Balas JSON: {"totalScore":0-10,"scoreBreakdown":{"hookStrength":1-10,"curiosityGap":1-10,"conflictContrast":1-10,"promiseClarity":1-10,"audienceRelevance":1-10,"brandFit":1-10,"ctaStrength":1-10,"retentionPotential":1-10,"riskLevel":1-10},"detectedHookType":"jenis hook pembuka yang terdeteksi","mainWeakness":"","whyItMatters":"","recommendedHookType":"","rewrittenOptions":["3-5 opsi hook pengganti"],"suggestedCaption":"versi caption perbaikan lengkap siap pakai (hook kuat + isi + CTA)","finalRecommendation":""}\n\nPlatform: ${input.platform || "-"}\n\nCAPTION LENGKAP:\n"""\n${input.caption || input.hook}\n"""`,
        "reviewHook"
      );
      return this.extractJson<HookReviewResult>(text);
    } catch (err) {
      console.error(`[${this.name}] reviewHook fallback ke mock:`, err);
      return this.fallback.reviewHook(input, brand);
    }
  }

  async generateHooks(input: HookGenerationInput, brand: BrandContext): Promise<HookGenerationResult> {
    const ct = input.contentType === "image" ? "carousel" : input.contentType || "video";
    const formatGuide =
      ct === "video"
        ? 'contentBody = script video adegan demi adegan (label mis. "Adegan 1 — Hook (0–3 dtk)", "Adegan 2 — Isi", "Penutup + CTA"), sertakan arahan visual + voiceover.'
        : ct === "carousel"
          ? 'contentBody = teks per slide carousel (label "Slide 1 (Cover)", "Slide 2", ...), teks singkat mudah dibaca di gambar, slide terakhir CTA. Minimal 3 slide.'
          : ct === "single"
            ? 'contentBody = HANYA 2 item untuk 1 GAMBAR FEED (BUKAN carousel/slide): {label:"Teks di gambar (overlay singkat)", text: 1 kalimat headline visual} dan {label:"Caption (lengkap, siap posting)", text: caption utuh mengalir}. Gaya caption seperti promo: pembuka menarik, penjelasan benefit, poin-poin detail (pakai bullet "•" jika perlu, mis. syarat/kuota/periode), lalu CTA di akhir. Contoh gaya: "Saatnya upgrade perlengkapan olahraga, hemat sampai 20%! ... Gunakan kode promo BJKT-SPO dan dapatkan: • Diskon 20% • Minimal transaksi Rp1.000.000 ... Yuk, ... sebelum kuotanya habis."'
            : 'contentBody = isi post/thread teks (label "Post" atau "1/","2/","3/" untuk thread), tulisan lengkap siap posting.';
    try {
      const text = await this.complete(
        "Kamu adalah copywriter & content creator. Prinsip: hook menghentikan scroll dalam 3 detik, tanpa basa-basi, tanpa janji palsu, tanpa klaim terlarang brand. Isi konten WAJIB menyesuaikan format (video/gambar tunggal/carousel/teks) — jangan memaksa gambar tunggal menjadi slide carousel. Balas HANYA JSON valid.",
        `${this.brandBlock(brand)}\n\nBuatkan hook, ISI KONTEN, dan caption. Balas JSON: {"hooks":[{"text":"","type":"curiosity gap|kontras|ancaman halus|confession|data"}],"contentType":"${ct}","contentBody":[{"label":"","text":""}],"caption":"caption lengkap siap posting (hook + isi + CTA + hashtag relevan)","cta":"","notes":"catatan eksekusi singkat"}\nBuat 5 hook tipe berbeda (Bahasa Indonesia).\nFormat konten = ${ct}. ${formatGuide}\n\nTopik: ${input.topic}\nPlatform: ${input.platform || "-"}\nTujuan: ${input.goal || "edukasi"}`,
        "generateHooks"
      );
      const parsed = this.extractJson<HookGenerationResult>(text);
      return {
        ...parsed,
        contentType: parsed.contentType || ct,
        contentBody: toArray(parsed.contentBody),
      };
    } catch (err) {
      console.error(`[${this.name}] generateHooks fallback ke mock:`, err);
      return this.fallback.generateHooks(input, brand);
    }
  }

  async summarizeReport(
    stats: Record<string, unknown>,
    insights: MentionInsightSnapshot[],
    brand: BrandContext
  ): Promise<string> {
    try {
      const out = await this.complete(
        "Kamu adalah konsultan brand & PR senior yang menulis laporan analitis mendalam untuk manajemen/direksi. Bahasa Indonesia formal, tajam, dan tebal dengan data. Setiap klaim harus dirujuk ke angka nyata dari data. JANGAN mengarang angka di luar data. Tulis analitis (bukan sekadar mendeskripsikan angka) — jelaskan APA ARTINYA bagi bisnis dan APA RISIKO/PELUANGNYA.",
        `${this.brandBlock(brand)}\n\nData periode lengkap (JSON): ${JSON.stringify(stats)}\n\nSampel percakapan (bukti):\n${insights.slice(0, 24).map((i) => `- [${i.sentiment}/${i.issueCategory}] ${i.content.slice(0, 160)}`).join("\n")}\n\nTulis laporan KOMPREHENSIF & DETAIL untuk manajemen. Setiap judul di baris sendiri diawali "## ". Struktur wajib:\n## Ringkasan Eksekutif\n(3-4 kalimat: kondisi brand, angka kunci, dan 1 kalimat "so what" untuk direksi)\n## Analisis Sentimen & Volume\n(komposisi sentimen dengan persentase, growth volume vs periode lalu, interpretasi per platform dari sentimentByPlatform, total engagement/views)\n## Isu Utama & Risiko Reputasi\n(isu dominan dengan angka, distribusi tingkat risiko dari riskDistribution, apakah negativeGrowth naik/turun, potensi eskalasi konkret)\n## Suara Audiens\n(interpretasi topIntents: apa yang audiens tanyakan/keluhkan/inginkan; sebut slang yang naik dari emergingSlang bila ada)\n## Lanskap Kompetitif & Media\n(competitorMentions sebagai sinyal share of voice, sebaran wilayah dari topLocations)\n## Perbandingan Periode\n(bandingkan metrik kunci vs periode sebelumnya — health, volume, negatif — apakah membaik atau memburuk)\n## Rekomendasi Tindakan\n(4-6 rekomendasi KONKRET & berprioritas, format bullet "- ", masing-masing sebutkan tindakan + alasan berbasis data + urgensi)\n\nATURAN KETAT: tulis KETUJUH judul "## " di atas SECARA LENGKAP DAN BERURUTAN, walaupun data suatu bagian terbatas (tulis 1 kalimat singkat "Data terbatas pada periode ini" bila memang minim) — DILARANG menghapus, menggabungkan, atau mengganti nama judul. Rujuk angka nyata di setiap bagian. Panjang total memadai untuk laporan manajemen (bukan ringkas).`,
        "summarizeReport"
      );
      return out.trim() || (await this.fallback.summarizeReport(stats, insights, brand));
    } catch (err) {
      console.error(`[${this.name}] summarizeReport fallback ke mock:`, err);
      return this.fallback.summarizeReport(stats, insights, brand);
    }
  }
}
