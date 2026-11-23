# NXT Analytics v2 – Umsetzung Phase 1 bis 3

**Branch:** `feat/nxt-analytics-interactive-v2` – bestehendes `main`/GitHub Pages bleibt unverändert.

## Technischer Stack
- Vite, React 19, TypeScript
- @xyflow/react v12 für den frei beweglichen Decision Tree
- @dnd-kit/core für die Komponentenpalette
- Lucide Static, beim Build automatisch als **lokale SVG-Dateien** exportiert
- Bestehende Supabase Auth / RLS / RPCs (`nxt_ribbon_kpis`, `nxt_case_metrics`, `nxt_breakdown`, `nxt_monthly`, `nxt_dimensions`)

## Aktuelle Funktionen
- NXT-Header, weiße Navigation, fünf echte KPI-Karten, globale Filterleiste, Builder-Palette, graphischer Canvas, Knoten-Detaildashboard
- Login, Passwortwechsel und bestehende Admin-Einladungen
- Frei positionierbare Knoten im Bearbeitungsmodus, Pan, Zoom, Fullscreen, Minimap und Referenzverbindungen
- Analytische Aufgliederung über validierte Dimension und daraus erzeugte Eltern-Kind-Verbindungen
- Filtervererbung entlang des Elternpfads, Trennung von visueller Referenz und analytischer Filterkante
- Live-Abfragen auf den vorhandenen Case-Daten und Echtzeit-Aktualisierung der Detailcharts
- Lokale Layout-Entwürfe mit explizitem Speicherhinweis; keine angebliche serverseitige Speicherung

## Nachfolgende Phasen (noch nicht vollständig umgesetzt)
- Phase 4: Per-Knoten-Dashboard-Widget-Builder inkl. konfigurierbarer Diagramme und Grid-Layouts
- Phase 5: Datenbank-Persistenz von Workspaces, RBAC und Filterkatalog, Versionen und Multiuser
- Phase 6: Visueller Pixelvergleich 1672×941, Browser-E2E, Accessibility und Performance-Tests

## Für Entwicklung
`npm ci && npm run check && npm run dev`

CI auf dem Feature-Branch führt automatisiert `npm test`, TypeScript-Build und Icon-Asset-Prüfung durch. Der produktive Pages-Workflow läuft nur für den `main`-Branch.

**Datenqualität:** Der historische `order_date_met`-Flag weicht bei 9.618 Fällen von `delivered_date <= promised_date` ab. Die On-Time-Kennzahl verwendet die überprüfbare Datumslogik, Mockupzahlen sind keine Echtwerte.

**Sicherheitsregeln:** Nur Supabase Publishable Key im Client, niemals Service Role oder Passwörter. Die Daten-RPCs verwenden Security Invoker und werden via Auth/RLS geschützt. Vor einem Merge muss die Anmeldung und Berechtigungslogik im echten Browser getestet werden.