# NXT Analytics – Workspaces, Datenlisten und Filterverwaltung
Version 4 · November 2026

## Bedienung
- **Workspaces** in der linken Navigation: Suchbare Übersicht mit den Bereichen *Alle sichtbaren*, *Meine*, *Mit mir geteilt* und *Andere private* (nur Admin). Ein Klick auf **Öffnen** lädt den Workspace samt Graph, Dashboards und KPI-Titeln. Ein eigener neuer Workspace startet privat. Unterstruktur/Baum-Hierarchie ist bewusst noch nicht umgesetzt.
- **Datenquellen**: Reiter für `woodcorp_cases` und `woodcorp_activities`. Serverseitiges Paging à 40 Zeilen, Case-Key-Suche, Sortieren per Spaltenkopf, zugelassene Spaltenfilter, Spaltenauswahl, Detailansicht und CSV-Export der *aktuellen Seite*. Rohdaten bleiben unverändert. Datenzugriff erfolgt über bestehende RLS.
- **Filterbibliothek**: Administrator kann vier tatsächlich geprüfte neue kategoriale Datenfelder hinzufügen (Kundenmarkt, Mengeneinheit, Adresscode, Mengentoleranz erfüllt) und Filterbezeichnungen ändern. Der Server prüft Mitgliedschaft, Adminrolle, Spalten-Whitelist und unterscheidbare Werte. Bestehende Freigaben können aktiviert/deaktiviert werden; SQL-Freifelder sind verboten.
- **KPI-Namen**: `KPI-Titel` in der Analyse-Kopfleiste ändert die sichtbaren Namen der KPI-Karten innerhalb des aktuellen Workspaces. `Knotenname` und das Stift-/Typ-Symbol im Detailpanel benennen einen ausgewählten Knoten um. Im **Dashboard Builder** lautet der Widget-Editor **Eigenschaften → Überschrift**. In der Filterbibliothek ist **Umbenennen** für erlaubte Dimensionen (Admin) verfügbar. Alle vier Funktionen ändern ausschließlich Text, niemals KPI-Formeln oder Quellen.
- **Dashboard-Fullscreen**: Oberer Button **Dashboard öffnen** oder das Maximieren-Symbol am Detailpanel. **Vollbild schließen** und **Escape** beenden die Ansicht. Nach dem Schließen kann das Dashboard erneut geöffnet werden. Das kleine Detailpanel hat separat **Detaildashboard einblenden**.

## Datenschutz und Freigaben
Eigene private Workspaces sind vom Eigentümer und Admins sichtbar. Andere normale Mitglieder sehen nur die für das Team veröffentlichten Workspaces, nicht fremde private Inhalte. Administratoren sehen auch private Team-Workspaces und können diese gemäß bestehender Rechte öffnen. Keine Änderung der RLS an `nxt_workspaces`.

## Geprüfte Datenquellen
- `woodcorp_cases` / Case-Grain, `case_key` eindeutig
- `woodcorp_activities` / Event-Grain, `event_id` eindeutig
- `case_key` verbindet die Quellen; kein Join wird für den Tabellenbrowser benötigt

## Backend
`sql/nxt_analytics_v4_filter_candidates.sql` erweitert ausschließlich bestehende validierte RPCs und den konfigurierbaren Katalog. `nxt_register_filter` ist als `SECURITY INVOKER` mit Adminprüfung implementiert. Anonyme Zugriffe auf Filterkandidaten und Registrierung sind entzogen. Keine Änderungen an `woodcorp_cases` oder `woodcorp_activities` vorgenommen.

## Qualitätsprüfung
- Automatisierte Tests für vererbte Filter, Graph und KPI-Metadaten; GitHub Actions `npm ci` + `npm run test` + `npm run build`.
- Isolierter Chromium-Test mit simulierten API-Antworten: Dashboard-Fullscreen und Wiederöffnung; Umbenennen von KPI und Knoten; Öffnen beider Datenlisten; Filter hinzufügen; Workspace speichern, im Verzeichnis finden und öffnen – ohne JavaScript-Laufzeitfehler.
- Direkter Datenbanktest (mit Transaktions-Rollback): Admin kann eine Whitelist-Dimension registrieren; unveränderte Rohdaten; kein persistierter QA-Datensatz.
- Echter E2E-Test mit mehreren realen Accounts und Mobilgeräten bleibt separat nach der Veröffentlichung zu prüfen.

### Folgende Dinge sind ausdrücklich nicht umgesetzt
- Hierarchische Beziehungen zwischen Workspaces / Workspace-Decision-Tree (späterer Schritt).
- Freie SQL-Filter, frei definierte numerische Bedingungsoperatoren oder beliebige neue Spalten.
- Öffentliche Einsicht in private Workspaces anderer normaler Mitglieder.
