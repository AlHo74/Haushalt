// ─── Agent metadata (for UI rendering) ───────────────────────────────────────
const AGENT_DEFS = [
  { key: 'manual',       label: 'Bedienungsanleitung', icon: '📖' },
  { key: 'faqs',         label: 'FAQs',                icon: '❓' },
  { key: 'known_issues', label: 'Bekannte Probleme',   icon: '🔧' },
  { key: 'hacks',        label: 'Hacks & Tipps',       icon: '💡' },
  { key: 'spare_parts',  label: 'Ersatzteile',         icon: '🔩' },
  { key: 'energy',       label: 'Energieeffizienz',    icon: '⚡' },
];

// ─── Agent 1: Manufacturer URL patterns (verified, curated) ───────────────────
const HERSTELLER_URLS = {
  'Siemens': {
    manual_portal: 'https://www.siemens-home.bsh-group.com/de/kundendienst/hilfe/bedienungsanleitungen',
    search_query:  'site:siemens-home.bsh-group.com [MODEL] Gebrauchsanleitung',
  },
  'Bosch': {
    manual_portal: 'https://www.bosch-home.com/at/service/gebrauchsanleitungen.html',
    search_query:  'site:bosch-home.com [MODEL] Gebrauchsanleitung',
  },
  'Miele': {
    manual_portal: 'https://www.miele.at/f/de/gebrauchsanweisungen-5231.aspx',
    search_query:  'site:miele.at [MODEL] Gebrauchsanweisung',
  },
  'AEG': {
    manual_portal: 'https://www.aeg.de/support/user-manuals/',
    search_query:  'site:aeg.de [MODEL] Bedienungsanleitung',
  },
  'Electrolux': {
    manual_portal: 'https://www.electrolux.at/support/manuals/',
    search_query:  'site:electrolux.at [MODEL] Bedienungsanleitung',
  },
  'Samsung': {
    manual_portal: 'https://www.samsung.com/at/support/',
    search_query:  'site:samsung.com [MODEL] Bedienungsanleitung',
  },
  'LG': {
    manual_portal: 'https://www.lg.com/at/support/manuals/',
    search_query:  'site:lg.com [MODEL] Bedienungsanleitung',
  },
  'Whirlpool': {
    manual_portal: 'https://www.whirlpool.at/service-und-support/bedienungsanleitung',
    search_query:  'site:whirlpool.at [MODEL] Bedienungsanleitung',
  },
  'Bauknecht': {
    manual_portal: 'https://www.bauknecht.eu/de-AT/service/bedienungsanleitungen.html',
    search_query:  'site:bauknecht.eu [MODEL] Bedienungsanleitung',
  },
  'Philips': {
    manual_portal: 'https://www.philips.at/service/support',
    search_query:  'site:philips.at [MODEL] Bedienungsanleitung',
  },
};

const AGGREGATOR_URLS = [
  {
    name:   'ManualsLib',
    search: 'site:manualslib.de [BRAND] [MODEL] Gebrauchsanleitung',
    trust:  'medium',
  },
  {
    name:   'bedienungsanleitu.ng',
    search: 'site:bedienungsanleitu.ng [BRAND] [MODEL]',
    trust:  'medium',
  },
  {
    name:   'devicemanuals.eu',
    search: 'site:devicemanuals.eu [BRAND] [MODEL]',
    trust:  'medium',
  },
];

// ─── Grounding rule (appended to every agent system prompt) ───────────────────
const GROUNDING_RULE = `
Return ONLY information you are confident is accurate for this specific device.
Never invent data. If unsure, return found: false for that field.
Return ONLY valid JSON, no other text.`;

// ─── Shared API helper ────────────────────────────────────────────────────────
// Thin wrapper around callAnthropic (defined in app.js).
// Always expects the model to return JSON.
async function callAgentAPI(systemPrompt, userMessage) {
  const data = await callAnthropic({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: systemPrompt + GROUNDING_RULE,
    messages: [{ role: 'user', content: userMessage }],
  });
  const text = data.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Keine JSON-Antwort erhalten');
  return JSON.parse(match[0]);
}

// ─── Agent 1: Verification layer ──────────────────────────────────────────────
function verifyManualResult(result, device) {
  // Rule 1: low confidence → reject
  if (result.confidence === 'low') {
    return { verified: false, reason: 'low_confidence' };
  }

  // Rule 2: model match must be confirmed
  if (!result.model_match_confirmed) {
    return { verified: false, reason: 'model_not_confirmed' };
  }

  // Rule 3: URL sanity check
  // If a model is known, the URL MUST contain the model slug (prevents wrong-model URLs).
  // If no model, fall back to requiring at least the brand name in the URL.
  if (result.manual_url) {
    const url       = result.manual_url.toLowerCase();
    const modelSlug = (device.modell || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const brand     = (device.marke  || '').toLowerCase();
    if (modelSlug) {
      if (!url.includes(modelSlug)) {
        return { verified: false, reason: 'url_mismatch' };
      }
    } else if (brand && !url.includes(brand)) {
      return { verified: false, reason: 'url_mismatch' };
    }
  }

  return { verified: true };
}

// ─── Progress helpers ─────────────────────────────────────────────────────────
// Agent status is stored inside the device object in localStorage.
// device.agentStatus = { manual: 'pending|running|done|error', ... }

function setAgentStatus(deviceId, key, status, onProgress) {
  const device = state.devices.find(d => d.id === deviceId);
  if (!device) return;
  if (!device.agentStatus) device.agentStatus = {};
  device.agentStatus[key] = status;
  saveDevices();
  if (typeof onProgress === 'function') onProgress(key, status);
}

function initAgentStatus(deviceId) {
  const device = state.devices.find(d => d.id === deviceId);
  if (!device) return;
  device.agentStatus = {};
  AGENT_DEFS.forEach(a => { device.agentStatus[a.key] = 'pending'; });
  saveDevices();
}

// ─── Agent 1: Bedienungsanleitung (3-phase waterfall + verification) ──────────
async function runAgent1(device) {
  const brand    = device.marke  || '';
  const model    = device.modell || '';
  const name     = device.name   || '';
  const eNumber  = device._nameplate?.e_number || '';
  const category = device.category || '';

  // Phase 1: inject manufacturer portal as grounding context (no CORS fetch)
  const mfrEntry = HERSTELLER_URLS[brand] || null;

  // Phase 2: build aggregator search hints for the AI
  const aggregatorHints = AGGREGATOR_URLS.map(a => {
    const q = a.search.replace('[BRAND]', brand).replace('[MODEL]', model);
    return `${a.name}: search "${q}"`;
  }).join('\n');

  const mfrContext = mfrEntry
    ? `Manufacturer portal (use as grounding): ${mfrEntry.manual_portal}
Manufacturer site search: ${mfrEntry.search_query.replace('[MODEL]', model)}`
    : `Brand "${brand}" is NOT in the verified manufacturer list. Skip Phase 1. Go directly to aggregators.`;

  // Phase 3: single AI call with strict prompt
  const system = `You are Agent 1 of Haushalt-Genie.
Find the official manual URL for the given device.

STRICT RULES:
1. Only return URLs you are CERTAIN exist for this EXACT model — not a similar model.
2. If you are not 100% certain the URL leads to the correct manual for THIS specific model, set found: false.
3. Never construct URLs by guessing — only use URLs from known, verified patterns.
4. The model number in the URL or page MUST match the device model exactly.
5. If the brand is not in your training data with confirmed manual URL patterns, set found: false.

${GROUNDING_RULE}

Return ONLY this JSON:
{
  "found": true,
  "confidence": "high|medium|low",
  "source_phase": 1,
  "brand_confirmed": true,
  "model_match_confirmed": true,
  "manual_url": "https://...",
  "source_name": "ManualsLib",
  "pages": null,
  "key_specs": { "capacity": null, "energy_class": null, "special_features": [] },
  "programs": [],
  "quick_start_tips": [],
  "warning": null
}`;

  const user = `Find manual for:
Brand: ${brand}
Model: ${model}${eNumber ? `\nE-Number: ${eNumber}` : ''}
Name: ${name}${category ? `\nCategory: ${category}` : ''}

${mfrContext}

Aggregator fallback (if manufacturer search fails):
${aggregatorHints}

IMPORTANT: Only set found:true if you are certain the URL leads to THIS EXACT device.
Also provide 3 quick_start_tips in German based on your knowledge of this model.`;

  let result;
  try {
    result = await callAgentAPI(system, user);
  } catch (err) {
    result = {
      found: false, confidence: 'low', source_phase: 3,
      brand_confirmed: false, model_match_confirmed: false,
      manual_url: null, source_name: null,
      key_specs: {}, programs: [], quick_start_tips: [],
      warning: err.message,
    };
  }

  // Verification layer
  const verification = result.found
    ? verifyManualResult(result, device)
    : { verified: false, reason: 'not_found' };

  result._verified      = verification.verified;
  result._verify_reason = verification.reason || null;
  result._mfr_portal    = mfrEntry?.manual_portal || null;
  result._brand_known   = !!mfrEntry;

  // Search log (Phase 2 TODO: send to Supabase)
  const d = state.devices.find(x => x.id === device.id);
  if (d) {
    d.manual_search_log = {
      timestamp:  Date.now(),
      brand,
      model,
      result:     result._verified ? 'found' : (result.found ? 'unverified' : 'not_found'),
      source:     result.source_name || null,
      confidence: result.confidence  || null,
    };
    saveDevices();
  }

  return result;
}

// ─── Agent 2: FAQs ───────────────────────────────────────────────────────────
async function runAgent2(device) {
  const { name, marke: brand, modell: model } = device;

  const system = `You are Agent 2 of Haushalt-Genie.
Find the 5 most commonly asked questions and answers for the given device.
Return this exact JSON structure:
{
  "faqs": [
    {
      "question": "Frage auf Deutsch?",
      "answer": "Antwort auf Deutsch."
    }
  ],
  "disclaimer_level": 2
}`;

  const user = `Generate 5 realistic FAQs in German for: ${brand} ${model} (${name}).
Focus on questions real users ask: setup, common errors, maintenance, compatibility.`;

  return callAgentAPI(system, user);
}

// ─── Agent 3: Bekannte Probleme & Lösungen ────────────────────────────────────
async function runAgent3(device) {
  const { name, marke: brand, modell: model } = device;

  const system = `You are Agent 3 of Haushalt-Genie.
Find 3–5 known problems for the given device, each with a practical fix.
Return this exact JSON structure:
{
  "issues": [
    {
      "problem": "Problem beschreibung auf Deutsch",
      "fix": "Lösung auf Deutsch",
      "severity": "low|medium|high"
    }
  ],
  "disclaimer_level": 2
}`;

  const user = `List 3–5 known issues in German for: ${brand} ${model} (${name}).
Each issue must include a concrete fix. Severity: low = cosmetic, medium = affects use, high = safety or data loss.`;

  return callAgentAPI(system, user);
}

// ─── Agent 4: Hacks & Tipps ───────────────────────────────────────────────────
async function runAgent4(device) {
  const { name, marke: brand, modell: model } = device;

  const system = `You are Agent 4 of Haushalt-Genie.
Find community tips, hidden features, and usage hacks for the given device.
Return this exact JSON structure:
{
  "hacks": [
    {
      "tip": "Tipp auf Deutsch",
      "source_type": "community|manufacturer|expert",
      "rating": 4
    }
  ],
  "disclaimer_level": 3
}
Rating is 1–5 (5 = most impactful).`;

  const user = `Find 3–5 community tips and hidden features in German for: ${brand} ${model} (${name}).
Include real usage hacks that improve the experience. Source types: community = Reddit/forums, manufacturer = official, expert = repair/tech blogs.`;

  return callAgentAPI(system, user);
}

// ─── Agent 5: Ersatzteile & Zubehör ──────────────────────────────────────────
async function runAgent5(device) {
  const { name, marke: brand, modell: model } = device;

  const system = `You are Agent 5 of Haushalt-Genie.
Find common spare parts and compatible accessories for the given device.
Return this exact JSON structure:
{
  "parts": [
    {
      "name": "Teilname auf Deutsch",
      "search_term": "exact search string for Amazon/eBay",
      "type": "spare_part|accessory|consumable"
    }
  ],
  "disclaimer_level": 1
}`;

  const user = `List common spare parts and accessories in German for: ${brand} ${model} (${name}).
Include model-specific search terms users can paste into Amazon or eBay.
Types: spare_part = repairs, accessory = add-ons, consumable = regular replacements.`;

  return callAgentAPI(system, user);
}

// ─── Agent 6: Energieeffizienz ────────────────────────────────────────────────
async function runAgent6(device) {
  const { name, marke: brand, modell: model } = device;

  const system = `You are Agent 6 of Haushalt-Genie.
Find energy consumption data and eco tips for the given device.
Return this exact JSON structure:
{
  "energy_class": "A+++",
  "consumption_kwh": 200,
  "consumption_note": "pro Jahr bei Normalbetrieb",
  "standby_w": null,
  "eco_tips": [
    {
      "tip": "Spartipp auf Deutsch",
      "saving": "ca. 10% weniger Verbrauch"
    }
  ],
  "disclaimer_level": 1
}
Set any unknown numeric fields to null.`;

  const user = `Provide energy data in German for: ${brand} ${model} (${name}).
Include EU energy class, annual kWh consumption, and 3–5 practical eco tips with estimated savings.`;

  return callAgentAPI(system, user);
}

// ─── Master function: run all 6 agents in parallel ───────────────────────────
// onProgress(key, status) is called each time an agent changes state.
// Call this from device.html after a device is first added.
async function runAllAgents(device, onProgress) {
  const deviceId = device.id;

  // Reset all statuses to 'pending', then immediately to 'running'
  initAgentStatus(deviceId);

  const runners = [
    { key: 'manual',       fn: runAgent1 },
    { key: 'faqs',         fn: runAgent2 },
    { key: 'known_issues', fn: runAgent3 },
    { key: 'hacks',        fn: runAgent4 },
    { key: 'spare_parts',  fn: runAgent5 },
    { key: 'energy',       fn: runAgent6 },
  ];

  const promises = runners.map(({ key, fn }) => {
    setAgentStatus(deviceId, key, 'running', onProgress);

    return fn(device)
      .then(result => {
        const d = state.devices.find(x => x.id === deviceId);
        if (d) d[key] = result;
        setAgentStatus(deviceId, key, 'done', onProgress);
        saveDevices();
      })
      .catch(err => {
        const d = state.devices.find(x => x.id === deviceId);
        if (d) {
          if (!d.agentErrors) d.agentErrors = {};
          d.agentErrors[key] = err.message;
        }
        setAgentStatus(deviceId, key, 'error', onProgress);
        saveDevices();
      });
  });

  await Promise.allSettled(promises);
}
