/** Kamus Bahasa Indonesia untuk analisis rule-based: lokasi, slang, stopwords. */

export interface LexLocation {
  name: string;
  type: "country" | "province" | "city" | "district";
  aliases?: string[];
}

export const ID_LOCATIONS: LexLocation[] = [
  { name: "Indonesia", type: "country" },
  { name: "DKI Jakarta", type: "province", aliases: ["jakarta"] },
  { name: "Jawa Barat", type: "province", aliases: ["jabar"] },
  { name: "Jawa Tengah", type: "province", aliases: ["jateng"] },
  { name: "Jawa Timur", type: "province", aliases: ["jatim"] },
  { name: "Banten", type: "province" },
  { name: "Bali", type: "province" },
  { name: "Sumatera Utara", type: "province", aliases: ["sumut"] },
  { name: "Sulawesi Selatan", type: "province", aliases: ["sulsel"] },
  { name: "Yogyakarta", type: "province", aliases: ["jogja", "yogya", "diy"] },
  { name: "Jakarta", type: "city", aliases: ["jakarta pusat", "jakarta selatan", "jakarta barat", "jakarta timur", "jakarta utara", "jaksel", "jakpus", "jakbar", "jaktim", "jakut"] },
  { name: "Bandung", type: "city" },
  { name: "Surabaya", type: "city" },
  { name: "Medan", type: "city" },
  { name: "Semarang", type: "city" },
  { name: "Makassar", type: "city" },
  { name: "Palembang", type: "city" },
  { name: "Tangerang", type: "city", aliases: ["tangsel", "tangerang selatan"] },
  { name: "Bekasi", type: "city" },
  { name: "Depok", type: "city" },
  { name: "Bogor", type: "city" },
  { name: "Malang", type: "city" },
  { name: "Denpasar", type: "city" },
  { name: "Batam", type: "city" },
  { name: "Pekanbaru", type: "city" },
  { name: "Balikpapan", type: "city" },
  { name: "Solo", type: "city", aliases: ["surakarta"] },
];

/** Domain media lokal → lokasi (source: media_domain, confidence medium). */
export const MEDIA_DOMAIN_LOCATIONS: Record<string, string> = {
  wartakota: "Jakarta",
  beritajakarta: "Jakarta",
  jakartaglobe: "Jakarta",
  megapolitan: "Jakarta",
  pikiranrakyat: "Bandung",
  "pikiran-rakyat": "Bandung",
  jabarekspres: "Jawa Barat",
  suarasurabaya: "Surabaya",
  jawapos: "Surabaya",
  tribunmedan: "Medan",
  tribunjateng: "Jawa Tengah",
  solopos: "Solo",
  balipost: "Bali",
};

/** Kamus slang Indonesia + arti formal (dasar; tumbuh lewat approve user). */
export const SLANG_DICT: Record<string, string> = {
  lemot: "lambat",
  ngadat: "error/berhenti bekerja",
  zonk: "tidak sesuai ekspektasi",
  gacor: "berjalan sangat baik",
  ribet: "proses sulit/berbelit",
  ghosting: "tidak merespons",
  gercep: "gerak cepat/respons cepat",
  mantul: "mantap betul",
  anjay: "ekspresi kaget/kagum",
  kepo: "ingin tahu",
  gaje: "tidak jelas",
  php: "pemberi harapan palsu",
  baper: "terbawa perasaan",
  bucin: "sangat tergila-gila",
  cuan: "keuntungan/profit",
  boncos: "rugi",
  mager: "malas gerak",
  santuy: "santai",
  receh: "remeh/murah",
  gabut: "tidak ada kegiatan",
  julid: "nyinyir/iri",
  spill: "bocorkan informasi",
  "auto": "langsung/otomatis",
  ngab: "sapaan bro",
  sabi: "bisa",
  gaskeun: "langsung jalankan",
  waskita: "hati-hati (jarang)",
  ngelag: "tersendat/lag",
  error503: "gangguan server",
  lelet: "sangat lambat",
  kezel: "kesal",
  ampas: "sangat buruk",
  gokil: "gila/keren",
  ngeselin: "menyebalkan",
};

export const ID_STOPWORDS = new Set([
  "yang", "dan", "di", "ke", "dari", "untuk", "dengan", "pada", "ini", "itu",
  "ada", "atau", "juga", "saya", "kamu", "kami", "kita", "dia", "mereka",
  "akan", "sudah", "belum", "bisa", "tidak", "gak", "ga", "nggak", "jadi",
  "karena", "kalau", "kalo", "tapi", "tetapi", "namun", "saat", "ketika",
  "lebih", "sangat", "banget", "aja", "saja", "dong", "sih", "nya", "lah",
  "the", "a", "an", "of", "in", "on", "to", "is", "are", "and", "or", "for",
  "masih", "baru", "lama", "besar", "kecil", "per", "para", "bagi", "oleh",
  "dalam", "luar", "atas", "bawah", "antara", "hingga", "sampai", "sejak",
  "tahun", "bulan", "hari", "jam", "menit", "pukul", "wib",
]);
