# Haushalt-Genie 🏠

Ein KI-gestützter Haushaltsassistent für alle deine Geräte — als einzelne HTML-Datei, keine Installation nötig.

## Features

- **Geräteverwaltung** — Geräte per Foto, Barcode oder manuell hinzufügen
- **6 KI-Agenten** — Bedienungsanleitung, FAQs, Bekannte Probleme, Tipps, Ersatzteile, Energiespartipps
- **Anleitung finden** — Automatische Suche nach Bedienungsanleitung (manualslib.de u.a.)
- **Mein Gerät** — Garantie, Wartung, Dokumente
- **Inserat vorbereiten** — Verkaufsinserat für willhaben.at generieren
- **Nachfolger-Assistent** — Schritt-für-Schritt Replacement-Wizard
- **Modell-Finder** — 4-stufiger Wizard zum Identifizieren via Typenschild-Foto
- **Grounded Chat** — KI-Chat basierend auf Agenten-Inhalten
- **Privathaushalt / Vermieter** — Zwei Modi

## Lokal starten

Einfach `index.html` im Browser öffnen — keine Installation, kein Server nötig.

```bash
open index.html
```

## Konfiguration

1. App öffnen
2. Einstellungen (Zahnrad-Symbol) öffnen
3. Anthropic API-Schlüssel eingeben (`sk-ant-...`)
4. Schlüssel wird nur lokal im Browser (localStorage) gespeichert

Der API-Schlüssel verlässt nie den Browser — er wird direkt an die Anthropic API gesendet.

## Tech Stack

- **Frontend** — Vanilla JavaScript, HTML5
- **Styling** — Tailwind CSS via CDN
- **KI** — Anthropic Claude API (`claude-sonnet-4-20250514`) direkt vom Browser
- **Datenspeicherung** — localStorage (kein Backend)
- **Deployment** — Vercel (Static)

## Deployment

Die App ist als statische HTML-Datei auf Vercel deployed:

```bash
vercel --prod
```

## Datenschutz

- Kein Backend, keine Datenbank
- Alle Gerätedaten verbleiben im Browser (localStorage)
- API-Schlüssel wird nur lokal gespeichert
- Fotos werden als Base64 in localStorage gespeichert
