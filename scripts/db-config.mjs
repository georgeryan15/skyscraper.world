import nextEnv from "@next/env";

// Match the local Next.js app's .env/.env.local loading and override order.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

export function databaseConfig() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Set DATABASE_URL in .env using .env.example, then run npm run db:up.");
  }
  return { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 };
}
