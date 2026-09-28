import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  numeric,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Tutarlar numeric(14,2) olarak tutulur; drizzle bunları string döndürür, kodda toNum() ile sayıya çevrilir.
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
// Aylık faiz oranları (0.0425 = %4,25)
const rate = (name: string) => numeric(name, { precision: 8, scale: 5 });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ColumnMapping = {
  headerRow: number;
  date: number;
  description: number;
  amount?: number;
  debit?: number;
  credit?: number;
  balance?: number;
  // Bankanın kendi kategori/etiket sütunu (Garanti'de "Etiket")
  label?: number;
  invertSign: boolean;
};

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    bank: text("bank").notNull(), // garanti | isbank | yapikredi | akbank | diger
    type: text("type").notNull(), // checking | credit_card
    // Bakiye çapası: balanceDate günü sonundaki bakiye. Dökümden otomatik ya da elle girilir.
    balanceAmount: money("balance_amount"),
    balanceDate: date("balance_date"),
    balanceSource: text("balance_source"), // manual | statement
    // Vadesiz hesap: KMH
    kmhLimit: money("kmh_limit"),
    kmhMonthlyRate: rate("kmh_monthly_rate"),
    // Kredi kartı
    cardLimit: money("card_limit"),
    statementDay: integer("statement_day"),
    dueDay: integer("due_day"),
    minPaymentRate: rate("min_payment_rate"),
    cardMonthlyRate: rate("card_monthly_rate"),
    paymentMode: text("payment_mode").default("minimum"), // minimum | full
    expectedMonthlySpend: money("expected_monthly_spend"),
    payFromAccountId: uuid("pay_from_account_id"),
    columnMapping: jsonb("column_mapping").$type<ColumnMapping>(),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // income | expense | transfer
    color: text("color").notNull().default("#64748b"),
  },
  (t) => [uniqueIndex("categories_user_name_idx").on(t.userId, t.name)],
);

export const categoryRules = pgTable(
  "category_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(), // küçük harfe çevrilmiş anahtar kelime
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("user"), // seed | user
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rules_user_pattern_idx").on(t.userId, t.pattern)],
);

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  rowCount: integer("row_count").notNull(),
  insertedCount: integer("inserted_count").notNull(),
  skippedCount: integer("skipped_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    description: text("description").notNull(),
    // İşaretli tutar: + hesaba giriş (ya da karta ödeme/iade), − çıkış (ya da kart harcaması)
    amount: money("amount").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    installmentNo: integer("installment_no"),
    installmentTotal: integer("installment_total"),
    dedupeKey: text("dedupe_key").notNull(),
    importId: uuid("import_id").references(() => imports.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tx_user_date_idx").on(t.userId, t.date),
    index("tx_account_date_idx").on(t.accountId, t.date),
    index("tx_dedupe_idx").on(t.accountId, t.dedupeKey),
  ],
);

export const cardStatements = pgTable(
  "card_statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    statementDate: date("statement_date").notNull(),
    dueDate: date("due_date").notNull(),
    totalDue: money("total_due").notNull(),
    minDue: money("min_due").notNull(),
    importId: uuid("import_id").references(() => imports.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("statements_account_date_idx").on(t.accountId, t.statementDate)],
);

export const recurringItems = pgTable("recurring_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amount: money("amount").notNull(), // her zaman pozitif
  direction: text("direction").notNull(), // in | out
  frequency: text("frequency").notNull(), // monthly | weekly | yearly
  dayOfMonth: integer("day_of_month"),
  dayOfWeek: integer("day_of_week"), // 1=Pazartesi … 7=Pazar
  monthOfYear: integer("month_of_year"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  // true: tutar, kategorinin son 12 aylık ortalamasından her seferinde yeniden hesaplanır (amount yedek değerdir)
  autoAverage: boolean("auto_average").notNull().default(false),
});

export const loans = pgTable("loans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // konut | ihtiyac | tasit | diger
  installmentAmount: money("installment_amount").notNull(),
  nextPaymentDate: date("next_payment_date").notNull(),
  remainingInstallments: integer("remaining_installments").notNull(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  note: text("note"),
});

// Kişisel alacak/borçlar: tarihi biliniyorsa projeksiyona girer, bilinmiyorsa ayrıca gösterilir
export const receivables = pgTable("receivables", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  direction: text("direction").notNull(), // in: alacak (bana gelecek) | out: borç (ben ödeyeceğim)
  amount: money("amount").notNull(),
  expectedDate: date("expected_date"),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  note: text("note"),
  settled: boolean("settled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Account = typeof accounts.$inferSelect;
export type Receivable = typeof receivables.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type RecurringItem = typeof recurringItems.$inferSelect;
export type Loan = typeof loans.$inferSelect;
export type CardStatement = typeof cardStatements.$inferSelect;
