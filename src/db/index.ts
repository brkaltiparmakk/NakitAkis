import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let instance: NeonHttpDatabase<typeof schema> | undefined;

// Derleme sırasında DATABASE_URL olmayabilir; bağlantı ilk kullanımda kurulur.
export function db() {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL tanımlı değil");
    instance = drizzle(neon(url), { schema });
  }
  return instance;
}

export { schema };
