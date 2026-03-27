// ─── Agent metadata (for UI rendering) ───────────────────────────────────────
const AGENT_DEFS = [
  { key: 'manual',       label: 'Bedienungsanleitung', icon: '📖' },
  { key: 'faqs',         label: 'FAQs',                icon: '❓' },
  { key: 'known_issues', label: 'Bekannte Probleme',   icon: '🔧' },
  { key: 'hacks',        label: 'Hacks & Tipps',       icon: '💡' },
  { key: 'spare_parts',  label: 'Ersatzteile',         icon: '🔩' },
  { key: 'energy',       label: 'Energieeffizienz',    icon: '⚡' },
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

// ─── Agent 1: Bedienungsanleitung ────────────────────────────────────────────
// Link-based only — never processes images, never invents URLs.
// Search waterfall: manualslib.de → bedienungsanleitu.ng → general web
async function runAgent1(device) {
  const { name, marke: brand, modell: model } = device;

  const system = `You are Agent 1 of Haushalt-Genie.
Find the Bedienungsanleitung (user manual) for the given household device.
Search in this priority order:
1. manualslib.de — most reliable. URL pattern: https://www.manualslib.de/brand/BRAND/
2. bedienungsanleitu.ng — fallback. URL pattern: https://www.bedienungsanleitu.ng/BRAND/MODEL/
3. General web search as last resort.
Never invent or guess URLs. Only include URLs you are highly confident exist.
Return this exact JSON structure:
{
  "found": true,
  "confidence": "high|medium|low",
  "source": "manualslib|bedienungsanleitu|other|not_found",
  "manual_url": "https://...",
  "pdf_url": null,
  "pages": null,
  "key_specs": {
    "capacity": null,
    "energy_class": null,
    "special_features": []
  },
  "programs": [],
  "quick_start_tips": [
    "Tip 1 in German",
    "Tip 2 in German",
    "Tip 3 in German"
  ],
  "disclaimer_level": 1
}
If no confident URL exists, set found: false and source: "not_found".`;

  const user = `Find the Bedienungsanleitung for: ${brand} ${model} (${name}).
Construct and verify the manualslib.de URL for brand "${brand}" first.
Also provide 3 quick_start_tips in German based on your knowledge of this device model.`;

  return callAgentAPI(system, user);
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
