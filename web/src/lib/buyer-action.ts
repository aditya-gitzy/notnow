import type { BuyerState, EventRow } from "./event";

export type BuyerAction = { label: string; href?: string; join?: boolean; disabled?: boolean };

export function getBuyerAction(event: EventRow, buyer: BuyerState): BuyerAction {
  if (buyer.state === "NOT_SIGNED_IN") return { label: "Join the drop", href: "/auth" };
  if (buyer.state === "REVIEW_REQUIRED") return { label: "Awaiting organizer review", disabled: true };
  if (buyer.state === "BLOCKED") return { label: "Contact organizer", disabled: true };
  if (buyer.state === "CONFIRMED") return { label: "View my ticket", href: "/ticket" };
  if (buyer.state === "RESERVED" || buyer.state === "ADMITTED") return { label: "Confirm seat", href: "/confirm" };
  if (buyer.state === "QUEUED") return { label: "View my status", href: "/waiting-room" };
  if (event.status === "ENTRY_OPEN" && Date.now() >= new Date(event.entry_opens_at).getTime() && Date.now() < new Date(event.entry_closes_at).getTime()) {
    return { label: "Join the waiting room", join: true };
  }
  return { label: event.status === "SOLD_OUT" ? "Sold out" : Date.now() < new Date(event.entry_opens_at).getTime() ? "Entry opens soon" : "Entry is closed", disabled: true };
}
