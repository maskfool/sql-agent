import { drizzle } from "drizzle-orm/libsql";
import { createClient, Client } from "@libsql/client";

let cachedTurso: Client | null = null;
let cachedDb: ReturnType<typeof drizzle> | null = null;

function getTursoClient(): Client {
  if (cachedTurso) return cachedTurso;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set. Configure it in your environment.");
  }

  cachedTurso = createClient({
    url,
    authToken,
  });
  
  return cachedTurso;
}

export function getDb() {
  if (cachedDb) return cachedDb;

  const turso = getTursoClient();
  cachedDb = drizzle(turso);
  return cachedDb;
}

// Export client for raw SQL execution (needed for tool queries)
export function getClient() {
  return getTursoClient();
}