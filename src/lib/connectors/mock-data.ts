import type { SourcePlatform, SourceType } from "../types";

export interface MockTemplate {
  sourceType: SourceType;
  authorName: string;
  authorHandle: string;
  title?: string;
  content: string;
  engagement: [likes: number, comments: number, shares: number, views: number];
  mediaTier?: "tier1" | "tier2" | "local" | "blog";
}

/**
 * Pool konten mock realistis (Bahasa Indonesia) untuk demo brand "Bank Jakarta".
 * Konten sengaja menyebut kota (Jakarta/Bandung/Surabaya/dll) dan slang
 * (lemot/ngadat/gacor/ghosting/ribet/zonk) agar Buzz Geo, Slang Intelligence,
 * dan Sociograph ikut terisi. Semua ditandai origin "mock".
 */
export const MOCK_POOLS: Record<string, MockTemplate[]> = {
  facebook: [
    { sourceType: "post", authorName: "Komunitas UMKM Jakarta", authorHandle: "umkm.jakarta", content: "Terima kasih Bank Jakarta atas pendampingan QRIS untuk pedagang pasar di Jakarta. Transaksi jadi gacor dan aman!", engagement: [420, 55, 31, 0] },
    { sourceType: "comment", authorName: "Rina Wulandari", authorHandle: "rina.wulan", content: "Aplikasi JakOne lemot terus dari kemarin di Bandung, mau bayar listrik malah ngadat. Kecewa banget.", engagement: [88, 40, 2, 0] },
    { sourceType: "comment", authorName: "Budi Santoso", authorHandle: "budi.santoso.92", content: "Gimana cara aktivasi kartu JakCard buat naik TransJakarta? Apakah bisa lewat aplikasi?", engagement: [12, 6, 0, 0] },
    { sourceType: "post", authorName: "Bank Jakarta", authorHandle: "bankjakarta.official", content: "Promo cashback 30% untuk pembayaran QRIS di 500 merchant kuliner Jakarta. Berlaku sampai akhir bulan!", engagement: [1300, 210, 150, 0] },
    { sourceType: "comment", authorName: "Sari Dewi", authorHandle: "sari.dewi", content: "CS-nya ghosting, komplain saya soal saldo hilang di Surabaya belum ada solusi seminggu. Ribet banget prosesnya.", engagement: [150, 73, 11, 0] },
  ],
  instagram: [
    { sourceType: "comment", authorName: "Dimas Pratama", authorHandle: "@dimasprtm", content: "Mantap, transfer antar bank sekarang gratis di JakOne. Di Depok makin sering pakai!", engagement: [230, 12, 0, 0] },
    { sourceType: "comment", authorName: "Ayu Lestari", authorHandle: "@ayulestari_", content: "Min, kenapa top up JakCard suka ngadat ya? Saldo kepotong tapi ga masuk, zonk banget di Bekasi", engagement: [95, 34, 0, 0] },
    { sourceType: "caption", authorName: "Bank Jakarta", authorHandle: "@bankjakarta", content: "Bangga mendukung beasiswa 1.000 anak Jakarta lewat program CSR Jakarta Cerdas. #JakartaCerdas #BankJakarta", engagement: [3400, 180, 90, 45000] },
    { sourceType: "comment", authorName: "Fajar Nugroho", authorHandle: "@fajarngrh", content: "Berapa biaya admin bulanan tabungan reguler? Kok di website ga jelas infonya?", engagement: [20, 9, 0, 0] },
    { sourceType: "comment", authorName: "Melati Putri", authorHandle: "@melatiputri", content: "Aplikasi kalah jauh sama Livin dan Jago, UI-nya masih jadul dan lemot pas gajian di Jakarta.", engagement: [310, 87, 0, 0] },
  ],
  x: [
    { sourceType: "post", authorName: "Andre Wijaya", authorHandle: "@andrewijaya", content: "JakOne Mobile ngadat lagi? Gabisa login dari pagi di Jakarta, OTP ga masuk-masuk. Ada yang sama? #BankJakarta", engagement: [520, 340, 210, 88000] },
    { sourceType: "post", authorName: "Jakarta Update", authorHandle: "@jktupdate", content: "Bank Jakarta resmi kerja sama dengan TransJakarta untuk integrasi pembayaran JakCard di seluruh koridor Jakarta.", engagement: [1500, 220, 480, 250000] },
    { sourceType: "reply", authorName: "Nadia Kirana", authorHandle: "@nadiakirana", content: "Hati-hati ada akun palsu ngaku CS Bank Jakarta minta OTP, jangan dikasih! Sudah banyak korban penipuan di Bandung.", engagement: [2100, 150, 990, 310000] },
    { sourceType: "post", authorName: "Rizky Ramadhan", authorHandle: "@rizkyrmdn", content: "Pindah ke Bank Jakarta karena bunga tabungannya gacor dan gratis biaya admin buat pelajar. So far puas di Surabaya.", engagement: [86, 14, 9, 12000] },
    { sourceType: "reply", authorName: "Tono Prasetyo", authorHandle: "@tonoprasetyo", content: "Kapan JakOne support fitur split bill kayak bank sebelah? Udah 2026 masa belum ada. Ribet.", engagement: [45, 20, 5, 8000] },
  ],
  threads: [
    { sourceType: "post", authorName: "Citra Anggraini", authorHandle: "@citra.anggraini", content: "Pengalaman buka rekening online Bank Jakarta cuma 10 menit di Yogyakarta, verifikasinya gercep. Recommended!", engagement: [340, 41, 18, 0] },
    { sourceType: "reply", authorName: "Galih Permana", authorHandle: "@galihprmn", content: "Tapi pas mau ganti nomor HP harus ke cabang Semarang, ribet. Harusnya bisa dari aplikasi.", engagement: [120, 33, 4, 0] },
    { sourceType: "post", authorName: "Wulan Safitri", authorHandle: "@wulansafitri", content: "Ada yang tahu limit transfer harian JakOne berapa? Mau bayar vendor takut kena limit.", engagement: [28, 15, 1, 0] },
  ],
  tiktok: [
    { sourceType: "video", authorName: "Keuangan Kita", authorHandle: "@keuangankita", title: "Review jujur mobile banking lokal", content: "Review jujur JakOne Mobile: fiturnya lengkap buat bayar PBB di Jakarta, tapi loginnya sering ngadat. Worth it ga? #BankJakarta", engagement: [15600, 890, 2300, 890000] },
    { sourceType: "comment", authorName: "Putri Amanda", authorHandle: "@putriamnd", content: "Aku kapok, dua kali top up zonk saldonya nyangkut, refundnya lemot banget di Medan", engagement: [670, 120, 0, 0] },
    { sourceType: "comment", authorName: "Bang Jek", authorHandle: "@bangjek_ojol", content: "Gara-gara video ini jadi tau bayar retribusi bisa dari HP. Makasih bang, langsung download! Gacor", engagement: [450, 38, 0, 0] },
    { sourceType: "video", authorName: "Dompet Tipis", authorHandle: "@dompettipis", title: "Bandingin bank digital 2026", content: "Bandingin biaya admin Bank Jakarta vs Livin vs Jago buat anak kos di Bandung. Hasilnya di luar dugaan. #fintech", engagement: [23000, 1500, 4100, 1200000] },
  ],
  youtube: [
    { sourceType: "video", authorName: "Melek Finansial", authorHandle: "melekfinansial", title: "Bank Jakarta vs Bank Digital: Mana Terbaik 2026?", content: "Ulasan lengkap Bank Jakarta JakOne Mobile: fitur QRIS, biaya admin, dan keamanan. Cocok buat warga Jakarta yang cari bank daerah.", engagement: [8900, 640, 210, 420000] },
    { sourceType: "video", authorName: "Tekno Review ID", authorHandle: "teknoreviewid", title: "First Impression Update JakOne Mobile Terbaru", content: "Update terbaru JakOne bawa UI baru, tapi masih ada yang lemot pas jam sibuk. Kita tes langsung dari Surabaya.", engagement: [3200, 380, 95, 145000] },
    { sourceType: "comment", authorName: "Hendra K", authorHandle: "hendrak", content: "Setuju, aplikasinya gacor sekarang setelah update. Transfer di Bandung lancar.", engagement: [120, 8, 0, 0] },
  ],
  news: [
    { sourceType: "article", authorName: "Kompas Ekonomi", authorHandle: "kompas.com", title: "Bank Jakarta Catat Pertumbuhan Laba 18 Persen pada Kuartal II 2026", content: "Bank Jakarta membukukan pertumbuhan laba bersih 18 persen secara tahunan, ditopang ekspansi kredit UMKM dan digitalisasi layanan JakOne di Jakarta.", engagement: [0, 45, 120, 34000], mediaTier: "tier1" },
    { sourceType: "article", authorName: "Detik Finance", authorHandle: "detik.com", title: "Nasabah Keluhkan Gangguan Layanan JakOne Mobile, Bank Jakarta Minta Maaf", content: "Sejumlah nasabah di Jakarta dan Bandung mengeluhkan gangguan login dan kegagalan transaksi pada aplikasi JakOne Mobile sejak Senin pagi. Bank Jakarta meminta maaf.", engagement: [0, 210, 340, 89000], mediaTier: "tier1" },
    { sourceType: "article", authorName: "Bisnis Indonesia", authorHandle: "bisnis.com", title: "OJK Soroti Keamanan Digital Perbankan Daerah, Termasuk Kasus Phishing", content: "Otoritas Jasa Keuangan meminta bank pembangunan daerah memperkuat keamanan digital menyusul maraknya penipuan phishing yang mengatasnamakan bank, termasuk Bank Jakarta.", engagement: [0, 88, 150, 41000], mediaTier: "tier2" },
    { sourceType: "article", authorName: "Warta Kota", authorHandle: "wartakota.com", title: "Bank Jakarta Salurkan Bantuan UMKM di Lima Wilayah Jakarta", content: "Melalui program CSR, Bank Jakarta menyalurkan bantuan modal dan pelatihan digital bagi 2.000 pelaku UMKM di lima wilayah DKI Jakarta.", engagement: [0, 12, 25, 8000], mediaTier: "local" },
  ],
  blog: [
    { sourceType: "article", authorName: "Blog Keuangan Rakyat", authorHandle: "keuanganrakyat.id", title: "Pengalaman 3 Bulan Pakai JakOne Mobile untuk UMKM", content: "Setelah 3 bulan pakai JakOne di toko saya di Jakarta, QRIS-nya gacor untuk transaksi harian meski kadang lemot pas malam. Review jujur biaya admin dan fitur.", engagement: [45, 18, 12, 3400], mediaTier: "blog" },
    { sourceType: "article", authorName: "Fintech Corner", authorHandle: "fintechcorner.id", title: "Bank Daerah Melawan Bank Digital: Studi Kasus Bank Jakarta", content: "Analisis strategi Bank Jakarta menghadapi Livin dan Jago. Keunggulan di ekosistem Pemprov DKI, tantangan di UX aplikasi yang masih ribet.", engagement: [78, 22, 30, 5600], mediaTier: "blog" },
  ],
  forum: [
    { sourceType: "thread", authorName: "user_jkt99", authorHandle: "u/user_jkt99", title: "Ada yang JakOne-nya ngadat hari ini?", content: "Dari pagi aplikasi Bank Jakarta ngadat di Jakarta, mau bayar tagihan zonk terus. Kalian gimana? Ribet kalau harus ke ATM.", engagement: [230, 145, 0, 0] },
    { sourceType: "thread", authorName: "hematpangkalkaya", authorHandle: "u/hematpangkalkaya", title: "Review bunga tabungan Bank Jakarta 2026", content: "Menurut gua bunga Bank Jakarta lumayan gacor buat pelajar, gratis admin. Tapi CS-nya suka ghosting kalau ada masalah. Ada yang di Bandung sama?", engagement: [180, 92, 0, 0] },
    { sourceType: "thread", authorName: "anak_kos_medan", authorHandle: "u/anak_kos_medan", title: "JakCard vs kartu bank lain buat transportasi", content: "Nanya dong, JakCard worth it ga buat harian? Di Medan belum semua merchant support. Prosesnya ribet ga sih?", engagement: [95, 60, 0, 0] },
  ],
};

/** Snapshot metrik akun mock per platform+handle (untuk Account Engagement). */
export const MOCK_ACCOUNT_METRICS: Record<string, {
  followers: number; posts: number; likes: number; comments: number; shares: number; views: number;
}> = {
  "instagram:@bankjakarta": { followers: 148000, posts: 1240, likes: 320000, comments: 18400, shares: 9200, views: 0 },
  "x:@bankjakarta": { followers: 92000, posts: 3400, likes: 210000, comments: 45000, shares: 88000, views: 0 },
  "youtube:@bankjakarta": { followers: 34000, posts: 210, likes: 89000, comments: 12000, shares: 0, views: 4200000 },
  "tiktok:@bankjakarta": { followers: 76000, posts: 180, likes: 540000, comments: 28000, shares: 41000, views: 8900000 },
  "instagram:@livinbymandiri": { followers: 2100000, posts: 3800, likes: 4200000, comments: 210000, shares: 95000, views: 0 },
  "instagram:@jago": { followers: 680000, posts: 2100, likes: 1800000, comments: 88000, shares: 42000, views: 0 },
};
