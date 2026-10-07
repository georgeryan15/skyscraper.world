import "server-only";
import { Pool } from "pg";
import { listBuildings } from "./building-repository";

const globalForDatabase = globalThis as typeof globalThis & { skyscraperPool?: Pool };
let pool: Pool | undefined;

function getPool(): Pool {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Configure .env and run npm run db:up.");
  }
  pool = globalForDatabase.skyscraperPool ?? new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  if (!globalForDatabase.skyscraperPool) {
    pool.on("error", (error) => console.error("PostgreSQL idle connection error:", error));
  }
  // Keep a single pool across development hot reloads.
  if (process.env.NODE_ENV !== "production") globalForDatabase.skyscraperPool = pool;
  return pool;
}

export async function getBuildings() {
  return listBuildings(getPool());
}
