import { redirect } from "next/navigation";

export default function SpyRedirect() {
  redirect("/ad-library?tab=scraped");
}
