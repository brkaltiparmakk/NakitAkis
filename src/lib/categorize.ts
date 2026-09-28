import { foldTr } from "@/lib/import/normalize";

export type Rule = { pattern: string; categoryId: string };

// Karşılaştırma biçimi: Türkçe sadeleştirme + harf harf yazılmış adları birleştirme ("a l p e t" → "alpet")
export function matchText(s: string): string {
  return foldTr(s).replace(/(?<![a-z0-9])(?:[a-z] ){2,}[a-z](?![a-z0-9])/g, (m) => m.replace(/ /g, ""));
}

// Anahtar kelime bir kelimenin başından eşleşmeli ("bim" → "BIM MARKET" evet, "IBIM" hayır).
// En uzun eşleşen anahtar kelime kazanır ("migros sanal" > "migros").
export function categorize(description: string, rules: Rule[]): string | null {
  const d = ` ${matchText(description)}`;
  let best: { rule: Rule; len: number } | null = null;
  for (const r of rules) {
    const p = foldTr(r.pattern);
    if (!p || (best && p.length <= best.len)) continue;
    let i = d.indexOf(p);
    while (i > 0 && /[a-z0-9]/.test(d[i - 1])) i = d.indexOf(p, i + 1);
    if (i > 0) best = { rule: r, len: p.length };
  }
  return best?.rule.categoryId ?? null;
}

// Bankanın kendi etiketi (Garanti "Etiket" sütunu) → uygulamadaki kategori adı. Kural eşleşmezse kullanılır.
// "Para Transferi" bilinçli olarak eşlenmez: gelen para gelir de olabilir, kendi hesabınızdan transfer de.
const BANK_LABELS: Record<string, string> = {
  "kart odemesi": "Kart Ödemesi",
  kredi: "Kredi Taksidi",
  "faiz / komisyon": "Faiz / Masraf",
  market: "Market",
  "yeme / icme": "Restoran / Kafe",
  ulasim: "Ulaşım / Yakıt",
  akaryakit: "Ulaşım / Yakıt",
  "eglence / hobi": "Abonelik / Eğlence",
  elektronik: "Alışveriş",
  giyim: "Alışveriş",
  "giyim / aksesuar": "Alışveriş",
  saglik: "Sağlık",
  egitim: "Eğitim",
  fatura: "Faturalar",
  "fatura / abonelik": "Faturalar",
  "kurum odemesi": "Faturalar",
  "emeklilik / sigorta": "Sigorta / BES",
  "kisisel hizmet": "Diğer Gider",
  maas: "Maaş",
  "para cekme": "Nakit Çekim",
};

export function categoryFromBankLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  return BANK_LABELS[foldTr(label).replace(/\s*\/\s*/g, " / ")] ?? null;
}

// Bankaların açıklamalara eklediği, işyerini tanımlamayan kelimeler
const STOP_WORDS = new Set([
  "istanbul", "ankara", "izmir", "kocaeli", "tr", "tur", "temassiz", "xxxx", "iyzico", "sanal", "pos",
  "cork", "san", "francisco", "inc", "ltd", "sti", "a.s", "mobil", "fast", "havale", "eft",
]);

// Hesap sahibinin adından transfer kuralı: bankalar soyadı kırpabildiği için ("AD SOYA") soyadın başı alınır.
export function holderPattern(name: string): string | null {
  const words = foldTr(name).replace(/[^a-z ]/g, " ").split(" ").filter(Boolean);
  if (words.length < 2) return null;
  const last = words[words.length - 1];
  return [...words.slice(0, -1), last.slice(0, Math.max(4, last.length - 3))].join(" ");
}

// Kullanıcı bir işlemin kategorisini değiştirdiğinde önerilecek anahtar kelime:
// açıklamadaki ilk anlamlı kelimeler (rakamlar, şehir/ülke ekleri ve kart numaraları atılır).
export function suggestPattern(description: string): string {
  const words = matchText(description)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3 && !/\d/.test(w) && !STOP_WORDS.has(w));
  return words.slice(0, 2).join(" ");
}

export const DEFAULT_CATEGORIES: { name: string; kind: "income" | "expense" | "transfer"; color: string; patterns: string[] }[] = [
  { name: "Maaş", kind: "income", color: "#16a34a", patterns: ["maas", "ucret odemesi", "personel odeme"] },
  { name: "Diğer Gelir", kind: "income", color: "#65a30d", patterns: ["faiz geliri", "iade"] },
  { name: "Market", kind: "expense", color: "#ea580c", patterns: ["migros", "a101", "bim", "sok market", "carrefour", "file market", "macrocenter", "getir", "kasap", "manav", "firin"] },
  { name: "Faturalar", kind: "expense", color: "#0891b2", patterns: ["turkcell", "vodafone", "turk telekom", "enerjisa", "igdas", "iski", "aski", "ck enerji", "vdfone", "superonline", "fatura"] },
  { name: "Kira / Aidat", kind: "expense", color: "#7c3aed", patterns: ["kira", "aidat", "site yonetim"] },
  { name: "Ulaşım / Yakıt", kind: "expense", color: "#2563eb", patterns: ["shell", "opet", "petrol ofisi", "bp", "total", "istanbulkart", "hgs", "ogs", "uber", "bitaksi", "martı", "alpet", "aras petrol", "otoyol", "ispark", "otopark", "toplu tasima"] },
  { name: "Restoran / Kafe", kind: "expense", color: "#db2777", patterns: ["yemeksepeti", "trendyol yemek", "tiklagelsin", "yemekpay", "starbucks", "burger king", "restoran", "restaurant", "pizza", "cafe", "chofee", "kahve"] },
  { name: "Alışveriş", kind: "expense", color: "#c026d3", patterns: ["trendyol", "hepsiburada", "hepsipay", "amazon", "n11", "pttavm", "getmobil", "zara", "lcw", "koton", "decathlon"] },
  { name: "Abonelik / Eğlence", kind: "expense", color: "#9333ea", patterns: ["netflix", "spotify", "youtube", "apple.com", "google", "disney", "exxen", "blutv", "steam", "ssportplus", "openai", "github", "opencode"] },
  { name: "Sigorta / BES", kind: "expense", color: "#0f766e", patterns: ["sigorta", "emeklilik", "eureko", "allianz", "axa", "anadolu hayat"] },
  { name: "Sağlık", kind: "expense", color: "#dc2626", patterns: ["eczane", "hastane", "saglik", "klinik"] },
  { name: "Eğitim", kind: "expense", color: "#0d9488", patterns: ["okul", "kurs", "egitim", "universite"] },
  { name: "Kredi Taksidi", kind: "expense", color: "#475569", patterns: ["kredi taksit", "kredi odeme", "konut kredisi", "kredi tahs", "amacli kredi", "taksit tahs"] },
  { name: "Faiz / Masraf", kind: "expense", color: "#b91c1c", patterns: ["faiz", "kkdf", "bsmv", "masraf", "komisyon", "kart ucreti", "yillik uyelik", "kesinti ve ekleri", "arti para fon payi", "arti para vergi"] },
  { name: "Nakit Çekim", kind: "expense", color: "#78716c", patterns: ["atm", "nakit cekim", "para cekme"] },
  { name: "Diğer Gider", kind: "expense", color: "#94a3b8", patterns: [] },
  { name: "Kart Ödemesi", kind: "transfer", color: "#64748b", patterns: ["kredi karti odeme", "kart odemesi", "kk odeme", "kredi karti borc", "odemeniz icin tesekkur", "karti odeme", "k.karti odeme", "bonusflas odeme", "cep sube odeme"] },
  { name: "Hesaplar Arası Transfer", kind: "transfer", color: "#6b7280", patterns: ["virman", "hesaplar arasi", "kendi hesabina", "avans hes.kull"] },
];
