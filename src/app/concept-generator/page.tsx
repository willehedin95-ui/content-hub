import { redirect } from "next/navigation";

export default function ConceptGeneratorRedirect() {
  redirect("/brainstorm?tab=queue");
}
