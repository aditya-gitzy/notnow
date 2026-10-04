import type { EventRow } from "@/lib/event";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=1200&q=80";

export function EventArtwork({ event, className = "" }: { event: EventRow; className?: string }) {
  // The image is decorative because the event name appears beside it.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={event.image_url || FALLBACK_IMAGE} alt="" className={`h-full w-full object-cover ${className}`} />;
}
