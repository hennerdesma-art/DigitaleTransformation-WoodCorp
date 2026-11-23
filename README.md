# NXT | Digital Transformation · Analytics

Geschützte, interaktive **NXT Analytics**-Web-App für WoodCorp Order-to-Cash an der Hochschule Reutlingen. Aktuelle Web-App: **React 19 + TypeScript + Vite + React Flow** im NXT-Design.

**Webseite:** https://hennerdesma-art.github.io/DigitaleTransformation-WoodCorp/

## Neuerungen: Workspace-Verzeichnis & Datenbrowser (v4)

- **Workspaces**: Übersicht eigener privater, freigegebener Team- und (für Admins) anderer privater Workspaces. Zugriff weiterhin RLS-geschützt.
- **Datenquellen**: Originaltabellen als durchsuchbare Listen mit Paging, Sortierung, Spaltenfilter und Seitenexport.
- **Filterbibliothek**: Administratoren können geprüfte kategoriale Felder hinzufügen, aktivieren und umbenennen.
- **KPI-/Knotennamen**: In der Analyse über **KPI-Titel** oder **Knotenname**, Widgets unter **Dashboard Builder → Eigenschaften → Überschrift**.
- **Dashboard-Fullscreen**: Über **Dashboard öffnen**, Schließen und späteres Wiederöffnen möglich.

Siehe [`docs/PHASE_6_NAV_DATA_FILTERS.md`](docs/PHASE_6_NAV_DATA_FILTERS.md) für Details, Grenzen und Sicherheit.

## Neu: Baumdiagramme, gerichtete Filter und SQL-Kennzahlen (Phase 7)

- Jeder Pfeil überträgt globale und lokale Filter in Pfeilrichtung; parallele Quellen werden per UND kombiniert. Filterkreise werden verhindert.
- Knoten können als Donut, Balken, Linie und SQL-Kennzahl direkt auf dem Graph-Canvas dargestellt und konfiguriert werden.
- SQL basiert auf drei **vordefinierten, serverseitig validierten** Berechnungsvorlagen, kein freies SQL. Euro-Schätzungen benötigen einen eigenständig angegebenen Kostensatz.
- Gespeicherte Referenzverbindungen gelten jetzt ebenfalls als Filterfluss.

Weitere Informationen: [PHASE_7_FILTER_GRAPH_SQL.md](docs/PHASE_7_FILTER_GRAPH_SQL.md).

## Fachliche KPI-Basis – OTIF, Filter und Berechnungslogik

Die neue Standardansicht startet bei **OTIF** statt bei einer hart verdrahteten Werk-Hierarchie. Über die Canvas-Palette lassen sich mehrere unabhängige **Ausgangsknoten** anlegen. Frühere, gespeicherte Workspaces bleiben unverändert ladbar.

Der KPI-Header bietet OTIF, On-Time Delivery, Mengenkonformität, die **berechnete Vertragsstrafe nach dem 0,75-€/kg-Modell** sowie Anzahl Aufträge. Diese Vertragsstrafe ist eine Datenmodellrechnung, **kein Nachweis gezahlter Rechnungsbeträge**.

Im Filterdialog stehen nun Mehrfachauswahl, Datumsbereiche, numerische Grenzen, OTIF-Fehlerklassen und fallbasierte Prozessänderungszahlen bereit. Der Tab **Berechnungslogik** erklärt Zähler, Nenner, Formel, Ausschlüsse, Datenquellen und den gesamten geerbten Filterpfad. Auch Info-Buttons an KPI-Karten und Widgets öffnen die Details.

Die geplanten Dashboards E00 / E01 / E02 / A01 können als Knoten-Dashboards innerhalb **eines einzigen Workspaces** ergänzt werden.

Technische und fachliche Details: [PHASE_1_OTIF_FILTERS_AND_EXPLAINABILITY.md](docs/PHASE_1_OTIF_FILTERS_AND_EXPLAINABILITY.md).

## Erste Schritte

- Mit einem bereits freigegebenen Supabase-Auth-Konto anmelden.
- Hauptansicht **KPI-Analyse** / **Decision Tree**: Knoten untersuchen, global oder lokal filtern, Zoom, Pan, Fullscreen, Verbindungen und Split-Dimensionen nutzen.
- In **Dashboard Builder**: Knoten auswählen, Widgets per Drag & Drop hinzufügen, Reihenfolge, Diagrammdimensionen, KPI-Definitionen, Text und Breite verändern.
- Unter **Workspace**: einen privaten Entwurf in Supabase speichern. Mit **Für Team freigeben** wird die aktuelle, gespeicherte Analyse für andere freigegebene Projektmitglieder sichtbar. Die Freigabe betrifft **nicht** die WoodCorp-Rohdaten.
- Unter **Filterbibliothek** kann ein Admin freigegebene Server-Dimensionen ein- und ausschalten.
- **Team & Zugänge** (Admin): Einladungen per E-Mail oder vertraulichem Link und Rollenverwaltung.

### Benutzerrechte

`viewer`: freigegebene Team-Workspaces ansehen, Analysefilter temporär nutzen.

`analyst`: eigene private Workspaces und konfigurierbare Dashboards erstellen/bearbeiten und veröffentlichen.

`admin`: zusätzlich Teamverwaltung, Filterkatalog und Verwaltung anderer Workspaces.

Rechte werden serverseitig über Supabase Row Level Security und die vorhandene `woodcorp_access`-Liste durchgesetzt. Die App enthält ausschließlich den öffentlichen Supabase-Publishable-Key, **niemals** Service-Role-Keys oder Passwörter.

## Technische Architektur

| Bereich | Umsetzung |
|---|---|
| Website | React 19, TypeScript, Vite |
| Decision Tree | `@xyflow/react`, strukturierte Knoten, analytische vs. rein visuelle Verbindungen |
| Drag & Drop | `@dnd-kit/core`, Widgetbibliothek / Sortierung |
| Design | NXT `#008B92`, `#707173`, originale Logo-Grafik, 71 lokal exportierte SVG-Icons |
| Backend | Supabase Auth, PostgreSQL RLS, validierte Analytics-RPCs |
| Kennzahlen | `nxt_case_metrics`, `nxt_ribbon_kpis`, `nxt_breakdown`, `nxt_monthly`, `nxt_dimensions` |
| Speichern | `nxt_workspaces`, optimistische Versionierung mit `nxt_save_workspace` |
| Filterkonfiguration | `nxt_filter_catalog`: sechs erlaubte Dimensionen, Admin-Freigaben |
| Veröffentlichung | GitHub Actions: `npm ci` → Tests → Build → GitHub Pages aus `dist/` |

**Supabase:** Projekt `maqyirapxoygcsljdqyk` (Woodcorp Process Intelligence, eu-central-1). Die separate NXT-Netzwerkforschungs-App ist nicht betroffen.

## Datenbasis und fachliche Definitionen

- `woodcorp_cases`: 19.953 Aufträge (Case-Grain; Schlüssel `case_key`).
- `woodcorp_activities`: 210.135 Ereignisse; 1:n-Verknüpfung über `case_key`.
- Zeitbereich: historische WoodCorp-Daten 2017–2019.
- On-Time Delivery: `delivered_date <= promised_date`, nur mit vollständigen Datumswerten im Nenner.
- Mengen-Konformität: `order_tolerance_met = 1`, nur Datensätze mit belegtem Flag im Nenner.
- Das ursprüngliche Feld `order_date_met` widerspricht bei 9.618 Aufträgen dem Datumvergleich. Die Abweichung ist **Datenqualität**, keine stillschweigend bestätigte neue Geschäftsdefinition.
- Keine Kennzahlen aus generierten Designbildern übernehmen. Segmentvergleiche allein sind keine Ursachenbeweise.
- Neue Filterfelder nur nach Prüfung der SQL-Allowlist, Grain und Rechte.

## Projektstruktur

```text
src/App.tsx                           Navigation, Auth, Analyseoberfläche und Workspace-Status
src/components/GraphCanvas.tsx        frei beweglicher Decision Tree
src/components/DashboardBuilder.tsx   Widgets, Diagramme, Builder
src/components/WorkspaceControls.tsx  Speichern, Auswahl, Team-Freigaben, Filterkatalog
src/core/dashboard.ts                 Widget-/Workspace-Verträge und Validierung
src/core/filters.ts                   globale / vererbte Knotenfilter
src/core/graph.ts                     Knoten, Verbindungen, gespeicherter Graph
src/lib/supabase.ts                   Auth / KPI-Abfragen
src/lib/workspaces.ts                 serverseitige Workspace-/Katalog-API
src/styles/                           NXT-Tokens, Website- und Builder-Styles
public/nxt-logo.png                   originales NXT-Logo
scripts/export-icons.mjs              erstellt lokale SVG-Icons
sql/nxt_analytics_v3_workspaces.sql   geprüfter SQL-Stand für Workspaces und Katalog
docs/PHASE_4_5.md                     Funktions- und Sicherheitsgrenzen
.github/workflows/pages.yml           GitHub-Pages-Deployment von Vite dist/
```

## Entwicklung

```bash
npm ci
npm run dev
npm run test
npm run build
```

GitHub Pages liegt auf dem Projektpfad `/DigitaleTransformation-WoodCorp/`, nicht auf dem Domain-Root.

## Status und Qualitätsgrenzen (23.11.2026)

- Dashboard-Builder, Graph, Filtervererbung, Workspace-Speicherung und Freigabe sind implementiert.
- Unit-Tests, TypeScript-Build und SVG-Export laufen in GitHub Actions.
- Zusätzlich wurde der gebaute Login, die Analyseoberfläche, der Builder und Speichern/Veröffentlichen in einem isolierten Chromium-Test mit **simulierten** API-Antworten ohne JavaScript-Fehler durchgespielt. Dieser Test verwendet keine realen Benutzerkonten.
- Supabase-RLS, Mitgliederanlage sowie Revisionskonflikte wurden direkt in Datenbanktransaktionen überprüft; QA-Datensätze wurden zurückgerollt.
- Ein vollständiger E2E-Durchlauf über echte Nutzerrollen, Auth-Einladungen, SMTP und alle Geräte muss weiterhin auf der Live-Website erfolgen.
- Für sichere Auth-E-Mails: erlaubte Redirect-URLs unter **Supabase Auth → URL Configuration** pflegen und SMTP konfigurieren.

**Wichtig:** `main` ist produktiv. Neue Funktionen zunächst in `feat/*` mit CI testen, danach per PR zusammenführen. WoodCorp-Rohdaten nicht durch UI-Arbeiten überschreiben.
