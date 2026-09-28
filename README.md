# Nakit Akış

Banka hesap dökümleri ve kredi kartı ekstrelerinden kişisel nakit akışı takibi.

- **Yükleme:** Excel (.xlsx/.xls), CSV ve PDF. Sütunlar otomatik bulunur, gerekirse elle eşlenir ve eşleme hesap bazında hatırlanır. Çakışan dönemlerdeki mükerrer işlemler otomatik atlanır.
- **Kategoriler:** anahtar kelime kuralları; bir işlemin kategorisini düzeltirken kural olarak kaydedebilirsiniz.
- **Nakit akış tablosu:** günlük, haftalık veya aylık görünüm ve seçilebilir tarih aralığı; geçmiş gerçekleşen, gelecek tahmini.
- **Projeksiyon:** 3, 6, 12 veya 24 ay. Düzenli gelir/giderler, kredi taksitleri, kart ekstre ödemeleri (asgari veya tam; devreden borca akdi faiz + KKDF/BSMV), kalan taksitler ve KMH faizi hesaba katılır.

## Teknoloji

Next.js 16 (App Router, server actions) · Neon Postgres · Drizzle ORM · Tailwind CSS 4 · Recharts. Vercel'de `fra1` bölgesinde çalışır.

## Geliştirme

```bash
cp .env.example .env.local   # DATABASE_URL ve AUTH_SECRET'i doldurun
npm install
npm run db:migrate           # drizzle/ altındaki migration'ları uygular
npm run dev
npm test                     # ayrıştırıcı, mükerrer kontrolü ve projeksiyon testleri
```

Şema değişikliğinde: `src/db/schema.ts` dosyasını düzenleyin, `npm run db:generate` ile migration üretin, `npm run db:migrate` ile uygulayın.

## Güvenlik

- Tek kullanıcılıdır: ilk hesap oluşturulduktan sonra kayıt kapanır.
- Oturum, `AUTH_SECRET` ile imzalanan httpOnly bir çerezde tutulur.
- Gerçek ekstre dosyalarını repoya eklemeyin; `.gitignore` pdf/xls/xlsx/csv dosyalarını dışarıda tutar.
