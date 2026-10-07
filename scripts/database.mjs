import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

const migrationsDirectory = new URL("../db/migrations/", import.meta.url);
const seedFile = new URL("../db/buildings.seed.json", import.meta.url);

/** Apply each version once, atomically. Pass a dedicated pg Client. */
export async function migrate(client) {
  await client.query("BEGIN");
  try {
    // Serialize concurrent setup commands for this database/schema.
    await client.query("SELECT pg_advisory_xact_lock(193576, 1)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const files = (await readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files) {
      const sql = await readFile(new URL(name, migrationsDirectory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const { rows } = await client.query("SELECT checksum FROM schema_migrations WHERE name = $1", [name]);
      if (rows.length) {
        if (rows[0].checksum !== checksum) throw new Error(`Applied migration ${name} changed; add a new migration instead.`);
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
      console.info(`Applied ${name}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** Insert missing catalog entries without overwriting subsequent DB edits. */
export async function seed(client) {
  const buildings = JSON.parse(await readFile(seedFile, "utf8"));
  let inserted = 0;
  await client.query("BEGIN");
  try {
    for (const building of buildings) {
      const result = await client.query(`
        INSERT INTO buildings (
          id, mapbox_model_id, name, address, neighborhood, longitude, latitude,
          height_m, floors, completed_year, architect, architectural_style, description, photo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO NOTHING
      `, [
        building.id, building.modelId, building.name, building.address, building.neighborhood,
        building.coordinates[0], building.coordinates[1], building.heightM,
        building.floors ?? null, building.completed ?? null, building.architect ?? null,
        building.style ?? null, building.summary, building.photo ? JSON.stringify(building.photo) : null,
      ]);
      inserted += result.rowCount;
    }
    await client.query("COMMIT");
    console.info(`Seeded ${inserted} buildings (${buildings.length - inserted} already present).`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  return inserted;
}
