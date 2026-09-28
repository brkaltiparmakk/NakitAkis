// Mükerrer kayıt planı: çakışan ekstreler aynı işlemi tekrar getirebilir. Aynı anahtar (tarih+tutar+açıklama)
// veritabanında e kez, yeni dosyada n kez varsa yalnızca n−e tanesi eklenir. Böylece aynı gün aynı yerden
// yapılmış iki gerçek harcama korunur, ama tekrar yüklenen dönem atlanır.
export function planInserts<T extends { key: string }>(
  rows: T[],
  existingCounts: Map<string, number>,
): { toInsert: T[]; skipped: number } {
  const seen = new Map<string, number>();
  const toInsert: T[] = [];
  let skipped = 0;
  for (const row of rows) {
    const n = (seen.get(row.key) ?? 0) + 1;
    seen.set(row.key, n);
    if (n > (existingCounts.get(row.key) ?? 0)) toInsert.push(row);
    else skipped++;
  }
  return { toInsert, skipped };
}
