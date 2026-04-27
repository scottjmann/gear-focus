/**
 * find-bis-ids.js  —  one-shot utility
 *
 * Searches the Blizzard Game Data API for every BiS item by name,
 * tries live → PTR → PTR2 → Beta namespaces in order, then
 * automatically patches itemId and ilvl into public/bis.js.
 *
 * Usage:
 *   node find-bis-ids.js
 *
 * Requires a valid .env with BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET.
 */

require('dotenv').config();
const fetch  = require('node-fetch');
const fs     = require('fs');
const path   = require('path');

// ── BiS item names (must match public/bis.js BIS_LIST keys exactly) ──
const ITEMS = [
  { slot: 'HEAD',      name: "Blind Oath's Winged Crest" },
  { slot: 'NECK',      name: "Eternal Voidsong Chain" },
  { slot: 'SHOULDER',  name: "Blind Oath's Seraphguards" },
  { slot: 'BACK',      name: "Draconic Nullcape" },
  { slot: 'CHEST',     name: "Blind Oath's Raiment" },
  { slot: 'WRIST',     name: "Martyr's Bindings" },
  { slot: 'HANDS',     name: "Vilehex Bonds" },
  { slot: 'WAIST',     name: "Arcanoweave Cord" },
  { slot: 'LEGS',      name: "Blind Oath's Leggings" },
  { slot: 'FEET',      name: "Lightbinder Treads" },
  { slot: 'FINGER_1',  name: "Omission of Light" },
  { slot: 'FINGER_2',  name: "Eye of Midnight" },
  { slot: 'TRINKET_1', name: "Gaze of the Alnseer" },
  { slot: 'TRINKET_2', name: "Shadow of the Empyrean Requiem" },
  { slot: 'MAIN_HAND', name: "Belo'melorn, the Shattered Talon" },
  { slot: 'OFF_HAND',  name: "Tome of Alnscorned Regret" },
];

// ── Auth ──────────────────────────────────────────────────────────────
async function getToken(region) {
  const id     = process.env.BLIZZARD_CLIENT_ID;
  const secret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!id || !secret || id === 'your_client_id_here') {
    throw new Error('Missing BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET in .env');
  }
  const creds = Buffer.from(`${id}:${secret}`).toString('base64');
  const res   = await fetch(`https://${region}.battle.net/oauth/token`, {
    method:  'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`OAuth failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

// ── Item search (exact name match) ────────────────────────────────────
async function searchByName(name, namespace, region, token) {
  const url = `https://${region}.api.blizzard.com/data/wow/search/item`
            + `?namespace=${namespace}&name.en_US=${encodeURIComponent(name)}`
            + `&orderby=id:desc&_pageSize=10&_page=1&locale=en_US`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;

  const data = await res.json();
  return (data.results || []).find(
    r => r.data?.name?.en_US?.toLowerCase() === name.toLowerCase()
  ) || null;
}

// ── Item detail (to confirm ilvl) ─────────────────────────────────────
async function getItemDetail(id, namespace, region, token) {
  const url = `https://${region}.api.blizzard.com/data/wow/item/${id}`
            + `?namespace=${namespace}&locale=en_US`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return await res.json();
}

// ── Patch bis.js in place ─────────────────────────────────────────────
function patchBisJs(results) {
  const bisPath = path.join(__dirname, 'public', 'bis.js');
  let src       = fs.readFileSync(bisPath, 'utf8');

  for (const r of results) {
    if (r.itemId == null) continue;

    // Replace  itemId: null  →  itemId: 12345
    src = src.replace(
      new RegExp(`(${r.slot}:[\\s\\S]*?itemId:\\s*)null`, 'm'),
      `$1${r.itemId}`
    );
    // Replace  ilvl: null  →  ilvl: 520  (only if ilvl found)
    if (r.ilvl != null) {
      src = src.replace(
        new RegExp(`(${r.slot}:[\\s\\S]*?ilvl:\\s*)null`, 'm'),
        `$1${r.ilvl}`
      );
    }
  }

  fs.writeFileSync(bisPath, src, 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const region = (process.env.CHARACTER_REGION || 'eu').toLowerCase();

  console.log(`\n🔍 Shadow Priest BiS ID Finder`);
  console.log(`   Region : ${region.toUpperCase()}`);
  console.log(`   Items  : ${ITEMS.length}\n`);

  const token = await getToken(region);

  // Try namespaces newest-first — Midnight is likely PTR2 or PTR
  const namespaces = [
    `static-${region}`,
    `static-ptr-${region}`,
    `static-ptr2-${region}`,
    `static-beta-${region}`,
  ];

  const results = [];

  for (const item of ITEMS) {
    process.stdout.write(`  ${item.slot.padEnd(10)}  ${item.name.padEnd(38)} `);

    let match = null;
    let usedNs = null;

    for (const ns of namespaces) {
      const hit = await searchByName(item.name, ns, region, token);
      if (hit) { match = hit; usedNs = ns; break; }
      await new Promise(r => setTimeout(r, 80)); // polite rate-limit gap
    }

    if (!match) {
      console.log('✗ not found');
      results.push({ slot: item.slot, name: item.name, itemId: null, ilvl: null });
      continue;
    }

    const itemId = match.data.id;
    // ilvl may be in search result or require a detail fetch
    let ilvl = match.data.preview_item?.level?.value ?? null;
    if (ilvl == null) {
      const detail = await getItemDetail(itemId, usedNs, region, token);
      ilvl = detail?.preview_item?.level?.value ?? null;
      await new Promise(r => setTimeout(r, 80));
    }

    console.log(`✓  id=${itemId}  ilvl=${ilvl ?? '?'}  (${usedNs})`);
    results.push({ slot: item.slot, name: item.name, itemId, ilvl });
  }

  // ── Summary ──
  const found   = results.filter(r => r.itemId != null).length;
  const missing = ITEMS.length - found;

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  Found : ${found} / ${ITEMS.length}`);
  if (missing) {
    console.log(`  Missing (${missing}) — likely not yet in the Blizzard API:`);
    results.filter(r => r.itemId == null).forEach(r =>
      console.log(`    • ${r.slot}: ${r.name}`)
    );
  }

  if (found > 0) {
    console.log(`\n  Patching public/bis.js...`);
    patchBisJs(results);
    console.log(`  ✓ Done — ${found} item(s) updated.`);
    if (missing) {
      console.log(`  ℹ  ${missing} item(s) left as null — fill manually once`);
      console.log(`     Midnight launches and they appear on Wowhead.`);
    }
  } else {
    console.log(`\n  Nothing to patch — Midnight items are not yet in the API.`);
    console.log(`  Re-run this script after Patch 12.0.5 launches.`);
  }

  console.log();
}

main().catch(err => { console.error('\nERROR:', err.message); process.exit(1); });
