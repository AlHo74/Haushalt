// ─── Chat history helpers ─────────────────────────────────────────────────────
const CHAT_MAX_MESSAGES = 50;

function loadChatHistory(deviceId) {
  const device = state.devices.find(d => d.id === deviceId);
  return device?.chat_history || [];
}

function saveChatMessage(deviceId, role, message, level = 1) {
  const device = state.devices.find(d => d.id === deviceId);
  if (!device) return;
  if (!device.chat_history) device.chat_history = [];

  device.chat_history.push({ role, message, level, ts: Date.now() });

  // Trim to last N messages
  if (device.chat_history.length > CHAT_MAX_MESSAGES) {
    device.chat_history = device.chat_history.slice(-CHAT_MAX_MESSAGES);
  }
  saveDevices();
}

// ─── Grounded system prompt ───────────────────────────────────────────────────
// Built dynamically from whatever agent content is stored for the device.
function buildSystemPrompt(device) {
  const sections = [];

  // Agent 1: Bedienungsanleitung
  if (device.manual?.found) {
    const m = device.manual;
    const lines = [];
    if (m.key_specs?.capacity)     lines.push(`Kapazität: ${m.key_specs.capacity}`);
    if (m.key_specs?.energy_class) lines.push(`Energieklasse: ${m.key_specs.energy_class}`);
    (m.key_specs?.special_features || []).forEach(f => lines.push(f));
    if (m.programs?.length)        lines.push(`Programme: ${m.programs.join(', ')}`);
    (m.quick_start_tips || []).forEach(t => lines.push(`- ${t}`));
    if (lines.length) sections.push(`BEDIENUNGSANLEITUNG:\n${lines.join('\n')}`);
  }

  // Agent 2: FAQs
  if (device.faqs?.faqs?.length) {
    const text = device.faqs.faqs
      .map(f => `F: ${f.question}\nA: ${f.answer}`)
      .join('\n\n');
    sections.push(`FAQs:\n${text}`);
  }

  // Agent 3: Known issues
  if (device.known_issues?.issues?.length) {
    const text = device.known_issues.issues
      .map(i => `Problem: ${i.problem}\nFix: ${i.fix}`)
      .join('\n\n');
    sections.push(`BEKANNTE PROBLEME & LÖSUNGEN:\n${text}`);
  }

  // Agent 4: Hacks
  if (device.hacks?.hacks?.length) {
    const text = device.hacks.hacks.map(h => `- ${h.tip}`).join('\n');
    sections.push(`HACKS & TIPPS:\n${text}`);
  }

  // Agent 5: Spare parts
  if (device.spare_parts?.parts?.length) {
    const text = device.spare_parts.parts
      .map(p => `${p.name} (Suche: "${p.search_term}")`)
      .join('\n');
    sections.push(`ERSATZTEILE & ZUBEHÖR:\n${text}`);
  }

  // Agent 6: Energy
  if (device.energy?.eco_tips?.length) {
    const tips = device.energy.eco_tips.map(t => `- ${t.tip}`).join('\n');
    const header = [
      device.energy.energy_class ? `Energieklasse: ${device.energy.energy_class}` : null,
      device.energy.consumption_kwh ? `Verbrauch: ${device.energy.consumption_kwh} kWh ${device.energy.consumption_note || ''}` : null,
    ].filter(Boolean).join('\n');
    sections.push(`ENERGIEEFFIZIENZ:\n${header}\n${tips}`);
  }

  const context = sections.length
    ? sections.join('\n\n')
    : '(Noch keine Informationen von den Agenten verfügbar.)';

  return `Du bist Haushalt-Genie, ein präziser Haushaltsexperte für das Gerät: ${device.name} (${device.marke} ${device.modell}).

Dir stehen folgende recherchierte Informationen zu diesem Gerät zur Verfügung:

${context}

WICHTIGE REGELN:
1. Beantworte Fragen NUR auf Basis der oben angeführten Informationen.
2. Wenn eine Frage nicht beantwortet werden kann, antworte mit: "Dazu liegen mir leider keine gesicherten Informationen vor. Bitte wende dich an den Hersteller oder einen Fachmann."
3. Erfinde NIEMALS Informationen, Modellnummern, Preise oder Anleitungen.
4. Antworte immer auf Deutsch.
5. Erkenne Sicherheitsrisiken: Öffnen des Geräts, Reparaturen am Stromnetz, Firmware-Eingriffe, Stromgefahr → setze disclaimer_level auf 4.
6. Verwende disclaimer_level: 1 für Herstellerinfos, 2 für FAQs/bekannte Probleme, 3 für Hacks/Tipps, 4 für Sicherheitswarnungen.

Antworte IMMER in diesem JSON-Format, kein anderer Text:
{
  "disclaimer_level": 1,
  "message": "deine Antwort hier",
  "source": "manual|faqs|issues|hacks|parts|energy|unknown"
}`;
}

// ─── Disclaimer rendering ─────────────────────────────────────────────────────
function renderDisclaimer(level) {
  switch (level) {
    case 1:
      return `<div style="font-size:11px;color:var(--muted);margin-top:4px;padding-left:2px;">
        Quelle: Offizielle Herstellerinformation
      </div>`;
    case 2:
      return `<div style="display:flex;align-items:flex-start;gap:6px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 10px;margin-bottom:6px;font-size:12px;color:#92400e;">
        ⚠️ Nicht direkt vom Hersteller. Bitte eigenständig verifizieren.
      </div>`;
    case 3:
      return `<div style="display:flex;align-items:flex-start;gap:6px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:8px 10px;margin-bottom:6px;font-size:12px;color:#9a3412;">
        ⚠️ Community-Tipp, nicht vom Hersteller geprüft. Auf eigene Verantwortung.
      </div>`;
    case 4:
      return `<div style="display:flex;align-items:flex-start;gap:8px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:12px 14px;margin-bottom:8px;font-size:13px;color:#991b1b;font-weight:600;">
        🚨 SICHERHEITSWARNUNG: Öffnen des Geräts, Eingriffe am Stromnetz oder Garantieverlust möglich.
        Bitte wende dich an einen qualifizierten Fachmann.
      </div>`;
    default:
      return '';
  }
}

// ─── Message rendering ────────────────────────────────────────────────────────
function renderChatMessage(role, message, level = 1) {
  const isUser = role === 'user';

  if (isUser) {
    return `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px;" class="fade-in">
        <div style="max-width:80%;padding:10px 14px;border-radius:18px 18px 4px 18px;font-size:14px;line-height:1.55;background:var(--accent);color:#fff;white-space:pre-wrap;">
          ${escHtml(message)}
        </div>
      </div>`;
  }

  // Level 4 disclaimer goes BEFORE the message bubble
  const disclaimerAbove = level >= 2 ? renderDisclaimer(level) : '';
  const disclaimerBelow = level === 1 ? renderDisclaimer(1) : '';

  return `
    <div style="display:flex;flex-direction:column;align-items:flex-start;margin-bottom:12px;" class="fade-in">
      ${disclaimerAbove}
      <div style="max-width:80%;padding:10px 14px;border-radius:18px 18px 18px 4px;font-size:14px;line-height:1.6;background:var(--border);color:var(--text);white-space:pre-wrap;">
        ${escHtml(message)}
      </div>
      ${disclaimerBelow}
    </div>`;
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function renderTypingIndicator() {
  return `
    <div id="chat-typing" style="display:flex;justify-content:flex-start;margin-bottom:12px;">
      <div style="background:var(--border);border-radius:18px 18px 18px 4px;padding:10px 14px;display:flex;gap:4px;align-items:center;">
        <span class="typing-dot" style="width:6px;height:6px;background:var(--muted);border-radius:50%;display:inline-block;"></span>
        <span class="typing-dot" style="width:6px;height:6px;background:var(--muted);border-radius:50%;display:inline-block;"></span>
        <span class="typing-dot" style="width:6px;height:6px;background:var(--muted);border-radius:50%;display:inline-block;"></span>
      </div>
    </div>`;
}

// ─── Empty state with suggested questions ────────────────────────────────────
function renderEmptyChat(deviceId) {
  const suggestions = [
    'Wie reinige ich dieses Gerät?',
    'Was bedeutet Fehlercode E3?',
    'Wie spare ich Energie?',
  ];
  const chips = suggestions.map(q => `
    <button onclick="fillAndSend('${deviceId}', ${JSON.stringify(escHtml(q))})"
      style="background:var(--card-bg);border:1.5px solid var(--border);border-radius:20px;padding:8px 14px;font-size:13px;color:var(--text);cursor:pointer;white-space:nowrap;transition:border-color .15s;"
      onmouseover="this.style.borderColor='var(--accent)'"
      onmouseout="this.style.borderColor='var(--border)'">
      ${escHtml(q)}
    </button>`).join('');

  return `
    <div id="chat-empty" style="display:flex;flex-direction:column;align-items:center;padding:2.5rem 0 1.5rem;text-align:center;">
      <div style="font-size:2.5rem;margin-bottom:8px;">💬</div>
      <p style="font-size:15px;font-weight:600;color:var(--text);margin:0 0 4px;">Stell mir eine Frage</p>
      <p style="font-size:13px;color:var(--muted);margin:0 0 20px;">Ich beantworte alles zu diesem Gerät.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
        ${chips}
      </div>
    </div>`;
}

// ─── Fill input and send ──────────────────────────────────────────────────────
function fillAndSend(deviceId, question) {
  const input = document.getElementById('chat-input');
  if (!input) return;
  // Unescape HTML entities from escHtml
  const div = document.createElement('div');
  div.innerHTML = question;
  input.value = div.textContent;
  sendChatMessage(deviceId);
}

// ─── Main chat send function ──────────────────────────────────────────────────
async function sendChatMessage(deviceId) {
  const input = document.getElementById('chat-input');
  if (!input) return;

  const userMessage = input.value.trim();
  if (!userMessage) return;

  if (userMessage.length > 500) {
    showToast('Nachricht zu lang (max. 500 Zeichen)');
    return;
  }

  const device = state.devices.find(d => d.id === deviceId);
  if (!device) return;

  // Check if agents have any content yet
  const hasContent = ['manual','faqs','known_issues','hacks','spare_parts','energy']
    .some(key => device[key]);

  if (!hasContent) {
    const allRunning = AGENT_DEFS.every(a => device.agentStatus?.[a.key] === 'running');
    if (allRunning || !device.agentStatus) {
      appendChatBubble(renderChatMessage('assistant',
        'Die Agenten sammeln noch Informationen. Bitte warte einen Moment.',
        1));
      return;
    }
  }

  // Clear empty state, lock input
  const empty = document.getElementById('chat-empty');
  if (empty) empty.remove();
  input.value = '';
  setChatInputLocked(true);

  // Render user bubble + save
  appendChatBubble(renderChatMessage('user', userMessage));
  saveChatMessage(deviceId, 'user', userMessage, 0);
  scrollChatToBottom();

  // Show typing indicator
  const messages = document.getElementById('chat-messages');
  if (messages) messages.insertAdjacentHTML('beforeend', renderTypingIndicator());
  scrollChatToBottom();

  try {
    const history = loadChatHistory(deviceId)
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.message }));

    const data = await callAnthropic({
      model: window.AI_MODEL,
      max_tokens: 800,
      system: buildSystemPrompt(device),
      messages: [
        ...history,
        { role: 'user', content: userMessage },
      ],
    });

    // Remove typing indicator
    document.getElementById('chat-typing')?.remove();

    const text = data.content[0].text;
    let level = 1;
    let reply = text;

    // Try to parse structured JSON response
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        reply = parsed.message || text;
        level = Number(parsed.disclaimer_level) || 1;
      }
    } catch (_) {
      // Fall back to raw text if JSON parse fails
    }

    appendChatBubble(renderChatMessage('assistant', reply, level));
    saveChatMessage(deviceId, 'assistant', reply, level);

  } catch (err) {
    document.getElementById('chat-typing')?.remove();
    const errMsg = 'Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.';
    appendChatBubble(renderChatMessage('assistant', errMsg, 1));
  } finally {
    setChatInputLocked(false);
    scrollChatToBottom();
  }
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function appendChatBubble(html) {
  const messages = document.getElementById('chat-messages');
  if (messages) messages.insertAdjacentHTML('beforeend', html);
}

function scrollChatToBottom() {
  setTimeout(() => {
    const el = document.getElementById('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, 30);
}

function setChatInputLocked(locked) {
  const input  = document.getElementById('chat-input');
  const btn    = document.getElementById('chat-send-btn');
  if (input) input.disabled = locked;
  if (btn)   btn.disabled   = locked;
  if (btn)   btn.style.opacity = locked ? '0.5' : '1';
}

// ─── Load and render full chat history ───────────────────────────────────────
function loadAndRenderHistory(deviceId) {
  const history = loadChatHistory(deviceId);
  const messages = document.getElementById('chat-messages');
  if (!messages) return;

  if (history.length === 0) {
    messages.innerHTML = renderEmptyChat(deviceId);
    return;
  }

  const divider = `
    <div style="text-align:center;font-size:11px;color:var(--muted);padding:8px 0 4px;letter-spacing:0.05em;">
      — Früheres Gespräch —
    </div>`;

  messages.innerHTML = divider + history
    .map(m => renderChatMessage(m.role, m.message, m.level || 1))
    .join('');

  scrollChatToBottom();
}

// ─── Input initialisation (call once on page load) ───────────────────────────
// Wires up Enter-to-send, auto-grow textarea, and send button.
function initChatInput(deviceId) {
  const input = document.getElementById('chat-input');
  const btn   = document.getElementById('chat-send-btn');
  if (!input) return;

  // Auto-grow (max 4 lines ≈ 96px)
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 96) + 'px';
  });

  // Send on Enter (not Shift+Enter)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage(deviceId);
    }
  });

  if (btn) btn.addEventListener('click', () => sendChatMessage(deviceId));

  // Load existing history
  loadAndRenderHistory(deviceId);
}
