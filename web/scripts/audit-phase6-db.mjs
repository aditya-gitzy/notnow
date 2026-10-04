import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite(process.env.PGLITE_DATA_DIR ?? ".data/pglite");
try {
  const events = (await db.query(`SELECT id,total_inventory,available,reserved,sold FROM events`)).rows;
  for (const event of events) {
    assert.equal(event.available + event.reserved + event.sold, event.total_inventory, `inventory ${event.id}`);
    const orders = (await db.query("SELECT count(*)::int AS count, count(DISTINCT account_id)::int AS accounts FROM orders WHERE event_id=$1", [event.id])).rows[0];
    assert.equal(orders.count, event.sold, `orders versus sold ${event.id}`);
    assert.equal(orders.count, orders.accounts, `duplicate orders ${event.id}`);
    const queue = (await db.query("SELECT count(*)::int AS count, count(DISTINCT account_id)::int AS accounts FROM queue_entries WHERE event_id=$1", [event.id])).rows[0];
    assert.equal(queue.count, queue.accounts, `duplicate entries ${event.id}`);
  }
  const runs = (await db.query("SELECT id,event_id,results FROM simulation_runs WHERE status='COMPLETED' AND event_id IS NOT NULL AND config->>'kind' IS DISTINCT FROM 'ATTACK_DEMO'")).rows;
  for (const run of runs) {
    const entries = (await db.query("SELECT count(*)::int AS count FROM queue_entries WHERE event_id=$1", [run.event_id])).rows[0].count;
    const orders = (await db.query("SELECT count(*)::int AS count FROM orders WHERE event_id=$1", [run.event_id])).rows[0].count;
    assert.equal(entries, run.results.fairDrop.acceptedEntries, `Lab entry count ${run.id}`);
    assert.equal(orders, run.results.fairDrop.allocations, `Lab allocation count ${run.id}`);
    assert.equal(orders, run.results.fairDrop.inventory.sold, `Lab sold count ${run.id}`);
  }
  console.log(JSON.stringify({ eventsAudited: events.length, completedRunsAudited: runs.length,
    inventoryBalanced: true, uniqueEntries: true, uniqueOrders: true, labMatchesDatabase: true }));
} finally {
  await db.close();
}
