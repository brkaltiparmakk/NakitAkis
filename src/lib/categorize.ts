import { foldTr } from "@/lib/import/normalize";

export type Rule = { pattern: string; categoryId: string };

// En uzun eşleşen anahtar kelime kazanır ("migros sanal" > "migros")
export function categorize(description: string, rules: Rule[]): string | null {
  const d = foldTr(description);
  let best: Rule | null = null;
  for (const r of rules) {
    const p = foldTr(r.pattern);
    if (p && d.includes(p) && (!best || p.length > foldTr(best.pattern).length)) best = r;
  }
  return best?.categoryId ?? null;
}

// Kullanıcı bir işlemin kategorisini değiştirdiğinde önerilecek anahtar kelime:
// açıklamadaki ilk anlamlı kelimeler (rakamlar, şehir/ülke ekleri ve kart numaraları atılır).
export function suggestPattern(description: string): string {
  const words = foldTr(description)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3 && !/\d/.test(w) && !["istanbul", "ankara", "izmir", "tr", "tur"].includes(w));
  return words.slice(0, 2).join(" ");
}

export const DEFAULT_CATEGORIES: { name: string; kind: "income" | "expense" | "transfer"; color: string; patterns: string[] }[] = [
  { name: "Maaş", kind: "income", color: "#16a34a", patterns: ["maas", "ucret odemesi", "personel odeme"] },
  { name: "Diğer Gelir", kind: "income", color: "#65a30d", patterns: ["faiz geliri", "iade"] },
  { name: "Market", kind: "expense", color: "#ea580c", patterns: ["migros", "a101", "bim ", "sok market", "carrefour", "file market", "macrocenter", "getir"] },
  { name: "Faturalar", kind: "expense", color: "#0891b2", patterns: ["turkcell", "vodafone", "turk telekom", "enerjisa", "igdas", "iski", "aski", "ck enerji", "superonline", "fatura"] },
  { name: "Kira / Aidat", kind: "expense", color: "#7c3aed", patterns: ["kira", "aidat", "site yonetim"] },
  { name: "Ulaşım / Yakıt", kind: "expense", color: "#2563eb", patterns: ["shell", "opet", "petrol ofisi", "bp ", "total", "istanbulkart", "hgs", "ogs", "uber", "bitaksi", "martı"] },
  { name: "Restoran / Kafe", kind: "expense", color: "#db2777", patterns: ["yemeksepeti", "trendyol yemek", "starbucks", "restoran", "cafe", "kahve"] },
  { name: "Alışveriş", kind: "expense", color: "#c026d3", patterns: ["trendyol", "hepsiburada", "amazon", "n11", "zara", "lcw", "koton", "decathlon"] },
  { name: "Abonelik / Eğlence", kind: "expense", color: "#9333ea", patterns: ["netflix", "spotify", "youtube", "apple.com", "google", "disney", "exxen", "blutv", "steam"] },
  { name: "Sağlık", kind: "expense", color: "#dc2626", patterns: ["eczane", "hastane", "saglik", "klinik"] },
  { name: "Eğitim", kind: "expense", color: "#0d9488", patterns: ["okul", "kurs", "egitim", "universite"] },
  { name: "Kredi Taksidi", kind: "expense", color: "#475569", patterns: ["kredi taksit", "kredi odeme", "konut kredisi"] },
  { name: "Faiz / Masraf", kind: "expense", color: "#b91c1c", patterns: ["faiz", "kkdf", "bsmv", "masraf", "komisyon", "kart ucreti", "yillik uyelik"] },
  { name: "Nakit Çekim", kind: "expense", color: "#78716c", patterns: ["atm", "nakit cekim", "para cekme"] },
  { name: "Diğer Gider", kind: "expense", color: "#94a3b8", patterns: [] },
  { name: "Kart Ödemesi", kind: "transfer", color: "#64748b", patterns: ["kredi karti odeme", "kart odemesi", "kk odeme", "kredi karti borc", "odemeniz icin tesekkur"] },
  { name: "Hesaplar Arası Transfer", kind: "transfer", color: "#6b7280", patterns: ["virman", "hesaplar arasi", "kendi hesabina"] },
];
