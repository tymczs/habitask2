const fs = require('fs');

const DATA_FILE = './data/data.json';

if (!fs.existsSync('./data')) fs.mkdirSync('./data');

const db = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};

const html  = fs.readFileSync('./mapa.html', 'utf8');
const match = html.match(/const CONFIG\s*=\s*(\{[\s\S]*?\});/);
if (!match) { console.error('Nie znaleziono CONFIG w mapa.html'); process.exit(1); }
const CONFIG = eval('(' + match[1] + ')');

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db));
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function overpass(query) {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`  Próbuję ${endpoint}...`);
      const r = await fetch(endpoint, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query)
      });
      const text = await r.text();
      if (text.trim().startsWith('<')) throw new Error('HTML zamiast JSON');
      return JSON.parse(text);
    } catch (e) {
      console.warn(`  Nieudane: ${e.message}`);
      await new Promise(res => setTimeout(res, 2000));
    }
  }
  throw new Error('Wszystkie endpointy niedostępne');
}

(async () => {

  if (!db.countries) {
    console.log('Pobieram countries...');
    const r = await fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson');
    db.countries = await r.json();
    save();
    console.log('✓ countries');
  } else {
    console.log('— countries (pomijam)');
  }

  for (const c of CONFIG.cities) {
    if (db[c.name]) { console.log(`— ${c.name} (pomijam)`); continue; }
    console.log(`Pobieram ${c.name}...`);
    try {
      db[c.name] = await overpass(`
[out:json][timeout:30];
relation["name"="${c.name}"]["admin_level"="${c.level}"]["boundary"="administrative"];
out geom;
      `);
      save();
      console.log(`✓ ${c.name}`);
      await new Promise(res => setTimeout(res, 2000));
    } catch(e) {
      console.error(`✗ ${c.name}: ${e.message}`);
    }
  }

  for (const r of CONFIG.rivers) {
    if (db[r.name]) { console.log(`— ${r.name} (pomijam)`); continue; }
    console.log(`Pobieram ${r.name}...`);
    try {
      db[r.name] = await overpass(`
[out:json][timeout:60];
relation["name"="${r.name}"]["${r.tag}"="${r.value}"];
out geom;
      `);
      save();
      console.log(`✓ ${r.name}`);
      await new Promise(res => setTimeout(res, 2000));
    } catch(e) {
      console.error(`✗ ${r.name}: ${e.message}`);
    }
  }

  console.log('\nGotowe!');
})();