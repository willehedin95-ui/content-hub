import { redirect } from "next/navigation";

export default function ABTestsPage() {
  redirect("/pages?tab=ab-tests");
}
