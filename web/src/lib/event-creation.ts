import { randomUUID } from "node:crypto";
import { getDb } from "./db";

export type NewEvent = { name: string; opensAt: string; closesAt: string; eventStartsAt: string; venue: string; imageUrl: string | null; seats: number; batchSize: number; holdMinutes: number };

export async function createListedEvent(input: NewEvent) {
  const db = await getDb();
  const id = randomUUID();
  const now = Date.now();
  const opens = new Date(input.opensAt).getTime();
  const closes = new Date(input.closesAt).getTime();
  const status = opens <= now ? "ENTRY_OPEN" : "DRAFT";
  await db.query(
    `INSERT INTO events (id,name,status,entry_opens_at,entry_closes_at,event_starts_at,venue,image_url,
       total_inventory,available,reserved,sold,batch_size,reservation_ttl_seconds,is_listed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,0,0,$10,$11,true)`,
    [id, input.name, status, input.opensAt, input.closesAt, input.eventStartsAt, input.venue, input.imageUrl,
      input.seats, input.batchSize, input.holdMinutes * 60],
  );
  return id;
}
