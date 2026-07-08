import type {
  AIAnalysisResult,
  BrandContext,
  ContentIdeaResult,
  DetectedLocation,
  DetectedSlang,
  HookGenerationResult,
  HookReviewResult,
  Sentiment,
} from "../types";
import { ID_LOCATIONS, ID_STOPWORDS, MEDIA_DOMAIN_LOCATIONS, SLANG_DICT } from "./id-lexicon";
import type {
  AIProvider,
  HookGenerationInput,
  HookReviewInput,
  MentionForAnalysis,
  MentionInsightSnapshot,
} from "./provider";

const PLATFORM_CTA: Record<string, string> = {
  tiktok: "Simpan video ini dan share ke orang yang paling butuh dengar.",
  reels: "Simpan dulu — kamu bakal butuh ini nanti. Cek link di bio untuk detailnya.",
  instagram: "Simpan carousel ini & follow untuk tips lainnya. Cek link di bio.",
  x: "Repost biar lebih banyak yang tahu. Utas lengkapnya di reply.",
  threads: "Balas dengan pengalamanmu — kami baca semuanya.",
  facebook: "Bagikan ke grup/keluarga yang perlu tahu ini.",
  youtube: "Subscribe untuk pembahasan lanjutannya minggu ini.",
};

type ContentType = "video" | "single" | "carousel" | "text";

/** Tentukan format konten dari input; jika tak diisi, tebak dari platform. */
function normalizeContentType(contentType?: string, platform?: string): ContentType {
  if (contentType === "video" || contentType === "single" || contentType === "carousel" || contentType === "text") return contentType;
  if (contentType === "image") return "carousel"; // kompat nilai lama
  if (["tiktok", "reels", "youtube"].includes(platform ?? "")) return "video";
  if (["x", "threads"].includes(platform ?? "")) return "text";
  if (["instagram", "facebook"].includes(platform ?? "")) return "single";
  return "single";
}

/** Bangun isi konten menyesuaikan format: script video, gambar tunggal, carousel, atau teks/thread. */
function buildContentBody(
  type: ContentType,
  topic: string,
  hook: string,
  valueLine: string,
  cta: string
): { label: string; text: string }[] {
  if (type === "video") {
    return [
      { label: "Adegan 1 — Hook (0–3 dtk)", text: `Visual: close-up ekspresi + teks besar di layar. Voiceover: "${hook}"` },
      { label: "Adegan 2 — Isi (3–15 dtk)", text: `Tunjukkan langkah/demo soal ${topic}. Voiceover: "${valueLine}"` },
      { label: "Adegan 3 — Bukti (15–22 dtk)", text: `Perlihatkan hasil/contoh nyata agar janji hook terpenuhi (hindari klaim berlebihan).` },
      { label: "Adegan 4 — Penutup + CTA", text: `Teks penutup di layar. Voiceover: "${cta}"` },
    ];
  }
  if (type === "carousel") {
    return [
      { label: "Slide 1 (Cover)", text: hook },
      { label: "Slide 2", text: `Kenapa ${topic} penting buat kamu — 1 kalimat yang relate dengan masalah audiens.` },
      { label: "Slide 3", text: `Langkah/poin inti soal ${topic} (ringkas, mudah di-screenshot).` },
      { label: "Slide 4", text: valueLine },
      { label: "Slide 5 (CTA)", text: cta },
    ];
  }
  if (type === "single") {
    // Gambar tunggal: satu visual + satu caption mengalir (bukan slide).
    return [
      { label: "Teks di gambar (overlay singkat)", text: hook },
      { label: "Caption (lengkap, siap posting)", text: `${hook}\n\n${valueLine}\n\n${cta}` },
    ];
  }
  return [
    { label: "Post / Thread", text: `${hook}\n\n${valueLine}\n\n${cta}` },
  ];
}

function ctaFor(platform?: string): string {
  return PLATFORM_CTA[platform ?? ""] ?? "Simpan konten ini dan bagikan ke yang membutuhkan.";
}

// Lexicon sederhana Bahasa Indonesia + Inggris untuk analisis rule-based.
const POSITIVE_WORDS = [
  "bagus", "mantap", "keren", "puas", "cepat", "mudah", "membantu", "suka",
  "recommended", "terbaik", "lancar", "aman", "hebat", "senang", "terima kasih",
  "makasih", "top", "juara", "worth", "love", "great", "smooth", "praktis",
  "inovatif", "meningkat", "penghargaan", "apresiasi", "sukses", "untung",
];
const NEGATIVE_WORDS = [
  "error", "gagal", "lambat", "lemot", "kecewa", "buruk", "jelek", "parah",
  "gangguan", "tidak bisa", "gak bisa", "ga bisa", "susah", "ribet", "penipuan",
  "tipu", "scam", "fraud", "bocor", "hilang", "komplain", "keluhan", "down",
  "maintenance", "lama", "menyesal", "kapok", "rugi", "bermasalah", "denda",
  "gugatan", "investigasi", "teguran", "sanksi", "viral negatif", "phishing",
];
const CRISIS_WORDS = [
  "fraud", "penipuan", "bocor", "kebocoran", "scam", "phishing", "gugatan",
  "regulator", "ojk", "investigasi", "sanksi", "error massal", "down massal",
];
const QUESTION_MARKERS = ["?", "gimana", "bagaimana", "kenapa", "kapan", "apakah", "berapa", "cara"];

const ISSUE_RULES: { category: string; words: string[] }[] = [
  { category: "fraud/scam", words: ["penipuan", "tipu", "scam", "fraud", "phishing", "bocor"] },
  { category: "app issue", words: ["error", "gagal login", "aplikasi", "app", "lemot", "lambat", "crash", "update", "maintenance", "down", "otp"] },
  { category: "customer service", words: ["cs", "customer service", "call center", "respon", "komplain", "keluhan", "dibalas"] },
  { category: "pricing", words: ["biaya", "admin", "tarif", "mahal", "murah", "gratis", "fee", "bunga"] },
  { category: "promo", words: ["promo", "cashback", "diskon", "hadiah", "undian", "merchant"] },
  { category: "regulation", words: ["ojk", "regulator", "aturan", "regulasi", "bi ", "kebijakan"] },
  { category: "crisis", words: ["viral", "gugatan", "investigasi", "massal", "demo"] },
  { category: "product", words: ["fitur", "kartu", "qris", "transfer", "tabungan", "produk", "layanan", "atm"] },
  { category: "event", words: ["event", "acara", "peluncuran", "launching", "kerja sama", "kerjasama", "mou"] },
  { category: "csr", words: ["csr", "donasi", "bantuan", "umkm", "beasiswa", "lingkungan"] },
  { category: "career", words: ["lowongan", "loker", "karir", "rekrutmen"] },
];

function countHits(text: string, words: string[]): number {
  return words.reduce((acc, w) => (text.includes(w) ? acc + 1 : acc), 0);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** NER lokasi sederhana: kamus lokasi di teks + domain media lokal. */
function detectLocations(text: string, authorHandle: string): DetectedLocation[] {
  const found = new Map<string, DetectedLocation>();
  for (const loc of ID_LOCATIONS) {
    const terms = [loc.name.toLowerCase(), ...(loc.aliases ?? [])];
    if (terms.some((t) => text.includes(t))) {
      found.set(loc.name, { name: loc.name, type: loc.type, confidence: 60, source: "text" });
    }
  }
  const handle = authorHandle.toLowerCase();
  for (const [domainPart, locName] of Object.entries(MEDIA_DOMAIN_LOCATIONS)) {
    if (handle.includes(domainPart)) {
      const existing = found.get(locName);
      if (existing) {
        existing.confidence = Math.max(existing.confidence, 75);
        existing.source = "media_domain";
      } else {
        const lex = ID_LOCATIONS.find((l) => l.name === locName);
        found.set(locName, {
          name: locName,
          type: lex?.type ?? "city",
          confidence: 75,
          source: "media_domain",
        });
      }
    }
  }
  return [...found.values()].slice(0, 5);
}

/** Deteksi slang dari kamus. */
function detectSlang(text: string): DetectedSlang[] {
  const found: DetectedSlang[] = [];
  for (const [term, meaning] of Object.entries(SLANG_DICT)) {
    if (new RegExp(`\\b${term}\\b`, "i").test(text)) {
      found.push({ term, meaningSuggestion: meaning, confidence: 80 });
    }
  }
  return found.slice(0, 8);
}

/** Ekstraksi keyword sederhana: token non-stopword terpanjang/tersering. */
function extractKeywords(text: string, excludeTerms: string[]): string[] {
  const counts = new Map<string, number>();
  const exclude = new Set(excludeTerms.map((t) => t.toLowerCase()));
  for (const token of text.toLowerCase().replace(/https?:\/\/\S+/g, "").split(/[^\p{L}\p{N}]+/u)) {
    if (token.length < 4 || ID_STOPWORDS.has(token) || exclude.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 6)
    .map(([t]) => t);
}

function extractHashtags(text: string): string[] {
  return [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase()))].slice(0, 6);
}

/**
 * MockAIProvider — analisis rule-based deterministik tanpa API key.
 * Cukup representatif untuk demo/dev, dan menjadi fallback ketika
 * provider AI sungguhan tidak dikonfigurasi.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async analyzeMention(m: MentionForAnalysis, brand: BrandContext): Promise<AIAnalysisResult> {
    const text = `${m.title} ${m.content}`.toLowerCase();

    const pos = countHits(text, POSITIVE_WORDS);
    const neg = countHits(text, NEGATIVE_WORDS);
    const crisis = countHits(text, CRISIS_WORDS);

    let sentiment: Sentiment = "neutral";
    if (pos > 0 && neg > 0) sentiment = "mixed";
    else if (neg > 0) sentiment = "negative";
    else if (pos > 0) sentiment = "positive";

    const sentimentScore = clamp((pos - neg) * 25, -100, 100);

    // Relevance: nama brand/alias/produk muncul → relevan.
    const brandTerms = [brand.name, ...brand.aliases, ...brand.products].map((t) => t.toLowerCase());
    const brandHits = countHits(text, brandTerms);
    const excluded = countHits(text, brand.excludeKeywords.map((k) => k.toLowerCase())) > 0;
    const isRelevant = brandHits > 0 && !excluded;
    const relevanceScore = excluded ? 15 : clamp(40 + brandHits * 25, 0, 100);

    // Issue category berdasarkan aturan pertama yang cocok.
    let issueCategory = "product";
    for (const rule of ISSUE_RULES) {
      if (countHits(text, rule.words) > 0) {
        issueCategory = rule.category;
        break;
      }
    }
    if (!isRelevant) issueCategory = "irrelevant";

    // Risk: negatif + crisis keyword + amplifikasi engagement + media tier.
    const engagementBoost = m.engagementCount > 1000 ? 15 : m.engagementCount > 200 ? 8 : 0;
    const tierBoost = m.mediaTier === "tier1" ? 15 : m.mediaTier === "tier2" ? 8 : 0;
    let riskScore = clamp(neg * 18 + crisis * 30 + engagementBoost + tierBoost, 0, 100);
    if (sentiment === "positive") riskScore = clamp(riskScore - 20, 0, 100);

    const reputationalImpact =
      riskScore >= 75 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 25 ? "medium" : "low";

    const isQuestion = QUESTION_MARKERS.some((q) => text.includes(q));
    const intent =
      crisis > 0 ? "crisis signal"
      : neg > 0 ? "complaint"
      : isQuestion ? "question"
      : pos > 0 ? "praise"
      : "information";

    const emotion =
      crisis > 0 ? "khawatir" : neg > 0 ? "frustrasi" : pos > 0 ? "antusias" : "netral";

    const confidenceScore = clamp(55 + (pos + neg) * 8 + brandHits * 5, 40, 95);

    const summary =
      m.sourceType === "article"
        ? `Artikel ${sentiment} tentang ${brand.name} terkait ${issueCategory}.`
        : `${intent === "complaint" ? "Keluhan" : intent === "praise" ? "Apresiasi" : intent === "question" ? "Pertanyaan" : "Percakapan"} audiens di ${m.sourcePlatform} terkait ${issueCategory}.`;

    const suggestedAction =
      reputationalImpact === "critical" ? "Eskalasi ke tim PR/crisis sekarang; siapkan holding statement."
      : reputationalImpact === "high" ? "Respons resmi dalam 24 jam dan pantau perkembangan setiap 5 menit."
      : intent === "question" ? "Jawab pertanyaan; kandidat konten FAQ."
      : intent === "complaint" ? "Teruskan ke customer service dan balas dengan solusi."
      : sentiment === "positive" ? "Amplifikasi sebagai social proof/testimoni."
      : "Tidak perlu aksi; lanjutkan monitoring.";

    // --- Upgrade: geo, slang, keyword graph, peluang konten ---
    const detectedLocations = detectLocations(text, m.authorHandle ?? "");
    const detectedSlang = detectSlang(text);
    const relatedKeywords = extractKeywords(text, [brand.name, ...brand.aliases]);
    const relatedHashtags = extractHashtags(`${m.title} ${m.content}`);
    const relatedCompetitors = brand.competitors.filter((c) => text.includes(c.toLowerCase()));

    const contentOpportunity =
      intent === "question"
        ? `Kandidat konten FAQ: jawab pertanyaan seputar ${issueCategory}.`
        : intent === "complaint" && detectedSlang.length
          ? `Konten klarifikasi memakai bahasa audiens (mis. "${detectedSlang[0].term}") agar terasa relevan.`
          : sentiment === "positive"
            ? "Kurasi sebagai social proof/testimoni."
            : relatedCompetitors.length
              ? `Bahan gap analysis vs ${relatedCompetitors.join(", ")}.`
              : "";

    return {
      isRelevant,
      relevanceScore,
      sentiment,
      sentimentScore,
      confidenceScore,
      reputationalImpact,
      riskScore,
      issueCategory,
      emotion,
      intent,
      summary,
      reasoning: `Rule-based: ${pos} kata positif, ${neg} kata negatif, ${crisis} sinyal krisis, ${brandHits} kecocokan brand/alias. Engagement ${m.engagementCount}${m.mediaTier ? `, media ${m.mediaTier}` : ""}.`,
      suggestedAction,
      detectedLocations,
      detectedSlang,
      relatedKeywords,
      relatedHashtags,
      relatedCompetitors,
      contentOpportunity,
    };
  }

  async generateContentIdeas(
    insights: MentionInsightSnapshot[],
    brand: BrandContext,
    count = 3
  ): Promise<ContentIdeaResult[]> {
    const questions = insights.filter((i) => i.intent === "question");
    const complaints = insights.filter((i) => i.intent === "complaint");
    const praises = insights.filter((i) => i.intent === "praise");

    const ideas: ContentIdeaResult[] = [];

    if (questions.length > 0) {
      ideas.push({
        idea: `Konten FAQ: jawab ${questions.length} pertanyaan yang paling sering muncul tentang ${brand.name}`,
        sourceInsight: `Pertanyaan audiens, contoh: "${questions[0].content.slice(0, 90)}"`,
        audiencePain: "Audiens bingung dan tidak menemukan jawaban resmi yang mudah dipahami.",
        hookSuggestion: "3 pertanyaan yang paling sering masuk ke DM kami — dijawab tanpa basa-basi.",
        angle: "Edukasi + transparansi",
        format: "carousel",
        cta: "Simpan konten ini biar nggak nanya dua kali.",
        priorityScore: 80,
        whyNow: "Volume pertanyaan sedang naik pada periode berjalan; menjawab cepat mencegah persepsi negatif.",
      });
    }
    if (complaints.length > 0) {
      const topIssue = complaints[0].issueCategory;
      ideas.push({
        idea: `Konten klarifikasi/how-to untuk isu "${topIssue}" yang sedang dikeluhkan`,
        sourceInsight: `Keluhan terbanyak berada di kategori ${topIssue} (${complaints.length} mention).`,
        audiencePain: "Pengguna merasa tidak didengar dan tidak tahu solusi resmi.",
        hookSuggestion: `Kami baca semua keluhan soal ${topIssue}. Ini yang sebenarnya terjadi — dan solusinya.`,
        angle: "Pengakuan jujur + solusi (confession hook)",
        format: "reels",
        cta: "Coba langkahnya, lalu kabari kami hasilnya di komentar.",
        priorityScore: 90,
        whyNow: "Merespons keluhan saat masih hangat menurunkan risiko eskalasi dan menunjukkan akuntabilitas.",
      });
    }
    if (praises.length > 0) {
      ideas.push({
        idea: "Kompilasi testimoni organik jadi konten social proof",
        sourceInsight: `${praises.length} komentar positif organik siap dikurasi.`,
        audiencePain: "Calon pengguna ragu karena belum melihat bukti dari pengguna nyata.",
        hookSuggestion: "Kami nggak bilang apa-apa. Biar komentar mereka yang bicara.",
        angle: "Social proof tanpa klaim berlebihan",
        format: "carousel",
        cta: "Rasakan sendiri — coba sekarang.",
        priorityScore: 65,
        whyNow: "Momentum sentimen positif sebaiknya diamplifikasi sebelum percakapan bergeser.",
      });
    }
    ideas.push({
      idea: `Konten edukasi keamanan: cara membedakan akun resmi ${brand.name} dari penipu`,
      sourceInsight: "Pola umum industri: isu fraud/phishing selalu jadi risiko laten brand finansial.",
      audiencePain: "Audiens takut tertipu akun/promo palsu yang mengatasnamakan brand.",
      hookSuggestion: "Kalau ada yang DM kamu ngaku dari kami dan minta OTP — berhenti. Baca ini dulu.",
      angle: "Ancaman halus + proteksi audiens",
      format: "tiktok",
      cta: "Share ke orang yang paling sering kamu khawatirkan.",
      priorityScore: 75,
      whyNow: "Konten proteksi membangun trust dan menurunkan risiko krisis di masa depan.",
    });

    return ideas.slice(0, Math.max(count, 1));
  }

  async reviewHook(input: HookReviewInput, brand: BrandContext): Promise<HookReviewResult> {
    const hook = input.hook.trim();
    const lower = hook.toLowerCase();
    const words = hook.split(/\s+/).filter(Boolean);

    // Deteksi pola pembuka basa-basi.
    const smallTalk = ["halo", "hai ", "hi ", "assalamualaikum", "selamat pagi", "selamat siang",
      "pada video kali ini", "di video kali ini", "kali ini kita", "jangan lupa", "kembali lagi",
      "perkenalkan", "welcome back"].some((p) => lower.startsWith(p) || lower.includes(p));

    const hasQuestion = hook.includes("?");
    const hasNumber = /\d/.test(hook);
    const hasContrast = ["tapi", "padahal", "ternyata", "bukan", "jangan", "berhenti", "stop", "salah", "vs", "sebelum"].some((w) => lower.includes(w));
    const hasThreat = ["kalau", "jika", "sebelum terlambat", "rugi", "kehilangan", "hati-hati", "awas", "jangan sampai"].some((w) => lower.includes(w));
    const hasCuriosity = ["rahasia", "ini yang", "yang sebenarnya", "nggak ada yang", "tidak ada yang", "jarang", "baru tahu", "ini alasannya", "..."].some((w) => lower.includes(w));
    const tooLong = words.length > 20;
    const tooShort = words.length < 3;
    const prohibited = brand.prohibitedClaims.filter((c) => c && lower.includes(c.toLowerCase()));
    const hypeWords = ["pasti", "100%", "dijamin", "terbaik di dunia", "no 1", "nomor 1", "paling murah"].filter((w) => lower.includes(w));

    const s = (base: number, ...mods: number[]) =>
      Math.max(1, Math.min(10, Math.round(mods.reduce((a, b) => a + b, base))));

    const hookStrength = s(5, smallTalk ? -3 : 1, hasContrast ? 1.5 : 0, hasNumber ? 0.5 : 0, tooShort ? -2 : 0, tooLong ? -1 : 0);
    const curiosityGap = s(4, hasCuriosity ? 3 : 0, hasQuestion ? 1.5 : 0, smallTalk ? -2 : 0);
    const conflictContrast = s(4, hasContrast ? 3 : 0, hasThreat ? 1.5 : 0);
    const promiseClarity = s(5, hasNumber ? 1.5 : 0, tooLong ? -1.5 : 0, hypeWords.length ? -1 : 0, tooShort ? -1.5 : 0);
    const audienceRelevance = s(5, hasThreat || hasQuestion ? 1.5 : 0, smallTalk ? -1 : 0);
    const brandFit = s(7, prohibited.length ? -4 : 0, hypeWords.length ? -2 : 0);
    const ctaStrength = s(input.caption && /(coba|klik|simpan|share|komen|follow|daftar|cek)/i.test(input.caption) ? 7 : 4);
    const retentionPotential = s(4, hasCuriosity ? 2 : 0, hasContrast ? 1 : 0, smallTalk ? -2 : 0);
    const riskLevel = s(9, prohibited.length ? -4 : 0, hypeWords.length ? -3 : 0); // 10 = paling aman

    const breakdown = {
      hookStrength, curiosityGap, conflictContrast, promiseClarity,
      audienceRelevance, brandFit, ctaStrength, retentionPotential, riskLevel,
    };
    const totalScore =
      Math.round(
        (hookStrength * 2 + curiosityGap * 1.5 + conflictContrast * 1 + promiseClarity * 1 +
          audienceRelevance * 1.5 + brandFit * 1 + ctaStrength * 0.75 + retentionPotential * 1 +
          riskLevel * 0.75) / 10.5 * 10
      ) / 10;

    const detectedHookType =
      hasCuriosity ? "curiosity gap"
      : hasContrast ? "kontras/konflik"
      : hasThreat ? "ancaman halus"
      : hasQuestion ? "pertanyaan"
      : smallTalk ? "pembukaan basa-basi"
      : "pernyataan datar";

    const weaknesses: [number, string, string][] = [
      [smallTalk ? 0 : 99, "Pembukaan basa-basi membuang 3 detik pertama.", "Audiens memutuskan scroll/berhenti dalam 1-3 detik; salam pembuka tidak memberi alasan untuk bertahan."],
      [curiosityGap, "Curiosity gap lemah — tidak ada alasan kuat untuk menonton lanjutan.", "Tanpa rasa penasaran, retensi turun drastis setelah detik ke-3."],
      [conflictContrast, "Tidak ada konflik/kontras yang menghentikan pola scroll.", "Otak berhenti pada kejanggalan pola; hook datar terlewat begitu saja."],
      [promiseClarity, "Janji konten kabur atau terlalu umum.", "Audiens tidak tahu apa yang mereka dapat, jadi tidak ada alasan bertahan."],
      [brandFit, prohibited.length ? `Mengandung klaim terlarang brand: ${prohibited.join(", ")}.` : "Kurang selaras dengan brand voice.", "Klaim berlebihan merusak trust dan berisiko compliance."],
    ];
    weaknesses.sort((a, b) => a[0] - b[0]);
    const [, mainWeakness, whyItMatters] = weaknesses[0];

    const topic = input.contentSummary || hook;
    const rewrittenOptions = [
      `Kesalahan yang paling sering terjadi soal ${truncateTopic(topic)} — dan cara menghindarinya.`,
      `Nggak ada yang ngasih tahu kamu ini tentang ${truncateTopic(topic)}.`,
      `Berhenti dulu. Kalau kamu masih ${truncateTopic(topic)}, kamu mungkin sedang rugi tanpa sadar.`,
      `Kami cek ${hasNumber ? "datanya" : "faktanya"} langsung: ini yang sebenarnya terjadi dengan ${truncateTopic(topic)}.`,
      `${brand.name} jujur soal ${truncateTopic(topic)} — termasuk bagian yang jarang dibahas.`,
    ];

    // Caption siap pakai: hook terbaik + janji isi + CTA sesuai platform.
    const suggestedCaption = [
      rewrittenOptions[0],
      `Di konten ini kami bahas ${truncateTopic(topic)} secara jujur dan to the point — tanpa janji yang tidak bisa ditepati.`,
      ctaFor(input.platform),
    ].join("\n\n");

    return {
      totalScore,
      scoreBreakdown: breakdown,
      detectedHookType,
      mainWeakness,
      whyItMatters,
      recommendedHookType: conflictContrast < 6 ? "kontras/koreksi asumsi" : "curiosity gap dengan janji spesifik",
      rewrittenOptions,
      suggestedCaption,
      finalRecommendation:
        totalScore >= 7.5
          ? `Hook sudah kuat untuk ${input.platform || "platform target"}. Pastikan 3 detik pertama visual mendukung teksnya, lalu uji 2 varian.`
          : `Perbaiki dulu: ${mainWeakness} Gunakan salah satu opsi revisi, pertahankan janji yang bisa ditepati isi konten (jangan janji palsu), dan pastikan CTA spesifik untuk ${input.platform || "platform target"}.`,
    };
  }

  async generateHooks(input: HookGenerationInput, brand: BrandContext): Promise<HookGenerationResult> {
    const t = truncateTopic(input.topic);
    const goal = input.goal ?? "edukasi";

    const hooks: { text: string; type: string }[] = [
      { type: "curiosity gap", text: `Nggak ada yang ngasih tahu kamu soal ${t} — sampai sekarang.` },
      { type: "kontras / koreksi asumsi", text: `Banyak yang mikir ${t} itu ribet. Padahal intinya cuma 3 langkah.` },
      { type: "ancaman halus", text: `Kalau kamu terus mengabaikan ${t}, pelan-pelan kamu yang rugi tanpa sadar.` },
      { type: "confession / pengakuan", text: `Jujur: kami juga pernah salah soal ${t}. Ini pelajaran yang kami bayar mahal.` },
      { type: "data / spesifik", text: `3 hal soal ${t} yang paling sering disepelekan — nomor 2 hampir semua orang kena.` },
    ];

    const valueLine =
      goal === "promosi"
        ? `Kami tunjukkan cara memaksimalkan ${t} langsung dengan contoh nyata, bukan sekadar klaim.`
        : goal === "trust"
          ? `Kami buka datanya apa adanya soal ${t} — termasuk bagian yang jarang dibahas brand lain.`
          : goal === "awareness"
            ? `Kenalan dulu dengan ${t}: apa itu, kenapa penting, dan mulai dari mana.`
            : `Kami jelaskan ${t} langkah demi langkah, tanpa istilah yang bikin bingung.`;

    const cta = ctaFor(input.platform);
    const caption = [hooks[0].text, valueLine, cta].join("\n\n");

    const voiceNote = brand.brandVoice ? ` Nada disesuaikan brand voice: ${brand.brandVoice}.` : "";
    const claimNote = brand.prohibitedClaims.length
      ? ` Semua opsi menghindari klaim terlarang (${brand.prohibitedClaims.join(", ")}).`
      : "";

    // Isi konten menyesuaikan format (video/image/text).
    const contentType = normalizeContentType(input.contentType, input.platform);
    const contentBody = buildContentBody(contentType, t, hooks[0].text, valueLine, cta);

    return {
      hooks,
      contentType,
      contentBody,
      caption,
      cta,
      notes: `Pilih hook sesuai kekuatan visual 3 detik pertama; pastikan isi konten menepati janji hook (tanpa janji palsu).${voiceNote}${claimNote}`,
    };
  }

  async summarizeReport(
    stats: Record<string, unknown>,
    insights: MentionInsightSnapshot[],
    brand: BrandContext
  ): Promise<string> {
    const total = Number(stats.totalMentions ?? 0);
    const neg = Number(stats.negativeCount ?? 0);
    const pos = Number(stats.positiveCount ?? 0);
    const topIssue = String(stats.topIssue ?? "-");
    const health = Number(stats.brandHealthScore ?? 0);
    const negShare = total ? Math.round((neg / total) * 100) : 0;
    const posShare = total ? Math.round((pos / total) * 100) : 0;
    const avgRisk = Number(stats.avgRisk ?? 0);
    const health_label = health >= 70 ? "sehat" : health >= 45 ? "waspada" : "berisiko";

    // Fallback terstruktur (dipakai bila AI tidak aktif) — mirip format AI.
    return [
      "## Ringkasan Eksekutif",
      `Pada periode ini ${brand.name} tercatat dalam ${total} mention lintas platform dengan Brand Health Score ${health}/100 (kategori ${health_label}). Komposisi sentimen: ${posShare}% positif, ${negShare}% negatif. Rata-rata risk score ${avgRisk}/100.`,
      "",
      "## Analisis Sentimen & Volume",
      `Total ${total} percakapan terekam. ${neg > pos ? `Percakapan negatif lebih dominan (${negShare}%), perlu perhatian.` : `Sentimen positif/netral mendominasi (${posShare}% positif), kondisi relatif terkendali.`} Isu yang paling banyak dibicarakan: "${topIssue}".`,
      "",
      "## Isu Utama & Risiko Reputasi",
      `Isu dominan adalah ${topIssue} dengan rata-rata risk score ${avgRisk}/100. ${avgRisk >= 50 ? "Tingkat risiko tergolong tinggi — potensi eskalasi perlu dipantau ketat." : "Tingkat risiko masih terkendali."}`,
      "",
      "## Rekomendasi Tindakan",
      "- Tindaklanjuti keluhan berkategori risiko tinggi terlebih dahulu.",
      "- Jawab pertanyaan yang berulang sebagai konten FAQ.",
      "- Pantau pemberitaan media tier 1-2 untuk perubahan tone.",
      neg > pos ? "- Aktifkan pemantauan interval 5 menit selama isu negatif masih naik." : "- Manfaatkan momentum positif dengan konten social proof & edukasi.",
    ].join("\n");
  }
}

function truncateTopic(t: string): string {
  const clean = t.trim().replace(/[.!?]+$/, "");
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean || "topik ini";
}
