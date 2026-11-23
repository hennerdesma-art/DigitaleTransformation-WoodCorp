# NXT Analytics – Fachliche KPI-Grundlage, Filter und Berechnungslogik
Stand 23.11.2026 · Iteration 1

## Ziel
Die früher erarbeiteten Celonis-Dashboards E00, E01, E02 und A01 sollen später als zusammenhängende Analysestrecke **in einem NXT-Workspace** realisiert werden. Diese Phase liefert die stabile Daten-, Filter- und Rechenbasis, nicht die fertigen Nachbau-Dashboards.

## KPI-Vertrag v1
Alle Kennzahlen verwenden den **Case-Key** und pro Auftrag genau eine Zeile aus `woodcorp_cases`. Ereignisbezogene Filter werden vorab fallbezogen aus `woodcorp_activities` abgeleitet, statt Fälle beim JOIN zu vervielfachen.

- OTIF = pünktlich (delivered_date <= promised_date) UND order_tolerance_met=1; durch auswertbare Fälle mit beiden Daten und bekanntem Mengenflag.
- OTD = zeitgerechte Lieferungen / Aufträge mit beiden Lieferdaten.
- Mengenkonformität = Aufträge mit order_tolerance_met=1 / Aufträge mit bekanntem Flag.
- Vier OTIF-Klassen: on_time_in_full, on_time_not_full, late_in_full, late_not_full; unbekannte Datensätze explizit gesondert.
- Berechnete Vertragsstrafen: **0,75 €/kg** × verspätet gelieferte Masse in kg **plus** 0,75 €/kg × positive Unterlieferungsmenge in kg. Die Modellrechnung ist mathematisch reproduzierbar; sie ist **kein Nachweis real fakturierter oder bezahlter Kosten**. Nicht-kg-Fälle / fehlende Mengen ausgeschlossen und als Coverage ausgewiesen.
- Serverquelle: `nxt_kpi_summary` für KPI und Header, `nxt_case_metrics` und `nxt_ribbon_kpis` als kompatible Hüllen; `nxt_calculated_metric` für freigegebene Berechnungs-Templates; `nxt_breakdown` für Segmentierung.

## Filter
- Kategorien: `eq`, `in` (1–20 Werte).
- Datumsfelder `delivered_date`, `promised_date`: `between`, `gte`, `lte`, `eq`.
- Numerische Felder: `between`, `gte`, `lte`, `eq`, u.a. `order_value`, `ordered_quantity`, `delivered_quantity`, `quantity_change_count`, `delivery_date_change_count`, `production_start_change_count`, `price_change_count`, `anomalous_event_count`.
- Klassifikation `otif_status` in vier valide Zustände plus unknown.
- Alle erlaubten Felder und Operatoren **zweiseitig** (Client und Server) validiert. Kein dynamisches SQL aus Nutzer-Eingaben.
- Globale Filter gelten für alle Knoten, lokale und geerbte Filter werden über tatsächlich gerichtete Graph-Kanten mit UND kombiniert. Bei unvereinbaren Bedingungen zeigt der Knoten einen Filterkonflikt.
- Filtertrace dokumentiert Scope, Quellknoten, gewählte Operation und Wert. Die neue Liste ermöglicht Ursachenprüfung und QA.

## Decision Tree
- Neuer leerer Workspace startet mit **einem frei konfigurierbaren OTIF-Ursprung**, statt sechs fest verdrahteten Werkskacheln.
- In der Palette kann `Neuer Ausgangsknoten` mehrfach eingefügt, frei bewegt, benannt, mit eigenen KPIs versehen und mit anderen Knoten verbunden werden.
- Auch der bisherige Systemknoten lässt sich im Bearbeitungsmodus entfernen.
- **Kompatibilität:** Bereits gespeicherte Workspaces mit `metricId:'otd'` behalten die OTD-Kennzahl; der alte feste Werksbaum wird beim Laden nicht automatisch ersetzt. Nur neue Entwürfe erhalten die neue Basis.
- Knotenbezogene Dashboards bleiben weiterhin in demselben Workspace gespeichert.

## Neuer Tab: Berechnungslogik
- Im ausgewählten Dashboard unter **Berechnungslogik** und als Info-Symbol direkt auf Knoten, KPI-Headern und den Dashboard-Widgets.
- Zeigt: Titel, KPI-Wert, Formel, Datenquelle/Grain, Zähler und Nenner, Ausschlüsse, aktuelle globale und geerbte Filter inklusive Herkunft und SQL-Logik in lesbarer Form.
- Bei SQL-Knoten: exakt ausgewählte validierte Vorlage, berechneter Wert, bewertbare/ausgeschlossene Fälle, gegebenenfalls der bestätigte Kostensatz, Kennzeichnung Modell/Schätzung.
- Reiner Informationszugriff: kein Ausführen frei eingegebenen SQL-Codes.

## Datenbankinstallation
`sql/nxt_kpi_phase1.sql` sowie `sql/nxt_kpi_phase1_breakdown.sql` wurden auf Projekt `maqyirapxoygcsljdqyk` ausgeführt. Private WoodCorp-Daten und andere Projekte nicht geändert. Die neue `nxt_case_process_features` ist nur über RLS und Auth zugänglich. `anon` darf `nxt_kpi_summary` nicht ausführen.

## Datenprüfungen
- 19.953 Aufträge, 6.027 OTIF, 12.862 On-Time, 9.847 mengenkonform.
- OTIF 30,2 %, OTD 64,5 %, Menge 49,4 %.
- €13.110.582,75 modellierte Gesamtvertragsstrafe bei 0,75 €/kg.
- 1.757 Aufträge mit >= 3 Mengenänderungen.
- 11.511 Lieferungen mit tatsächlichem Lieferdatum im Jahr 2018.
- 7.091 verspätete Fälle in zwei validierten OTIF-Fehlerklassen.
- 19.953 Zeilen fallbezogener Event-Zusammenfassung (kein Auftrags-Fanout).

## Testing / bekannte Grenzen
- GitHub CI: npm ci, Unit-Tests, TypeScript und Vite-Build.
- Supabase: SQL-Kontrollabfragen mit authentifizierter Rolle, RLS-/Anon-Test und Security Advisor.
- Die lokale Headless-Browser-Navigation ist in dieser Laufzeit vom Administrator gesperrt (ERR_BLOCKED_BY_ADMINISTRATOR). Ein echter UI-End-to-End-Test mit Projektkonto und mehreren Größen muss nach dem Deployment manuell erfolgen; nicht als bestanden ausweisen.
- Der Supabase Security Advisor meldet einen bestehenden Warnhinweis für deaktivierte Leaked Password Protection; diesen nicht durch Dashboard-Änderungen kaschieren.
