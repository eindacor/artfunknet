import { redirect } from "next/navigation";

export default function PlayerHallOfFamePage() {
  redirect("/play?section=history#hall-of-fame");
}
