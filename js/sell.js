// ─── Sell wizard state ────────────────────────────────────────────────────────
// Module-level (not in global `state`) — lives only while modal is open.
let sellState = null;

// ─── Open / Close ─────────────────────────────────────────────────────────────
function openSellModal(deviceId) {
  const device = state.devices.find(d => d.id === deviceId);
  if (!device) return;

  sellState = {
    deviceId,
    step: 1,
    // Step 1 inputs
    kaufpreis: '',
    zustand: 'Gut',
    // Step 1 → 2 API result
    priceLoading: false,
    priceError: null,
    priceResult: null,
    finalPrice: '',
    // Step 2 → 3 API result
    listingLoading: false,
    listingError: null,
    listing: null,
    // Step 3 post-action
    showSoldPrompt: false,
  };

  updateSellModal();
}

function closeSellModal() {
  sellState = null;
  const el = document.getElementById('sell-modal-root');
  if (el) el.remove();
}

// ─── Modal DOM management ─────────────────────────────────────────────────────
function updateSellModal() {
  let el = document.getElementById('sell-modal-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sell-modal-root';
    document.body.appendChild(el);
  }
  el.innerHTML = renderSellModal();
}

// ─── Step 1 API: Preis schätzen ───────────────────────────────────────────────
async function sellStep1(deviceId) {
  const v = sellState;
  if (!v || !state.apiKey) return;
  const device = state.devices.find(d => d.id === deviceId);
  if (!device) return;

  v.priceLoading = true;
  v.priceError = null;
  updateSellModal();

  const kaufjahr = device.myDevice?.kaufdatum
    ? device.myDevice.kaufdatum.slice(0, 4)
    : 'unbekannt';

  try {
    const data = await callAnthropic({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: `You are a pricing expert for second-hand household devices in Austria.
Return ONLY valid JSON, no other text:
{"min_price":number,"max_price":number,"recommended_price":number,"reasoning":"one sentence in German"}`,
      messages: [{
        role: 'user',
        content: `Device: ${device.name} ${device.marke} ${device.modell}
Original price: ${v.kaufpreis || 'unbekannt'} EUR
Year: ${kaufjahr}
Condition: ${v.zustand}`,
      }],
    });

    const match = data.content[0].text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    if (!parsed?.recommended_price) throw new Error('Ungültige Antwort');

    v.priceResult = parsed;
    v.finalPrice  = String(parsed.recommended_price);
    v.step = 2;
  } catch (e) {
    v.priceError = e.message || 'Unbekannter Fehler';
  }

  v.priceLoading = false;
  updateSellModal();
}

// ─── Step 2 API: Inserat generieren ──────────────────────────────────────────
async function sellStep2(deviceId) {
  const v = sellState;
  if (!v || !state.apiKey) return;
  const device = state.devices.find(d => d.id === deviceId);
  if (!device) return;

  v.listingLoading = true;
  v.listingError   = null;
  updateSellModal();

  const kaufjahr = device.myDevice?.kaufdatum
    ? device.myDevice.kaufdatum.slice(0, 4)
    : 'unbekannt';

  // Enrich with agent data if available
  const issues = (device.known_issues?.issues || [])
    .map(i => i.problem).join(', ') || 'keine bekannten Mängel';
  const specs = [
    device.manual?.key_specs?.capacity,
    device.manual?.key_specs?.energy_class,
    ...(device.manual?.key_specs?.special_features || []),
  ].filter(Boolean).join(', ') || '';

  try {
    const data = await callAnthropic({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: `You are a listing expert for willhaben.at, Austria's largest classifieds platform.
Write in friendly, honest Austrian German.
Return ONLY valid JSON, no other text:
{"titel":"max 60 chars","beschreibung":"100-150 words","kategorie_vorschlag":"German category","suchbegriffe":["tag1","tag2","tag3"]}`,
      messages: [{
        role: 'user',
        content: `Create a willhaben.at listing for:
Device: ${device.name} (${device.marke} ${device.modell})
Original price: ${v.kaufpreis || 'unbekannt'} EUR
Purchase year: ${kaufjahr}
Condition: ${v.zustand}
Asking price: ${v.finalPrice} EUR
Known issues: ${issues}
Special features: ${specs}
Be honest about condition and known issues.`,
      }],
    });

    const match = data.content[0].text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    if (!parsed?.titel) throw new Error('Ungültige Antwort');

    v.listing = parsed;
    v.step = 3;
  } catch (e) {
    v.listingError = e.message || 'Unbekannter Fehler';
  }

  v.listingLoading = false;
  updateSellModal();
}

// ─── Step 3 actions ───────────────────────────────────────────────────────────
function sellKopieren() {
  const v = sellState;
  if (!v?.listing) return;
  const text = `${v.listing.titel}\nPreis: ${v.finalPrice} EUR\n\n${v.listing.beschreibung}\n\nKategorie: ${v.listing.kategorie_vorschlag}`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('✓ Text kopiert!');
    v.showSoldPrompt = true;
    updateSellModal();
  });
}

function sellWillhaben() {
  window.open('https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz/', '_blank');
  sellState.showSoldPrompt = true;
  updateSellModal();
}

function markAsSold(deviceId) {
  const device = state.devices.find(d => d.id === deviceId);
  if (device) {
    device.sold_at = new Date().toISOString().slice(0, 10);
    saveDevices();
  }
  closeSellModal();
  showToast('Als verkauft markiert ✓');
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderSellModal() {
  const v = sellState;
  if (!v) return '';

  const device = state.devices.find(d => d.id === v.deviceId);
  if (!device) return '';

  const ZUSTAND = ['Wie neu', 'Sehr gut', 'Gut', 'Gebraucht', 'Defekt'];

  // Step progress indicator
  const prog = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:20px;">
      ${[1, 2, 3].map(i => `
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;${v.step >= i ? 'background:var(--primary);color:#fff;' : 'background:var(--border);color:var(--muted);'}">
            ${v.step > i ? '✓' : i}
          </div>
          ${i < 3 ? `<div style="height:2px;width:20px;background:${v.step > i ? 'var(--primary)' : 'var(--border)'};">&zwnj;</div>` : ''}
        </div>`).join('')}
      <span style="font-size:12px;color:var(--muted);margin-left:4px;">Schritt ${v.step}/3</span>
    </div>`;

  const inp = `style="width:100%;border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;font-size:14px;color:var(--text);outline:none;box-sizing:border-box;background:#fff;"`;

  let body = '';

  // ── Step 1: Zustand & Kaufpreis ──────────────────────────────────────────
  if (v.step === 1) {
    body = `
      <h3 style="font-size:16px;font-weight:700;color:var(--text);margin:0 0 4px;">Zeitwert-Schätzung</h3>
      <p style="font-size:13px;color:var(--muted);margin:0 0 16px;">${escHtml(device.name)}</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Kaufpreis (EUR)</label>
          <input type="number" value="${escHtml(v.kaufpreis)}" placeholder="0" min="0"
            oninput="sellState.kaufpreis=this.value" ${inp}>
        </div>
        <div>
          <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Zustand</label>
          <select oninput="sellState.zustand=this.value" ${inp}>
            ${ZUSTAND.map(z => `<option ${v.zustand === z ? 'selected' : ''}>${z}</option>`).join('')}
          </select>
        </div>
      </div>
      ${v.priceError ? `<p style="margin-top:12px;font-size:13px;color:#c0392b;background:#fdf2f2;border-radius:8px;padding:8px 12px;">⚠️ ${escHtml(v.priceError)}</p>` : ''}
      ${!state.apiKey ? `<p style="margin-top:12px;font-size:13px;color:#b45309;background:#fffbf0;border-radius:8px;padding:8px 12px;">🔑 Kein API-Schlüssel. <button onclick="closeSellModal();navigate('settings')" style="font-weight:600;background:none;border:none;cursor:pointer;color:#b45309;text-decoration:underline;">Einrichten →</button></p>` : ''}
      <div style="display:flex;gap:8px;margin-top:20px;">
        <button onclick="closeSellModal()" style="flex:1;border:1.5px solid var(--border);color:var(--muted);background:#fff;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;">
          Abbrechen
        </button>
        <button onclick="sellStep1('${device.id}')" ${!state.apiKey || v.priceLoading ? 'disabled' : ''}
          style="flex:1;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;opacity:${!state.apiKey || v.priceLoading ? '0.5' : '1'};display:flex;align-items:center;justify-content:center;gap:8px;">
          ${v.priceLoading ? `<div class="spinner" style="width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;"></div>Schätze …` : 'Preis schätzen →'}
        </button>
      </div>`;
  }

  // ── Step 2: Preisvorschlag + Inserat generieren ──────────────────────────
  else if (v.step === 2) {
    const pr = v.priceResult;
    body = `
      <h3 style="font-size:16px;font-weight:700;color:var(--text);margin:0 0 12px;">Preisvorschlag</h3>
      <div style="background:rgba(76,175,130,0.1);border-radius:12px;padding:16px;margin-bottom:16px;">
        <div style="display:flex;align-items:flex-end;gap:16px;margin-bottom:8px;">
          <div style="text-align:center;">
            <div style="font-size:11px;color:var(--muted);">Min</div>
            <div style="font-weight:700;color:var(--text);">${pr.min_price} €</div>
          </div>
          <div style="text-align:center;flex:1;">
            <div style="font-size:11px;font-weight:600;color:var(--primary);margin-bottom:2px;">Empfehlung</div>
            <div style="font-size:24px;font-weight:800;color:var(--primary);">${pr.recommended_price} €</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:11px;color:var(--muted);">Max</div>
            <div style="font-weight:700;color:var(--text);">${pr.max_price} €</div>
          </div>
        </div>
        <p style="font-size:12px;color:var(--muted);margin:0;border-top:1px solid rgba(76,175,130,0.2);padding-top:8px;">${escHtml(pr.reasoning)}</p>
      </div>
      <div>
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Dein Verkaufspreis (EUR)</label>
        <input type="number" value="${escHtml(v.finalPrice)}" min="0"
          oninput="sellState.finalPrice=this.value" ${inp}>
      </div>
      ${v.listingError ? `<p style="margin-top:12px;font-size:13px;color:#c0392b;background:#fdf2f2;border-radius:8px;padding:8px 12px;">⚠️ ${escHtml(v.listingError)}</p>` : ''}
      <div style="display:flex;gap:8px;margin-top:20px;">
        <button onclick="sellState.step=1;updateSellModal()" style="flex:1;border:1.5px solid var(--border);color:var(--muted);background:#fff;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;">
          ← Zurück
        </button>
        <button onclick="sellStep2('${device.id}')" ${v.listingLoading ? 'disabled' : ''}
          style="flex:1;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;opacity:${v.listingLoading ? '0.5' : '1'};display:flex;align-items:center;justify-content:center;gap:8px;">
          ${v.listingLoading ? `<div class="spinner" style="width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;"></div>Generiere …` : 'Inserat generieren →'}
        </button>
      </div>`;
  }

  // ── Step 3: Vorschau + Export ────────────────────────────────────────────
  else if (v.step === 3) {
    const l = v.listing;
    body = `
      <h3 style="font-size:16px;font-weight:700;color:var(--text);margin:0 0 16px;">Inseratsvorschau</h3>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Titel</label>
          <input type="text" value="${escHtml(l.titel)}" maxlength="60"
            oninput="sellState.listing.titel=this.value"
            style="width:100%;border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;font-size:14px;font-weight:600;color:var(--text);outline:none;box-sizing:border-box;background:#fff;">
        </div>
        <div>
          <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Preis (EUR)</label>
          <input type="number" value="${escHtml(v.finalPrice)}" min="0"
            oninput="sellState.finalPrice=this.value" ${inp}>
        </div>
        <div>
          <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Beschreibung</label>
          <textarea rows="5" oninput="sellState.listing.beschreibung=this.value"
            style="width:100%;border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;font-size:14px;color:var(--text);outline:none;resize:none;box-sizing:border-box;background:#fff;">${escHtml(l.beschreibung)}</textarea>
        </div>
        <div style="background:var(--bg);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--muted);">
          Kategorie: <span style="color:var(--text);font-weight:500;">${escHtml(l.kategorie_vorschlag)}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${(l.suchbegriffe || []).map(t =>
            `<span style="font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;background:rgba(76,175,130,0.12);color:var(--primary);">${escHtml(t)}</span>`
          ).join('')}
        </div>
      </div>

      ${v.showSoldPrompt ? `
        <div style="margin-top:16px;background:#fffbf0;border:1px solid #fde68a;border-radius:12px;padding:14px;">
          <p style="font-size:14px;font-weight:600;color:#92400e;margin:0 0 10px;">Gerät als verkauft markieren?</p>
          <div style="display:flex;gap:8px;">
            <button onclick="markAsSold('${device.id}')"
              style="flex:1;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:10px;font-weight:600;font-size:14px;cursor:pointer;">
              Ja, verkauft ✓
            </button>
            <button onclick="closeSellModal()"
              style="flex:1;border:1.5px solid #fde68a;color:#92400e;background:#fff;border-radius:10px;padding:10px;font-weight:600;font-size:14px;cursor:pointer;">
              Nein
            </button>
          </div>
        </div>` : `
        <div style="margin-top:16px;">
          <div style="display:flex;gap:8px;margin-bottom:10px;">
            <button onclick="sellKopieren()"
              style="flex:1;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
              📋 Text kopieren
            </button>
            <button onclick="sellWillhaben()"
              style="flex:1;border:1.5px solid var(--border);color:var(--text);background:#fff;border-radius:10px;padding:11px;font-weight:600;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
              🔗 willhaben
            </button>
          </div>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;">
            <p style="font-size:12px;color:#1e40af;margin:0;">💡 Kopiere den Text zuerst, dann öffne willhaben und füge ihn in dein Inserat ein.</p>
          </div>
        </div>`}`;
  }

  return `
    <div style="position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.5);"
      onclick="if(event.target===this)closeSellModal()">
      <div style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px;max-height:92vh;overflow-y:auto;" class="fade-in">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border);">
          <span style="font-size:16px;font-weight:700;color:var(--text);">🏷️ Inserat vorbereiten</span>
          <button onclick="closeSellModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:22px;line-height:1;">×</button>
        </div>
        ${prog}
        ${body}
      </div>
    </div>`;
}
