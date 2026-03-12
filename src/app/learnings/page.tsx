import { redirect } from "next/navigation";

export default function LearningsPage() {
  redirect("/brainstorm?tab=learnings");
}
