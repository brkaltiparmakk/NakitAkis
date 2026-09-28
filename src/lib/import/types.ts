import type { ColumnMapping } from "@/db/schema";
import type { Cell } from "./normalize";

export type ParsedTx = {
  date: string;
  description: string;
  amount: number;
  installmentNo: number | null;
  installmentTotal: number | null;
  // Bankanın verdiği kategori etiketi (varsa)
  label?: string | null;
};

export type StatementSummary = {
  statementDate: string | null;
  dueDate: string | null;
  totalDue: number | null;
  minDue: number | null;
};

// Sunucunun dosyayı okuduktan sonra tarayıcıya döndürdüğü önizleme
export type ImportPreview =
  | {
      kind: "table";
      fileName: string;
      rows: Cell[][];
      mapping: ColumnMapping | null;
      // Tablonun üstündeki özet satırlarından okunan ekstre bilgisi (kart ekstrelerinde)
      summary: StatementSummary;
      // Dökümdeki hesap sahibi adı; kendi hesaplarınız arası transferleri tanımak için
      holderName: string | null;
    }
  | {
      kind: "pdf";
      fileName: string;
      lines: string[];
      transactions: ParsedTx[];
      summary: StatementSummary;
    };
