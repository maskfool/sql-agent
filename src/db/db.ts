import { drizzle } from "drizzle-orm/libsql";
import { createClient, Client } from "@libsql/client";

let cachedClient: Client | null = null;
let cachedDb: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (cachedDb) return cachedDb;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set. Configure it in your environment.");
  }

  // authToken can be optional for local unauthenticated turso, but usually required on Vercel
  cachedClient = createClient({ url, authToken });
  cachedDb = drizzle(cachedClient);
  return cachedDb;
}