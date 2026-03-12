import { redirect } from "next/navigation";

export default function HooksPage() {
  redirect("/brainstorm?tab=hooks");
}
