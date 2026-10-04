import { redirect } from "next/navigation";

// The app always begins at the attendee/organiser role chooser.
export default function Home() {
  redirect("/auth");
}
