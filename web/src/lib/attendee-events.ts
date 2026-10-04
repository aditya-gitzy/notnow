import { notFound } from "next/navigation";
import { getSeedEventId } from "./db";
import { getEvent } from "./event";

export async function journeyEventId(requested?: string) {
  const id = requested || await getSeedEventId();
  const event = await getEvent(id);
  if (!event || event.simulation_run_id || event.access_mode !== "DEMO") notFound();
  return id;
}
