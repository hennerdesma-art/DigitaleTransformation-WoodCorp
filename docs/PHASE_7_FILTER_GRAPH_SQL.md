# NXT Analytics – Filterfluss, Baumdiagramme und geprüfte SQL-Kennzahlen
Stand: 23. November 2026 · Phase 7

## Bedienung
1. Decision Tree öffnen und **Bearbeiten** aktivieren.
2. Oben in einem Knoten über das Filtersymbol einen lokalen Filter setzen.
3. Neuen Knoten **Donutdiagramm**, **Balkendiagramm**, **Liniendiagramm** oder **SQL-Kennzahl** aus der linken Palette hinzufügen (Klicken oder per Drag & Drop). Der Knoten kann frei verschoben werden.
4. Die Verbindung **vom Ausgangspunkt unten zum Eingang oben** ziehen. **Alle Pfeile übertragen Filter in Pfeilrichtung** – auch früher als „Referenz“ bezeichnete Verbindungen. Das ist ein bewusstes neues Verhalten.
5. Zahnrad am Knoten: Visualisierung und (bei Balken) Gruppierung wählen; bei SQL eine geprüfte Vorlage und ggf. den ausdrücklich bestätigten Kostensatz auswählen. Lokale Filter lassen sich dort auch löschen.
6. Im rechten Dashboard und in allen Baumknoten gelten exakt dieselben globalen + über gerichtete Vorgänger geerbten + eigenen Filter. Freie Annotationen brauchen keine KPI-Abfrage.
7. Workspace speichern. Darstellung und SQL-Konfiguration bleiben in der Graphdefinition und damit im Workspace erhalten.

## Semantik des Filterflusses
- Der gerichtete Graph ist eine DAG (gerichteter azyklischer Graph). Neue Verbindungen, die Zyklen erzeugen würden, werden abgewiesen.
- Ein Knoten mit mehreren eingehenden Kanten kombiniert **alle upstream-Bedingungen per UND**, niemals OR. Ein identischer Filter wird dedupliziert.
- Filter von parallelen Zweigen bleiben isoliert, solange keine Verbindung besteht.
- Widersprechen sich Bedingungen (z.B. Werk Essen + Werk Bonn), erscheint **keine passenden Aufträge** mit Filterkonflikt; Werte werden nicht stillschweigend überschrieben.
- Das Entfernen eines Filters oder einer gerichteten Kante berechnet alle betroffenen Nachfolger neu. Edge-Änderungen werden beim Speichern persistiert.
- Alte gespeicherte Referenzlinien gelten ab Phase 7 ebenfalls als Filterverbindungen. Zyklen in alten gespeicherten Graphen werden sichtbar als Fehler behandelt und müssen manuell aufgelöst werden.
- Typische Node-Queries verwenden denselben servervalidierten `nxt_validate_filters`-Vertrag und dieselbe Case-Tabelle wie das Detaildashboard. Der Browser wertet keine Rohdaten selbst aus.

## Verfügbare Baumdiagramme
- **KPI-Kachel:** Standardmäßig On-Time Rate und Fallzahl.
- **Donut:** On-Time Quote im ausgewählten Knoten-Filterkontext.
- **Balken:** Segmentvergleich der pünktlichen Lieferquote nach serverseitig zugelassenem Feld.
- **Linie:** On-Time Quote im Verlauf der vorhandenen Liefermonate.
- **SQL-Kennzahl:** geprüfte Vorlagen für verspätete Aufträge, unterlieferte Menge (kg), oder hypothetische Unterlieferungskosten (€).

## SQL und Kosten – wichtig
Es gibt **keinen freien SQL-Interpreter im Browser**. Das UI zeigt eine lesbare SQL-Vorlage und sendet ausschließlich:
`p_template`, validierte `p_filters` und optional `p_rate_eur_per_kg`
an die security-invoker Funktion `public.nxt_calculated_metric`. Die Funktion akzeptiert nur drei bekannte Template-IDs. Anonyme Ausführung ist verboten.

### Rechenregeln
- **Verspätete Fälle:** `delivered_date > promised_date`, nur Fälle mit belegten Datumswerten im Nenner; Abfragen sind case-basiert.
- **Unterlieferte Menge (kg):** Summe `GREATEST(ordered_quantity-delivered_quantity, 0)`, nur Zeilen mit `delivered_quantity_unit='kg'` und beiden Mengenwerten. Fälle mit `m` oder fehlenden Mengen werden ausgeschlossen und in Metadaten gezählt.
- **Geschätzte Unterlieferungskosten:** oben ermittelte kg × **explizit durch Benutzer eingegebener** Kostensatz in €/kg (positiv und höchstens 10.000). Ergebnis ist eine **Schätzung**, nicht belegter finanzieller Verlust. Es gibt absichtlich keinen Standardpreis.

Die WoodCorp-Tabelle enthielt bei der Schema-Prüfung 19.951 Fälle mit Einheit `kg` und 2 mit `m`. Eine verifizierte Datenbank-Kontrollabfrage für Bonn ergab auf beiden Wegen 65.790 kg Unterlieferung. Diese Beobachtungen sind Prüfwerte und keine festkodierten KPI-Werte.

## QA
- Unit-Tests: direkte und mehrstufige Filtervererbung, Mehrfacheltern, Zweigtrennung, Zyklen, widersprüchliche Filter, Konfigurationspersistenz, SQL-Whitelist und Kostensatzpflicht.
- GitHub Actions: `npm ci`, `npm run test`, `npm run build`, Assets und TypeScript.
- Isolierter Chromium-Test über gebaute Website mit simulierten Auth-/RPC-Antworten: Login, Chart hinzufügen, Chart-Konfiguration und SQL-Kennzahl ohne JavaScript-Fehler.
- Der echte Multi-User Browser-Test mit Live-Logins ist ergänzend notwendig. Einige Stamm-Workspaces können alte Referenzverbindungen besitzen; ihre neue Filterwirkung ist eine bewusste funktionale Änderung.

## Betroffene Dateien
`src/core/filters.ts`, `src/core/graph.ts`, `src/core/types.ts`, `src/core/calculations.ts`,
`src/lib/supabase.ts`, `src/components/GraphCanvas.tsx`,
`src/components/GraphNodeVisual.tsx`, `src/components/NodeSettings.tsx`,
`src/App.tsx`, `src/styles/v5.css`,
`sql/nxt_analytics_v5_calculated_metrics.sql`,
und ergänzte Tests.
