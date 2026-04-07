// ─── Agent metadata (for UI rendering) ───────────────────────────────────────
const AGENT_DEFS = [
  { key: 'manual',       label: 'Bedienungsanleitung', icon: ICONS['support-manual'] },
  { key: 'faqs',         label: 'FAQs',                icon: ICONS['support-faq'] },
  { key: 'known_issues', label: 'Bekannte Probleme',   icon: ICONS['support-problems'] },
  { key: 'hacks',        label: 'Hacks & Tipps',       icon: ICONS['support-tips'] },
  { key: 'spare_parts',  label: 'Ersatzteile',         icon: ICONS['support-spare-parts'] },
  { key: 'energy',       label: 'Energieeffizienz',    icon: ICONS['support-energy-efficiency'] },
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

const DOMAIN_ALLOWLIST = [
  'bosch-home.com', 'siemens-home.bsh-group.com', 'miele.at', 'miele.de',
  'aeg.de', 'aeg.at', 'electrolux.at', 'electrolux.de',
  'samsung.com', 'lg.com', 'whirlpool.at', 'bauknecht.eu',
  'philips.com', 'philips.at', 'liebherr.com', 'gorenje.com',
  'manualslib.com', 'manualslib.de', 'bedienungsanleitu.ng',
  'devicemanuals.eu', 'media3.bosch-home.com', 'media.siemens-home.bsh-group.com',
];

const MODEL_URL_PATTERNS = {
  'Bosch':   model => `https://www.bosch-home.com/at/service/gebrauchsanleitungen.html?query=${encodeURIComponent(model)}`,
  'Siemens': model => `https://www.siemens-home.bsh-group.com/de/kundendienst/hilfe/bedienungsanleitungen?query=${encodeURIComponent(model)}`,
  'Miele':   model => `https://www.miele.at/f/de/gebrauchsanweisungen-5231.aspx?q=${encodeURIComponent(model)}`,
  'AEG':     model => `https://www.aeg.de/support/user-manuals/?q=${encodeURIComponent(model)}`,
};

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
    model: window.AI_MODEL,
    max_tokens: 1000,
    system: systemPrompt + GROUNDING_RULE,
    messages: [{ role: 'user', content: userMessage }],
  });
  const text = data.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Keine JSON-Antwort erhalten');
  return JSON.parse(match[0]);
}

// ─── Agent 1: Helpers ─────────────────────────────────────────────────────────
function normalizeModel(model) {
  // Strip spaces, dashes, dots for URL matching and search
  // "WAE 28.443" → "WAE28443"
  return (model || '').replace(/[\s\-\.]/g, '').toUpperCase();
}

function buildSearchLinks(brand, model, category) {
  const q        = `${brand} ${model} Bedienungsanleitung PDF`.trim();
  const qEncoded = encodeURIComponent(q);

  const links = [
    {
      label:  'ManualsLib suchen',
      url:    `https://www.manualslib.de/search/?q=${encodeURIComponent(`${brand} ${model}`)}`,
      source: 'manualslib.de',
    },
    {
      label:  'Google suchen',
      url:    `https://www.google.com/search?q=${qEncoded}`,
      source: 'google.com',
    },
    {
      label:  'bedienungsanleitu.ng suchen',
      url:    `https://www.bedienungsanleitu.ng/search?q=${encodeURIComponent(`${brand} ${model}`)}`,
      source: 'bedienungsanleitu.ng',
    },
  ];

  // Prepend manufacturer portal link if known
  if (MODEL_URL_PATTERNS[brand]) {
    links.unshift({
      label:  `${brand} Hersteller-Portal`,
      url:    MODEL_URL_PATTERNS[brand](model),
      source: HERSTELLER_URLS[brand]?.manual_portal || null,
    });
  }

  return links;
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

// ─── Agent 1: Bedienungsanleitung (4-phase search orchestrator) ───────────────
async function runAgent1(device) {
  const brand     = device.marke  || '';
  const model     = device.modell || '';
  const name      = device.name   || '';
  const eNumber   = device._nameplate?.e_number || '';
  const category  = device.category || '';
  const modelNorm = normalizeModel(model);

  // Always build search links — guaranteed fallback regardless of other phases
  const searchLinks = buildSearchLinks(brand, model, category);

  // ── Phase 1: Deterministic URL construction (no Claude, no hallucination) ──
  let phase1Result = null;
  const mfrEntry   = HERSTELLER_URLS[brand] || null;

  if (mfrEntry && model && MODEL_URL_PATTERNS[brand]) {
    phase1Result = {
      found:                  true,
      confidence:             'medium',    // search result page, not a direct PDF
      source_phase:           1,
      brand_confirmed:        true,
      model_match_confirmed:  false,       // user must confirm on the page
      manual_url:             MODEL_URL_PATTERNS[brand](model),
      source_name:            `${brand} Hersteller-Portal`,
      source_domain_verified: true,        // deterministically constructed
    };
  }

  // ── Phase 2: Claude generates search strategy + candidate URL ──
  // Claude's job: best search query + maybe a URL it's 100% certain of.
  // NOT: recalling URLs from memory.
  const aggregatorHints = AGGREGATOR_URLS.map(a => {
    const q = a.search.replace('[BRAND]', brand).replace('[MODEL]', model);
    return `${a.name}: "${q}"`;
  }).join('\n');

  const system = `You are Agent 1 of Haushalt-Genie. Your job is to find Bedienungsanleitungen
(user manuals in German) for household devices sold in Austria/Germany.

STRICT RULES — read carefully:
1. NEVER invent or guess a URL. If you are not 100% certain a URL exists for
   this EXACT model, do NOT include it. Set manual_url to null.
2. A URL is only valid if its domain is in this allowlist:
   ${DOMAIN_ALLOWLIST.join(', ')}
3. You MAY include a manual_url ONLY if you have seen this exact URL pattern
   in your training data for this specific model number.
4. If unsure about the URL: set manual_url to null and found to false.
   The search_query_suggestion is more valuable than a wrong URL.
5. Always provide a search_query_suggestion — this cannot be wrong.
6. Provide 3 quick_start_tips in German based on your knowledge of this device type.

Return ONLY this JSON:
{
  "found": true | false,
  "confidence": "high | medium | low",
  "source_phase": 2,
  "brand_confirmed": true | false,
  "model_match_confirmed": true | false,
  "manual_url": "https://... or null",
  "source_name": "name of source or null",
  "source_domain_verified": false,
  "search_query_suggestion": "best German search query for this device manual",
  "key_specs": { "capacity": null, "energy_class": null, "special_features": [] },
  "programs": [],
  "quick_start_tips": [],
  "warning": null
}`;

  const user = `Find the Bedienungsanleitung for:
Brand: ${brand}
Model: ${model}${modelNorm !== model.toUpperCase() ? `\nNormalized model: ${modelNorm}` : ''}${eNumber ? `\nE-Number: ${eNumber}` : ''}
Name: ${name}${category ? `\nCategory: ${category}` : ''}

Known aggregator search queries (use as inspiration for search_query_suggestion):
${aggregatorHints}

Remember: manual_url must be null unless you are 100% certain it exists for this EXACT model.`;

  let claudeResult;
  try {
    claudeResult = await callAgentAPI(system, user);
  } catch (err) {
    claudeResult = {
      found: false, confidence: 'low', source_phase: 2,
      brand_confirmed: false, model_match_confirmed: false,
      manual_url: null, source_name: null, source_domain_verified: false,
      search_query_suggestion: `${brand} ${model} Bedienungsanleitung PDF`,
      key_specs: {}, programs: [], quick_start_tips: [],
      warning: err.message,
    };
  }

  // ── Phase 3: Domain-allowlist verification (replaces slug-matching) ──
  function isDomainVerified(url) {
    if (!url) return false;
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      return DOMAIN_ALLOWLIST.some(d => hostname === d || hostname.endsWith('.' + d));
    } catch { return false; }
  }

  if (claudeResult.manual_url && !isDomainVerified(claudeResult.manual_url)) {
    // Claude returned a URL from an unknown domain — reject it
    claudeResult.manual_url            = null;
    claudeResult.found                 = false;
    claudeResult.model_match_confirmed = false;
    claudeResult.source_domain_verified = false;
    claudeResult.warning               = (claudeResult.warning || '') +
      ' [URL rejected: domain not in allowlist]';
  } else if (claudeResult.manual_url) {
    claudeResult.source_domain_verified = true;
  }

  // ── Phase 4: Merge — phase 1 (deterministic) wins for manual_url ──
  const bestResult = phase1Result || claudeResult;

  const result = {
    ...claudeResult,                            // specs, tips, search_query from Claude
    found:                  bestResult.found,
    confidence:             bestResult.confidence,
    source_phase:           bestResult.source_phase,
    brand_confirmed:        bestResult.brand_confirmed,
    model_match_confirmed:  bestResult.model_match_confirmed,
    manual_url:             bestResult.manual_url,
    source_name:            bestResult.source_name,
    source_domain_verified: bestResult.source_domain_verified ?? false,
    search_links:           searchLinks,         // always present
    _mfr_portal:            mfrEntry?.manual_portal || null,
    _brand_known:           !!mfrEntry,
  };

  // Final trust flag (used by UI)
  result._verified      = result.source_domain_verified && result.model_match_confirmed;
  result._verify_reason = result._verified ? null : 'domain_or_model_unconfirmed';

  // Search log (Phase 2 TODO: send to Supabase)
  const d = state.devices.find(x => x.id === device.id);
  if (d) {
    d.manual_search_log = {
      timestamp:  Date.now(),
      brand, model,
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
