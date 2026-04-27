require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const tokenCache = {}; // region → { token, expiresAt }

async function getBattleNetToken(region = 'eu') {
  const entry = tokenCache[region];
  if (entry && Date.now() < entry.expiresAt) {
    return entry.token;
  }

  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId === 'your_client_id_here') {
    throw new Error('Missing or placeholder Blizzard API credentials in .env file. Get yours at https://develop.battle.net/access/clients');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`https://${region}.battle.net/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OAuth failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  tokenCache[region] = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return tokenCache[region].token;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/character', async (req, res) => {
  try {
    const character = (req.query.name   || '').toLowerCase().trim();
    const realm     = (req.query.realm  || '').toLowerCase().trim();
    const region    = (req.query.region || 'eu').toLowerCase().trim();

    const token = await getBattleNetToken(region);

    if (!character || !realm) {
      return res.status(400).json({ error: 'Character name and realm are required.' });
    }

    const base = `https://${region}.api.blizzard.com`;
    const ns = `profile-${region}`;
    const locale = 'en_US';
    const headers = { Authorization: `Bearer ${token}` };

    const [profileRes, equipRes, mediaRes, currencyRes, raidsRes] = await Promise.all([
      fetch(`${base}/profile/wow/character/${realm}/${character}?namespace=${ns}&locale=${locale}`, { headers }),
      fetch(`${base}/profile/wow/character/${realm}/${character}/equipment?namespace=${ns}&locale=${locale}`, { headers }),
      fetch(`${base}/profile/wow/character/${realm}/${character}/character-media?namespace=${ns}&locale=${locale}`, { headers }),
      fetch(`${base}/profile/wow/character/${realm}/${character}/currencies?namespace=${ns}&locale=${locale}`, { headers }),
      fetch(`${base}/profile/wow/character/${realm}/${character}/encounters/raids?namespace=${ns}&locale=${locale}`, { headers }),
    ]);

    if (!profileRes.ok) {
      const status = profileRes.status;
      if (status === 404) throw new Error(`Character "${character}" on "${realm}" (${region.toUpperCase()}) not found. Check the name, realm, and region are correct.`);
      throw new Error(`Profile API error: ${status}`);
    }
    if (!equipRes.ok) throw new Error(`Equipment API error: ${equipRes.status}`);

    const [profile, equipment] = await Promise.all([profileRes.json(), equipRes.json()]);

    let avatarUrl = null;
    let mainRenderUrl = null;
    if (mediaRes.ok) {
      const media = await mediaRes.json();
      avatarUrl = media.assets?.find((a) => a.key === 'avatar')?.value ?? null;
      mainRenderUrl = media.assets?.find((a) => a.key === 'main-raw')?.value ?? media.assets?.find((a) => a.key === 'main')?.value ?? null;
    }

    // Currencies — only return entries with quantity > 0, sorted by quantity desc
    let currencies = [];
    if (currencyRes.ok) {
      const currencyData = await currencyRes.json();
      currencies = (currencyData.currencies || [])
        .filter(c => c.quantity > 0)
        .map(c => ({
          id:       c.currency?.id ?? null,
          name:     c.currency?.name ?? 'Unknown',
          quantity: c.quantity,
          maximum:  c.maximum_quantity ?? null,
        }))
        .sort((a, b) => b.quantity - a.quantity);
    }

    // Raids — latest expansion only; failures are non-fatal
    let raids = null;
    if (raidsRes.ok) {
      const raidsData  = await raidsRes.json();
      const expansions = raidsData.expansions || [];
      const latestExp  = expansions[expansions.length - 1];
      if (latestExp) {
        raids = {
          expansion: latestExp.expansion?.name || '',
          instances: (latestExp.instances || []).map(inst => ({
            name:  inst.instance?.name || '',
            modes: (inst.modes || []).map(mode => ({
              difficulty: mode.difficulty?.type   || '',
              label:      mode.difficulty?.name   || '',
              completed:  mode.progress?.completed_count ?? 0,
              total:      mode.progress?.total_count     ?? 0,
              bosses: (mode.progress?.encounters || []).map(enc => ({
                name:     enc.encounter?.name         || '',
                killed:   (enc.completed_count ?? 0)  >  0,
                lastKill: enc.last_kill_timestamp      || null,
              })),
            })),
          })),
        };
      }
    }

    res.json({
      character: {
        name: profile.name,
        realm: profile.realm?.name || realm,
        level: profile.level,
        equippedItemLevel: profile.equipped_item_level,
        averageItemLevel: profile.average_item_level,
        className: profile.character_class?.name || 'Priest',
        specName: profile.active_spec?.name || 'Shadow',
        raceName: profile.race?.name || '',
        avatarUrl,
        mainRenderUrl,
      },
      equipment: equipment.equipped_items || [],
      currencies,
      raids,
    });
  } catch (err) {
    console.error('[API Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fetches static item stats from Blizzard Game Data API by item ID.
// Used by the tooltip stat-comparison feature.
app.get('/api/item-stats', async (req, res) => {
  try {
    const id     = parseInt(req.query.id, 10);
    const region = (req.query.region || 'eu').toLowerCase();
    const token  = await getBattleNetToken(region);

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'Valid numeric item id required.' });
    }

    const base    = `https://${region}.api.blizzard.com`;
    const ns      = `static-${region}`;
    const headers = { Authorization: `Bearer ${token}` };

    const itemRes = await fetch(
      `${base}/data/wow/item/${id}?namespace=${ns}&locale=en_US`,
      { headers }
    );
    if (!itemRes.ok) {
      return res.status(404).json({ error: `Item ${id} not found (${itemRes.status}).` });
    }

    const item    = await itemRes.json();
    const preview = item.preview_item || {};
    const stats   = (preview.stats || [])
      .map(s => ({ name: s.type?.name || '', value: s.value || 0 }))
      .filter(s => s.name && s.value !== 0);

    res.json({ id: item.id, name: item.name, ilvl: preview.level?.value ?? null, stats });
  } catch (err) {
    console.error('[Item Stats]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Gear Focus`);
  console.log(`  Open: http://localhost:${PORT}\n`);
});
