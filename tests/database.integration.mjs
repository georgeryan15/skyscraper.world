import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { databaseConfig } from "../scripts/db-config.mjs";
import { migrate, seed } from "../scripts/database.mjs";
import { listBuildings } from "../src/lib/building-repository.ts";
import { describeBuilding } from "../src/lib/buildings.ts";
import catalog from "../db/buildings.seed.json" with { type: "json" };

test("PostgreSQL migrations, catalog import, and app reads", async (t) => {
  const client = new pg.Client(databaseConfig());
  const schema = `test_buildings_${randomUUID().replaceAll("-", "")}`;
  await client.connect();
  try {
    // Use an isolated schema; never update or clear the user's building records.
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);

    await t.test("migration and seed reruns preserve all 10 buildings exactly", async () => {
      await migrate(client);
      assert.equal(await seed(client), 10);
      await migrate(client);
      assert.equal(await seed(client), 0);
      assert.equal((await client.query("SELECT count(*)::int AS count FROM schema_migrations")).rows[0].count, 1);

      const buildings = await listBuildings(client);
      assert.equal(buildings.length, 10);
      for (const expected of catalog) {
        const actual = buildings.find((building) => building.id === expected.id);
        assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
        assert.equal(describeBuilding({ id: expected.modelId }, buildings).name, expected.name);
      }
      assert.equal(buildings[0].heightM, 472);
      assert.equal(buildings.find((building) => building.id === "chrysler-building").modelId, "17031054187970504179");
    });

    await t.test("database edits appear in app reads and survive reseeding", async () => {
      const before = (await client.query("SELECT updated_at FROM buildings WHERE id = 'empire-state-building'")).rows[0].updated_at;
      await client.query(`UPDATE buildings SET description = $1,
        floors = NULL, completed_year = NULL, photo = NULL,
        additional_stats = '{"observationDeckHeightM": 320}'::jsonb
        WHERE id = 'empire-state-building'`, ["An edited database description."]);
      assert.equal(await seed(client), 0);
      const building = (await listBuildings(client)).find((entry) => entry.id === "empire-state-building");
      assert.equal(building.summary, "An edited database description.");
      assert.equal(building.floors, undefined);
      assert.equal(building.completed, undefined);
      assert.equal(building.photo, undefined);
      const stored = (await client.query("SELECT updated_at, additional_stats FROM buildings WHERE id = 'empire-state-building'")).rows[0];
      assert.ok(stored.updated_at > before);
      assert.deepEqual(stored.additional_stats, { observationDeckHeightM: 320 });
    });

    await t.test("invalid stats, locations, and duplicate Mapbox identities are rejected", async () => {
      for (const assignment of ["height_m = -1", "floors = 0", "completed_year = 0", "longitude = 181", "latitude = 91", "photo = '{}'::jsonb"]) {
        await assert.rejects(client.query(`UPDATE buildings SET ${assignment} WHERE id = 'empire-state-building'`), { code: "23514" });
      }
      await assert.rejects(client.query(`UPDATE buildings SET mapbox_model_id = '17031054187970504179'
        WHERE id = 'empire-state-building'`), { code: "23505" });
      // Failed statements must not alter the existing records.
      assert.equal((await listBuildings(client)).find((building) => building.id === "empire-state-building").modelId, "10256212561568024566");
    });
  } finally {
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await client.end();
    }
  }
});
