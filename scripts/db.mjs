import pg from "pg";
import { databaseConfig } from "./db-config.mjs";
import { migrate, seed } from "./database.mjs";

const command = process.argv[2];
if (!["setup", "migrate", "seed"].includes(command)) {
  throw new Error("Usage: node scripts/db.mjs <setup|migrate|seed>");
}

const client = new pg.Client(databaseConfig());
try {
  await client.connect();
  if (command !== "seed") await migrate(client);
  if (command !== "migrate") await seed(client);
} catch (error) {
  console.error(`Database ${command} failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
