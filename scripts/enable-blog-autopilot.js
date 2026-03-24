const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const getRes = await fetch(url + '/rest/v1/workspaces?slug=eq.happysleep&select=id,settings', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  const data = await getRes.json();
  if (data.length === 0) { console.log('No workspace found'); return; }

  const ws = data[0];
  const settings = ws.settings || {};
  settings.blog_autopilot_enabled = true;
  settings.blog_articles_per_day = 1;

  const patchRes = await fetch(url + '/rest/v1/workspaces?id=eq.' + ws.id, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ settings })
  });
  const result = await patchRes.json();
  console.log('Blog autopilot enabled:', result[0].settings.blog_autopilot_enabled);
  console.log('Articles per day:', result[0].settings.blog_articles_per_day);
}

main().catch(err => console.error(err));
