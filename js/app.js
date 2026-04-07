// ─── AI Model ─────────────────────────────────────────────────────────────────
window.AI_MODEL = 'claude-3-5-sonnet-latest';

// ─── Constants ────────────────────────────────────────────────────────────────
const ROOMS = [
  { id:'kueche',       label:'Küche',        iconKey:'room-kitchen',   icon: ICONS['room-kitchen'] },
  { id:'bad',          label:'Bad',           iconKey:'room-bathroom',  icon: ICONS['room-bathroom'] },
  { id:'wohnzimmer',   label:'Wohnzimmer',    iconKey:'room-living',    icon: ICONS['room-living'] },
  { id:'schlafzimmer', label:'Schlafzimmer',  iconKey:'room-bedroom',   icon: ICONS['room-bedroom'] },
  { id:'buero',        label:'Büro',          iconKey:'room-study',     icon: ICONS['room-study'] },
  { id:'keller',       label:'Keller',        iconKey:'room-cellar',    icon: ICONS['room-cellar'] },
  { id:'garage',       label:'Garage',        iconKey:'room-garage',    icon: ICONS['room-garage'] },
  { id:'abstellraum',  label:'Abstellraum',   iconKey:'room-storage',   icon: ICONS['room-storage'] },
  { id:'kinderzimmer', label:'Kinderzimmer',  iconKey:'room-kids',      icon: ICONS['room-kids'] },
  { id:'sonstiges',    label:'Sonstiges',     iconKey:'room-outdoor',   icon: ICONS['room-outdoor'] },
];

const DEVICE_PHOTOS = [
  { keys:['geschirrspül','dishwasher'],                                  id:'photo-1585771724684-38269d6639fd' },
  { keys:['waschmaschine','washing'],                                    id:'photo-1582735689369-4fe89db7114c' },
  { keys:['trockner','dryer'],                                           id:'photo-1626806787461-102c1bfaaea1' },
  { keys:['kühlschrank','kuehlschrank','fridge','refrigerator'],         id:'photo-1584568694244-14fbdf83bd30' },
  { keys:['herd','backofen','oven','stove'],                             id:'photo-1556909114-f6e7ad7d3136' },
  { keys:['kaffeemaschine','coffee'],                                    id:'photo-1559056199-641a0ac8b55e' },
  { keys:['mikrowelle','microwave'],                                     id:'photo-1574269909862-7e1d70bb8078' },
  { keys:['fernseher','television','tv'],                                id:'photo-1593359677879-a4bb92f829d1' },
  { keys:['staubsauger','vacuum'],                                       id:'photo-1558618666-fcd25c85cd64' },
  { keys:['spülmaschine'],                                               id:'photo-1585771724684-38269d6639fd' },
];

// ─── Typenschild positions (verified from repair service sources) ─────────────
const TYPENSCHILD_POSITIONEN = {
  'Waschmaschine': {
    primary: 'Öffne die Gerätetür (Bullauge). Das Typenschild befindet sich am Türrahmen innen oder auf dem Gehäuse rund um die Einfüllöffnung.',
    secondary: 'Falls dort nichts zu finden: hinter der Flusensiebklappe unten vorne am Sockel oder auf der Rückseite.',
    tip: 'Bei Siemens/Bosch oft auf der Innenseite des Bullauges selbst.'
  },
  'Wäschetrockner': {
    primary: 'Öffne die Gerätetür. Das Typenschild befindet sich am inneren Türrahmen oder auf dem Gehäuse rund um die Einfüllöffnung.',
    secondary: 'Falls dort nichts zu finden: an der Rückseite des Geräts oder hinter dem Flusensieb.',
    tip: 'Bei Siemens/Bosch oft auf der Innenseite der Tür selbst (wie unser Testgerät WT47XE40).'
  },
  'Geschirrspüler': {
    primary: 'Öffne die Gerätetür vollständig. Das Typenschild befindet sich am Rand der Türinnenseite oder links oben in der Türkante.',
    secondary: 'Manchmal eingeprägt oder gelasert — mit Licht beleuchten. Alternativ an der Rückseite.',
    tip: 'Oft schwer zu lesen da eingraviert — Taschenlampe oder Handy-Licht hilft.'
  },
  'Kühlschrank': {
    primary: 'Das Typenschild befindet sich im Innenraum an der linken Seitenwand, im Bereich der Gemüseschublade.',
    secondary: 'Gemüse- oder BioFresh-Schublade herausziehen. Alternativ an der Rückseite des Geräts.',
    tip: 'Bei Samsung oft rechts innen oben. Bei Liebherr/Miele links unten innen.'
  },
  'Gefrierschrank': {
    primary: 'Im Innenraum an der linken Seitenwand. Schubfächer ganz herausziehen — es kann in unterschiedlicher Höhe angebracht sein.',
    secondary: 'Alternativ an der Rückseite oder Außenseite unten.',
    tip: 'Schubfächer vollständig entnehmen für beste Sicht.'
  },
  'Gefriertruhe': {
    primary: 'An der rechten Außenseite des Geräts.',
    secondary: 'Alternativ innen am Deckel oder auf der Rückseite.',
    tip: 'Meist gut sichtbar außen — kein Öffnen nötig.'
  },
  'Herd/Backofen': {
    primary: 'Öffne die Backofentür. Das Typenschild befindet sich unter der oberen Bedienblende oder im Türrahmen innen.',
    secondary: 'Manchmal in der Schublade unter der Backofentür oder an den Seitenwänden außen.',
    tip: 'Tür weit öffnen und Taschenlampe in den Rahmen halten.'
  },
  'Kochfeld': {
    primary: 'Das Typenschild ist oft nur nach dem Ausbau zugänglich. Suche zuerst in den Geräteunterlagen nach einem beigelegten Aufkleber.',
    secondary: 'Manchmal an der Unterseite des Kochfelds.',
    tip: 'Oft liegt ein separater Aufkleber mit den Daten in der Originalverpackung oder Anleitung.'
  },
  'Mikrowelle': {
    primary: 'An der Rückseite des Geräts oder an der Seitenwand innen im Garraum.',
    secondary: 'Manchmal unter dem Gerät.',
    tip: 'Gerät vorsichtig von der Wand ziehen für Zugang zur Rückseite.'
  },
  'Kaffeemaschine': {
    primary: 'Unter dem Gerät (Unterseite) oder an der Rückseite.',
    secondary: 'Bei Vollautomaten manchmal hinter der Wartungsklappe oder im Wassertankschacht.',
    tip: 'Gerät anheben und Unterseite fotografieren — meist am einfachsten.'
  },
  'Dunstabzugshaube': {
    primary: 'Fettfilter entfernen. Das Typenschild befindet sich im Schacht hinter den Fettfiltern.',
    secondary: 'Manchmal oben auf der Haube außen.',
    tip: 'Beide Fettfilter ausklappen oder herausziehen für freien Blick in den Schacht.'
  },
  'Klimaanlage': {
    primary: 'An der Seite oder Rückseite des Innengeräts.',
    secondary: 'Manchmal unter der Frontblende des Innengeräts.',
    tip: 'Frontblende des Innengeräts leicht anheben.'
  },
  'Staubsauger': {
    primary: 'Unter dem Gerät (Unterseite) oder an der Rückseite.',
    secondary: 'Bei Stabstaubsaugern auf der Rückseite des Griffs.',
    tip: 'Gerät umdrehen — meist gut sichtbar auf der Unterseite.'
  },
  'Sonstiges': {
    primary: 'Das Typenschild befindet sich meist an der Rückseite, Unterseite oder innen am Gerät.',
    secondary: 'Suche nach einem Aufkleber mit Modell- und Seriennummer.',
    tip: 'Mit Taschenlampe alle Seiten absuchen.'
  },
};

// ─── Shared state (loaded once from localStorage per page) ───────────────────
const state = {
  devices:       JSON.parse(localStorage.getItem('hg_devices')       || '[]'),
  chats:         JSON.parse(localStorage.getItem('hg_chats')         || '{}'),
  apiKey:        localStorage.getItem('hg_apikey') || '',
  installateure: JSON.parse(localStorage.getItem('hg_installateure') || '[]'),
};

// ─── Persistence ──────────────────────────────────────────────────────────────
function saveDevices()      { localStorage.setItem('hg_devices',       JSON.stringify(state.devices));       }
function saveChats()        { localStorage.setItem('hg_chats',         JSON.stringify(state.chats));         }
function saveInstallateure(){ localStorage.setItem('hg_installateure', JSON.stringify(state.installateure)); }

function findInstallateurByName(name) {
  if (!name) return null;
  const q = name.toLowerCase().trim();
  return state.installateure.find(i =>
    i.firmenname.toLowerCase().includes(q) || q.includes(i.firmenname.toLowerCase())
  );
}

function upsertInstallateur(data) {
  const existing = findInstallateurByName(data.firmenname);
  if (existing) {
    ['adresse','telefon','email','website'].forEach(k => { if (data[k]) existing[k] = data[k]; });
    existing.letzterKontakt = new Date().toISOString().slice(0,10);
    saveInstallateure();
    return existing.id;
  }
  const entry = {
    id:             'inst_' + Date.now(),
    firmenname:     data.firmenname || '',
    adresse:        data.adresse    || '',
    telefon:        data.telefon    || '',
    email:          data.email      || '',
    website:        data.website    || '',
    notizen:        '',
    erstellt:       new Date().toISOString().slice(0,10),
    letzterKontakt: new Date().toISOString().slice(0,10),
  };
  state.installateure.push(entry);
  saveInstallateure();
  return entry.id;
}

// ─── Navigation (MPA: href-based) ────────────────────────────────────────────
function navigate(page, id) {
  const routes = {
    main:     'index.html',
    add:      'add-device.html',
    settings: 'settings.html',
    detail:   `device.html?id=${id || ''}`,
  };
  window.location.href = routes[page] || 'index.html';
}

// ─── URL helpers ──────────────────────────────────────────────────────────────
function getUrlParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function getDevice(id) {
  const deviceId = id || getUrlParam('id');
  return state.devices.find(d => d.id === deviceId) || null;
}

// ─── Device actions ───────────────────────────────────────────────────────────
function deleteDevice(id) {
  state.devices = state.devices.filter(d => d.id !== id);
  delete state.chats[id];
  saveDevices();
  saveChats();
  showToast('Gerät gelöscht');
  navigate('main');
}

function confirmDelete(id) {
  if (confirm('Gerät wirklich löschen? Alle Daten gehen verloren.')) deleteDevice(id);
}

// ─── Settings actions ─────────────────────────────────────────────────────────
function saveApiKey() {
  state.apiKey = (document.getElementById('s-apikey')?.value || '').trim();
  localStorage.setItem('hg_apikey', state.apiKey);
  showToast('API-Schlüssel gespeichert ✓');
}

function resetAll() {
  if (!confirm('Wirklich ALLE Daten löschen? Geräte, Chats und API-Schlüssel werden entfernt.')) return;
  state.devices = []; state.chats = {}; state.apiKey = '';
  localStorage.removeItem('hg_devices');
  localStorage.removeItem('hg_chats');
  localStorage.removeItem('hg_apikey');
  navigate('main');
}

// ─── Data export / import ─────────────────────────────────────────────────────
function exportData() {
  const dump = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('hg_')) dump[k] = localStorage.getItem(k);
  }
  dump['_exportedAt'] = new Date().toISOString();
  dump['_version']    = '1.0';
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `haushalt-genie-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup erstellt ✓');
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const dump = JSON.parse(e.target.result);
      let count = 0;
      for (const [k, v] of Object.entries(dump)) {
        if (k.startsWith('hg_')) { localStorage.setItem(k, v); count++; }
      }
      showToast(`${count} Einträge wiederhergestellt ✓`);
      setTimeout(() => window.location.reload(), 800);
    } catch {
      showToast('Fehler beim Lesen der Datei');
    }
  };
  reader.readAsText(file);
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 text-white text-sm px-5 py-2 rounded-full shadow-lg z-50 pointer-events-none';
  t.style.cssText = 'background-color:#0D9488; opacity:1; transition:opacity 0.35s;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; }, 1800);
  setTimeout(() => t.remove(), 2200);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


function roomSuggestionToId(s) {
  if (!s) return '';
  const l = s.toLowerCase();
  if (l.includes('küche')  || l.includes('kuche'))                        return 'kueche';
  if (l.includes('bad')    || l.includes('bath'))                         return 'bad';
  if (l.includes('wohn'))                                                  return 'wohnzimmer';
  if (l.includes('schlaf'))                                                return 'schlafzimmer';
  if (l.includes('büro')   || l.includes('buro') || l.includes('office')) return 'buero';
  if (l.includes('keller') || l.includes('basement'))                     return 'keller';
  if (l.includes('garage'))                                                return 'garage';
  if (l.includes('abstellraum') || l.includes('abstell') || l.includes('storage')) return 'abstellraum';
  if (l.includes('kinderzimmer') || l.includes('kinder') || l.includes('kind'))    return 'kinderzimmer';
  return 'sonstiges';
}

function getDevicePlaceholderImg(name) {
  const n = (name || '').toLowerCase();
  const match = DEVICE_PHOTOS.find(d => d.keys.some(k => n.includes(k)));
  const id = match ? match.id : 'photo-1558618666-fcd25c85cd64';
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=480&h=220&q=80`;
}

// ─── Anthropic API base caller ────────────────────────────────────────────────
// All JS modules call this instead of writing their own fetch.
async function callAnthropic(body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': state.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Image resizer (shared by add-device and agents) ─────────────────────────
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 1024;
        let { width: w, height: h } = img;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
          else        { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        resolve({ dataUrl, base64: dataUrl.split(',')[1], mime: 'image/jpeg' });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
