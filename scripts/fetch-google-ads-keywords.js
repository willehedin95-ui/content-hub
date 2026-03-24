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

const { google } = require('googleapis');

async function main() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GDRIVE_OAUTH_CLIENT_ID,
    process.env.GDRIVE_OAUTH_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GDRIVE_OAUTH_REFRESH_TOKEN });
  const { token } = await oauth2.getAccessToken();

  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, '');
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  const headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'developer-token': devToken,
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId.replace(/-/g, '');

  const query = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      campaign.name,
      ad_group.name,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
  `;

  const res = await fetch(
    'https://googleads.googleapis.com/v20/customers/' + customerId + '/googleAds:searchStream',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    }
  );

  if (res.status !== 200) {
    const text = await res.text();
    console.error('Error:', res.status, text.slice(0, 1000));
    return;
  }

  const batches = await res.json();
  const rows = [];
  for (const batch of batches) {
    if (batch.results) rows.push(...batch.results);
  }

  console.log('Total keywords found:', rows.length);
  console.log('');

  // Group by campaign
  const byCampaign = {};
  for (const r of rows) {
    const campaign = r.campaign.name;
    if (!byCampaign[campaign]) byCampaign[campaign] = [];
    byCampaign[campaign].push(r);
  }

  let totalSpend = 0;
  let totalClicks = 0;
  let totalConv = 0;
  let totalConvValue = 0;

  for (const [campaign, keywords] of Object.entries(byCampaign)) {
    console.log('=== ' + campaign + ' (' + keywords.length + ' keywords) ===');
    console.log('');

    for (const r of keywords) {
      const spend = Number(r.metrics.costMicros) / 1000000;
      const clicks = Number(r.metrics.clicks);
      const conv = Number(r.metrics.conversions);
      const convValue = Number(r.metrics.conversionsValue);
      const kw = r.adGroupCriterion.keyword.text;
      const matchType = r.adGroupCriterion.keyword.matchType;
      const adGroup = r.adGroup.name;

      totalSpend += spend;
      totalClicks += clicks;
      totalConv += conv;
      totalConvValue += convValue;

      console.log(
        kw.padEnd(45) +
        matchType.padEnd(14) +
        adGroup.substring(0, 30).padEnd(32) +
        (spend.toFixed(0) + ' SEK').padStart(10) +
        (clicks + '').padStart(8) +
        (conv.toFixed(1)).padStart(8) +
        (convValue.toFixed(0) + ' SEK').padStart(12)
      );
    }
    console.log('');
  }

  console.log('=== TOTALS ===');
  console.log('Keywords:', rows.length);
  console.log('Total spend:', totalSpend.toFixed(0), 'SEK');
  console.log('Total clicks:', totalClicks);
  console.log('Total conversions:', totalConv.toFixed(1));
  console.log('Total conversion value:', totalConvValue.toFixed(0), 'SEK');
}

main().catch(err => console.error(err));
