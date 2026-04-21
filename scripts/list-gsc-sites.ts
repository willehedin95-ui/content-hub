import { listSites } from "../src/lib/gsc";

async function main() {
  const sites = await listSites();
  console.log(JSON.stringify(sites, null, 2));
}
main();
