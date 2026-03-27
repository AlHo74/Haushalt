// ─── Constants ────────────────────────────────────────────────────────────────
const REPLACE_REASONS = [
  { id:'alt',     label:'Zu alt oder veraltet',          icon:'⏰' },
  { id:'defekt',  label:'Defekt oder reparaturwürdig',   icon:'🔧' },
  { id:'upgrade', label:'Ich möchte ein Upgrade',        icon:'⬆️' },
  { id:'verkauf', label:'Verkaufen und ersetzen',        icon:'🏷️' },
  { id:'energie', label:'Bessere Energieeffizienz',      icon:'⚡' },
  { id:'sonstig', label:'Sonstiger Grund',               icon:'•••' },
];

const REPLACE_PRIORITIES = [
  { id:'preis',     label:'Preis / Sparsamkeit' },
  { id:'energie',   label:'Energieeffizienz' },
  { id:'features',  label:'Moderne Features' },
  { id:'qualitaet', label:'Markenqualität' },
  { id:'bedienung', label:'Einfache Bedienung' },
];

// ─── Replace wizard state ─────────────────────────────────────────────────────
let replaceState = null;

// ─── Budget max by device category ───────────────────────────────────────────
function getBudgetMax(deviceName) {
  const n = (deviceName || '').toLowerCase();
  if (/waschmaschine|kühlschrank|herd|backofen|trockner/.test(n)) return 3000;
  if (/fernseher|tv/.test(n))                                       return 5000;
  if (/kaffeemaschine|mikrowelle/.test(n))                          return 1000;
  return 2000;
}

// ─── Open / Close ─────────────────────────────────────────────────────────────
function openReplaceModal(deviceId) {
  const device = state.devices.find(d => d.id === deviceId);
  if (!device) return;

  const budgetMax = getBudgetMax(device.name);

  replaceState = {
    deviceId,
    step: 1,
    // Step 1
    reason: null,
    // Step 2
    budgetMin: 50,
    budgetMax,
    budgetLow:  100,
    budgetHigh: Math.round(budgetMax * 0.4),
    budgetPriority: 'Ausgeglichen',
    // Step 3
    featuresLoading: false,
    featuresError:   null,
    featureQuestions: null,     // [{question, type, options, answer}]
    // Step 4
    priorities: REPLACE_PRIORITIES.map(p => p.id),
    // Step 5
    recoLoading: false,
    recoError:   null,
    recommendations: null,
    recoSummary: '',
    expandedReco: null,
  };

  updateReplaceModal();
}

function closeReplaceModal() {
  replaceState = null;
  const el = document.getElementById('replace-modal-root');
  if (el) el.remove();
}

// ─── Modal DOM management ─────────────────────────────────────────────────────
function updateReplaceModal() {
  let el = document.getElementById('replace-modal-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'replace-modal-root';
    document.body.appendChild(el);
  }
  el.innerHTML = renderReplaceModal();
}

// ─── Step 3 API: Feature questions ───────────────────────────────────────────
async function loadReplaceFeatures(deviceId) {
  const r = replaceState;
  if (!r || !state.apiKey) return;
  const device = state.devices.find(d => d.id === deviceId);
  if (!device) return;

  r.featuresLoading = true;
  r.featuresError   = null;
  updateReplaceModal();

  try {
    const data = await callAnthropic({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: `Generate feature questions for recommending a replacement household device.
Return ONLY a valid JSON array, no other text:
[{"question":"Frage auf Deutsch?","type":"yesno","options":["Ja","Nein"]}]
Generate exactly 4 questions. Focus on features that vary by price range.
Keep questions short and practical. type must be "yesno".`,
      messages: [{
        role: 'user',
        content: `Device to replace: ${device.name} (${device.marke} ${device.modell})
Reason for replacement: ${REPLACE_REASONS.find(g => g.id === r.reason)?.label || r.reason}
Budget range: EUR ${r.budgetLow}–${r.budgetHigh}
Generate 4 relevant yes/no questions in German about features important for this device category.`,
      }],
    });

    const match = data.content[0].text.match(/\[[\s\S]*\]/);
    const parsed = match ? JSON.parse(match[0]) : null;
    if (!Array.isArray(parsed) || !parsed.length) throw new Error('Ungültige Antwort');

    r.featureQuestions = parsed.map(q => ({ ...q, answer: null }));
    r.step = 3;
  } catch (e) {
    r.featuresError = e.message || 'Fehler beim Laden der Fragen';
  }

  r.featuresLoading = false;
  updateReplaceModal();
}

// ─── Step 5 API: Empfehlungen ─────────────────────────────────────────────────
async function loadReplaceRecommendations(deviceId) {
  const r = replaceState;
  if (!r || !state.apiKey) return;
  const device = state.devices.find(d => d.id === deviceId);
  if (!device) return;

  r.recoLoading = true;
  r.recoError   = null;
  updateReplaceModal();

  const reasonLabel = REPLACE_REASONS.find(g => g.id === r.reason)?.label || r.reason;
  const prioLabels  = r.priorities
    .map((id, i) => `${i + 1}. ${REPLACE_PRIORITIES.find(p => p.id === id)?.label || id}`)
    .join(', ');
  const featureAnswers = (r.featureQuestions || [])
    .map(q => `${q.question} → ${q.answer}`)
    .join('\n');

  try {
    const data = await callAnthropic({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `You are an expert consumer advisor for Austria (Austrian market, EUR prices).
Return ONLY valid JSON, no other text:
{"summary":"one sentence in German","recommendations":[{"rank":1,"name":"Full product name","brand":"Brand","price_estimate":"ca. EUR X–Y","why":"2 sentences in German","top_features":["f1","f2","f3"],"energy_class":"A++","search_term":"amazon search term"}]}
Provide exactly 3 recommendations ranked: best value, most features, premium.`,
      messages: [{
        role: 'user',
        content: `Replace: ${device.marke} ${device.modell} – ${device.name}
Reason: ${reasonLabel}
Budget: EUR ${r.budgetLow}–${r.budgetHigh}, price importance: ${r.budgetPriority}
User priorities (ranked): ${prioLabels}
Feature answers:\n${featureAnswers}
Recommend 3 specific products available in Austria.`,
      }],
    });

    const match = data.content[0].text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    if (!parsed?.recommendations?.length) throw new Error('Ungültige Antwort');

    r.recommendations = parsed.recommendations;
    r.recoSummary     = parsed.summary || '';
    r.step = 5;
  } catch (e) {
    r.recoError = e.message || 'Fehler beim Laden der Empfehlungen';
  }

  r.recoLoading = false;
  updateReplaceModal();
}

// ─── Priority drag helpers ────────────────────────────────────────────────────
function replacePrioMove(from, to) {
  const r = replaceState;
  if (!r) return;
  const arr = [...r.priorities];
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  r.priorities = arr;
  updateReplaceModal();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderReplaceModal() {
  const r = replaceState;
  if (!r) return '';

  const device = state.devices.find(d => d.id === r.deviceId);
  if (!device) return '';

  // Step dots progress
  const prog = `
    <div style="display:flex;gap:4px;margin-bottom:20px;">
      ${[1, 2, 3, 4, 5].map(i =>
        `<div style="flex:1;height:4px;border-radius:2px;background:${i <= r.step ? 'var(--primary)' : 'var(--border)'};">&zwnj;</div>`
      ).join('')}
      <span style="font-size:12px;color:var(--muted);margin-left:8px;flex-shrink:0;">${r.step}/5</span>
    </div>`;

  let body = '';

  // ── Step 1: Ersatz-Grund ─────────────────────────────────────────────────
  if (r.step === 1) {
    body = `
      <h3 style="font-size:16px;font-weight:700;margin:0 0 4px;">Warum möchtest du ersetzen?</h3>
      <p style="font-size:13px;color:var(--muted);margin:0 0 16px;">${escHtml(device.name)}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${REPLACE_REASONS.map(g => `
          <button onclick="replaceState.reason='${g.id}';updateReplaceModal()"
            style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:12px;border-radius:12px;border:2px solid ${r.reason === g.id ? 'var(--primary)' : 'var(--border)'};background:${r.reason === g.id ? 'rgba(76,175,130,0.08)' : '#fff'};cursor:pointer;text-align:left;">
            <span style="font-size:18px;">${g.icon}</span>
            <span style="font-size:12px;font-weight:600;color:var(--text);line-height:1.3;">${g.label}</span>
          </button>`).join('')}
      </div>
      <button onclick="if(replaceState.reason){replaceState.step=2;updateReplaceModal();}" ${!r.reason ? 'disabled' : ''}
        style="margin-top:20px;width:100%;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:13px;font-weight:600;font-size:14px;cursor:pointer;opacity:${!r.reason ? '0.4' : '1'};">
        Weiter →
      </button>`;
  }

  // ── Step 2: Budget ───────────────────────────────────────────────────────
  else if (r.step === 2) {
    body = `
      <h3 style="font-size:16px;font-weight:700;margin:0 0 16px;">Was ist dein Budget?</h3>
      <div style="background:rgba(76,175,130,0.1);border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:var(--primary);">EUR ${r.budgetLow} — EUR ${r.budgetHigh}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
        <div>
          <label style="font-size:12px;color:var(--muted);display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Minimum</span><span style="font-weight:600;color:var(--primary);">${r.budgetLow} EUR</span>
          </label>
          <input type="range" min="${r.budgetMin}" max="${r.budgetMax}" value="${r.budgetLow}" step="10"
            oninput="if(parseInt(this.value)<replaceState.budgetHigh){replaceState.budgetLow=parseInt(this.value);updateReplaceModal();}"
            style="width:100%;accent-color:var(--primary);">
        </div>
        <div>
          <label style="font-size:12px;color:var(--muted);display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Maximum</span><span style="font-weight:600;color:var(--primary);">${r.budgetHigh} EUR</span>
          </label>
          <input type="range" min="${r.budgetMin}" max="${r.budgetMax}" value="${r.budgetHigh}" step="10"
            oninput="if(parseInt(this.value)>replaceState.budgetLow){replaceState.budgetHigh=parseInt(this.value);updateReplaceModal();}"
            style="width:100%;accent-color:var(--primary);">
        </div>
      </div>
      <p style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:0 0 8px;">Wie wichtig ist der Preis?</p>
      <div style="display:flex;gap:6px;margin-bottom:20px;">
        ${['Sehr wichtig', 'Ausgeglichen', 'Egal'].map(opt => `
          <button onclick="replaceState.budgetPriority='${opt}';updateReplaceModal()"
            style="flex:1;padding:8px 4px;border-radius:10px;border:2px solid ${r.budgetPriority === opt ? 'var(--primary)' : 'var(--border)'};background:${r.budgetPriority === opt ? 'var(--primary)' : '#fff'};color:${r.budgetPriority === opt ? '#fff' : 'var(--muted)'};font-size:12px;font-weight:600;cursor:pointer;">
            ${opt}
          </button>`).join('')}
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="replaceState.step=1;updateReplaceModal()"
          style="flex:1;border:1.5px solid var(--border);color:var(--muted);background:#fff;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;">
          ← Zurück
        </button>
        <button onclick="${!state.apiKey ? `closeReplaceModal();navigate('settings')` : `loadReplaceFeatures('${device.id}')`}"
          ${r.featuresLoading ? 'disabled' : ''}
          style="flex:1;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;opacity:${r.featuresLoading ? '0.6' : '1'};">
          ${r.featuresLoading
            ? `<div class="spinner" style="width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;"></div>Lade …`
            : state.apiKey ? 'Weiter →' : '🔑 API einrichten'}
        </button>
      </div>
      ${r.featuresError ? `<p style="margin-top:10px;font-size:13px;color:#c0392b;background:#fdf2f2;border-radius:8px;padding:8px 12px;">⚠️ ${escHtml(r.featuresError)}</p>` : ''}`;
  }

  // ── Step 3: Feature-Fragen ───────────────────────────────────────────────
  else if (r.step === 3) {
    const allAnswered = r.featureQuestions?.every(q => q.answer !== null);
    body = `
      <h3 style="font-size:16px;font-weight:700;margin:0 0 4px;">Welche Features sind wichtig?</h3>
      <p style="font-size:13px;color:var(--muted);margin:0 0 16px;">Beantworte kurz ein paar Fragen.</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${(r.featureQuestions || []).map((q, qi) => `
          <div style="background:var(--bg);border-radius:12px;padding:14px;">
            <p style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 10px;">${escHtml(q.question)}</p>
            <div style="display:flex;gap:8px;">
              ${['Ja', 'Nein'].map(opt => `
                <button onclick="replaceState.featureQuestions[${qi}].answer='${opt}';updateReplaceModal()"
                  style="flex:1;padding:8px;border-radius:10px;border:2px solid ${q.answer === opt ? 'var(--primary)' : 'var(--border)'};background:${q.answer === opt ? 'var(--primary)' : '#fff'};color:${q.answer === opt ? '#fff' : 'var(--muted)'};font-size:13px;font-weight:600;cursor:pointer;">
                  ${opt}
                </button>`).join('')}
            </div>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:20px;">
        <button onclick="replaceState.step=2;updateReplaceModal()"
          style="flex:1;border:1.5px solid var(--border);color:var(--muted);background:#fff;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;">
          ← Zurück
        </button>
        <button onclick="if(${allAnswered ? 'true' : 'false'}){replaceState.step=4;updateReplaceModal();}"
          ${!allAnswered ? 'disabled' : ''}
          style="flex:1;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;opacity:${!allAnswered ? '0.4' : '1'};">
          Weiter →
        </button>
      </div>`;
  }

  // ── Step 4: Prioritäten ──────────────────────────────────────────────────
  else if (r.step === 4) {
    body = `
      <h3 style="font-size:16px;font-weight:700;margin:0 0 4px;">Prioritäten festlegen</h3>
      <p style="font-size:13px;color:var(--muted);margin:0 0 16px;">Sortiere nach Wichtigkeit mit ↑ / ↓.</p>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${r.priorities.map((id, i) => {
          const p = REPLACE_PRIORITIES.find(x => x.id === id);
          return `
            <div style="display:flex;align-items:center;gap:10px;background:var(--bg);border-radius:12px;padding:12px 14px;">
              <span style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${i + 1}</span>
              <span style="flex:1;font-size:14px;font-weight:600;color:var(--text);">${p?.label || id}</span>
              <div style="display:flex;gap:2px;">
                ${i > 0
                  ? `<button onclick="replacePrioMove(${i},${i - 1})" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:2px 6px;">↑</button>`
                  : '<span style="width:30px;"></span>'}
                ${i < r.priorities.length - 1
                  ? `<button onclick="replacePrioMove(${i},${i + 1})" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:2px 6px;">↓</button>`
                  : '<span style="width:30px;"></span>'}
              </div>
            </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:20px;">
        <button onclick="replaceState.step=3;updateReplaceModal()"
          style="flex:1;border:1.5px solid var(--border);color:var(--muted);background:#fff;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;">
          ← Zurück
        </button>
        <button onclick="loadReplaceRecommendations('${device.id}')" ${r.recoLoading ? 'disabled' : ''}
          style="flex:1;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;opacity:${r.recoLoading ? '0.6' : '1'};">
          ${r.recoLoading
            ? `<div class="spinner" style="width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;"></div>Suche …`
            : 'Empfehlungen laden →'}
        </button>
      </div>
      ${r.recoError ? `<p style="margin-top:10px;font-size:13px;color:#c0392b;background:#fdf2f2;border-radius:8px;padding:8px 12px;">⚠️ ${escHtml(r.recoError)}</p>` : ''}`;
  }

  // ── Step 5: Empfehlungen ─────────────────────────────────────────────────
  else if (r.step === 5) {
    const accentColors = ['var(--primary)', '#6366f1', '#f59e0b'];
    const rankLabels   = ['Bestes Preis-Leistungs-Verhältnis', 'Meiste Features', 'Premium-Option'];

    body = `
      <h3 style="font-size:16px;font-weight:700;margin:0 0 6px;">Unsere Empfehlungen</h3>
      ${r.recoSummary ? `<p style="font-size:13px;color:var(--muted);margin:0 0 14px;">${escHtml(r.recoSummary)}</p>` : ''}
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${(r.recommendations || []).map((rec, ri) => `
          <div style="border:2px solid ${accentColors[ri]}30;border-radius:14px;overflow:hidden;">
            <div style="padding:14px;">
              <span style="display:inline-block;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;background:${accentColors[ri]};color:#fff;margin-bottom:8px;">
                ${rankLabels[ri]}
              </span>
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
                <div>
                  <div style="font-weight:700;font-size:14px;color:var(--text);">${escHtml(rec.name)}</div>
                  <div style="font-size:12px;color:var(--muted);">${escHtml(rec.brand)}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                  <div style="font-weight:700;font-size:14px;color:${accentColors[ri]};">${escHtml(rec.price_estimate)}</div>
                  ${rec.energy_class ? `<div style="font-size:11px;background:#f0fdf4;color:#166534;border-radius:20px;padding:2px 6px;margin-top:2px;">${escHtml(rec.energy_class)}</div>` : ''}
                </div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
                ${(rec.top_features || []).map(f =>
                  `<span style="font-size:11px;padding:3px 8px;border-radius:20px;border:1px solid var(--border);color:var(--muted);">${escHtml(f)}</span>`
                ).join('')}
              </div>
              <button onclick="replaceState.expandedReco=replaceState.expandedReco===${ri}?null:${ri};updateReplaceModal()"
                style="font-size:12px;font-weight:600;color:${accentColors[ri]};background:none;border:none;cursor:pointer;padding:0;">
                ${r.expandedReco === ri ? '▲ Weniger' : '▼ Warum diese Empfehlung?'}
              </button>
              ${r.expandedReco === ri
                ? `<p style="font-size:13px;color:var(--muted);margin:8px 0 0;line-height:1.55;">${escHtml(rec.why)}</p>`
                : ''}
              <div style="display:flex;gap:6px;margin-top:10px;">
                <a href="https://www.amazon.at/s?k=${encodeURIComponent(rec.search_term)}" target="_blank"
                  style="flex:1;text-align:center;font-size:12px;font-weight:600;padding:8px;border-radius:10px;border:2px solid ${accentColors[ri]};color:${accentColors[ri]};text-decoration:none;">
                  🛒 Amazon.at
                </a>
                <a href="https://www.google.at/search?q=${encodeURIComponent(rec.search_term + ' kaufen')}" target="_blank"
                  style="flex:1;text-align:center;font-size:12px;font-weight:600;padding:8px;border-radius:10px;border:2px solid var(--border);color:var(--muted);text-decoration:none;">
                  🔍 Google.at
                </a>
              </div>
            </div>
          </div>`).join('')}
      </div>
      <p style="font-size:12px;color:var(--muted);margin:12px 0 0;background:var(--bg);border-radius:8px;padding:10px;">
        ℹ️ Empfehlungen basieren auf KI-Analyse. Preise können abweichen.
      </p>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button onclick="closeReplaceModal();openSellModal('${device.id}')"
          style="flex:1;border:1.5px solid var(--border);color:var(--text);background:#fff;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;">
          🏷️ Verkaufen
        </button>
        <button onclick="closeReplaceModal()"
          style="flex:1;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;">
          Fertig ✓
        </button>
      </div>`;
  }

  return `
    <div style="position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.5);"
      onclick="if(event.target===this)closeReplaceModal()">
      <div style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px;max-height:95vh;overflow-y:auto;" class="fade-in">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border);">
          <span style="font-size:16px;font-weight:700;color:var(--text);">🔄 Gerät ersetzen</span>
          <button onclick="closeReplaceModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:22px;line-height:1;">×</button>
        </div>
        ${prog}
        ${body}
      </div>
    </div>`;
}
