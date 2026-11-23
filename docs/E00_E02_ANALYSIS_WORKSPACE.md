# NXT | WoodCorp E00–E02 – E02 SQL und zusammenhängender Analyse-Workspace
Stand 23.11.2026, Phase E00–E02

## Anwendungsziel
Ein einzelner, **editierbarer** privater Workspace für die Schritte
**E00 Executive Overview → E01 Performance Breakdown → E02 Process Intervals**.
Alle Angaben (auch Kosten) werden im jeweiligen vererbten Filterkontext berechnet.
Der allgemeine Menüpunkt „Neuer Workspace“ bleibt weiterhin ein leerer Ausgangsknoten.
Die Vorlage `presets/woodcorp-e00-e02-workspace.json` wird als separate Instanz
des NXT-Workspace-Dokuments v3 unter dem Eigentümerkonto gespeichert.

## Analysebaum
Insgesamt 25 Knoten mit 31 gerichteten Kanten und 25 knotenspezifischen Dashboards:

- Root: **WoodCorp · OTIF Root Cause**
- **E00**: Executive Overview → E00.1 Lieferqualität (OTIF/OTD/In Full);
  E00.2 Fehlerklassen (4 OTIF-Klassen); E00.3 Financial Impact
  (0,75 €/kg modellierte Vertragsstrafen; keine bezahlten Ist-Kosten).
  Die drei parallelen Beweiszweige führen wieder zur E01-Übersicht zusammen.
- **E01**: Performance Breakdown → Werk, Produkttyp, Lieferunternehmen,
  Kundenmarkt; Werk×Produkttyp-Matrix, Fokus Essen×Crates und Aachen×Crates.
  *Essen* trägt den Filter `factory=Essen`, *Aachen* `factory=Aachen`,
  *Crates* `product_type=Crates`. Nur der jeweilige Fokuspunkt erhält
  beide eingehenden Kanten (UND), niemals Essen UND Aachen.
- **E02**: Gesamtprozess ohne lokale Fokusfilter sowie getrennte Prozessanalysen
  für Essen×Crates und Aachen×Crates. Der Fokus Essen×Crates zeigt fünf
  einzeln auswählbare Intervallknoten. Ein Datenqualitätsknoten ergänzt den
  Gesamtüberblick.

Die parallel geöffneten E02-Dashboards verwenden **dieselbe Vorlage**, aber
**getrennte geerbte Filter**. Eine Zusammenführung zweier unterschiedlicher
Werksfilter würde eine leere Schnittmenge erzeugen; sie wird daher nicht als
Vergleichsmethode verwendet.

## SQL: E02 Case-Grain
`sql/nxt_e02_intervals_v1.sql`
- `public.nxt_e02_case_intervals`: je `case_key` genau **eine** voraggregierte
  Zeile mit den relevanten Event-Zeitpunkten und den fünf Zeitdifferenzen.
- `nxt_e02_interval_summary(p_filters jsonb)`:
  Fallzahl, gültige Fälle, fehlende / negative / markierte Anomaliefälle,
  Abdeckung, Median, P90, Mittelwert, OTIF-/Nicht-OTIF-Median und jeweilige Fallzahlen.
- `nxt_e02_interval_distribution(p_interval text,p_filters jsonb)`:
  relative Zeitklassen, OTIF-/Nicht-OTIF-Anteile, explizite Negativ-/Fehlwerte.
- Keine unkontrollierte SQL-Ausführung; Intervall-IDs und Filter werden serverseitig
  validiert; `SECURITY INVOKER`, `authenticated`-Grants und Mitglieds-RLS.
- Lieferereignis **Goods delivered** wird **nicht** für tatsächliche Lieferzeit
  verwendet. Stattdessen `woodcorp_cases.delivered_date`.
- Zeitdifferenzen werden zunächst pro Fall berechnet. Negative und fehlende
  Werte werden bei Median/P90 ausgeschlossen, aber ausdrücklich ausgewiesen.
- Gespeicherte historische Berechnungsbasis; nach einem Austausch der beiden
  WoodCorp-Quellen muss das Seed-SQL **erneut ausgeführt** werden, um die
  abgeleiteten Intervalle zu synchronisieren.

### Live-Gegenprobe (unfiltrierte 19.953 Fälle)
| Intervall | Median Tage | P90 Tage | Gültige Fälle |
|---|---:|---:|---:|
| Auftrag → Produktionsstart | 31,40 | 68,58 | 10.393 |
| Produktionsstart → Produktionsende | 40,41 | 136,00 | 19.231 |
| Produktionsende → Verladung | 1,91 | 12,66 | 14.978 |
| Verladung → tatsächliche Lieferung | 3,45 | 6,56 | 17.207 |
| Auftrag → tatsächliche Lieferung | 44,52 | 89,57 | 19.950 |

Der gefilterte Vergleich **Essen × Crates** wurde serverseitig erfolgreich
nachgerechnet: 5.582 Aufträge, 5.580 valide Gesamtdurchlaufzeiten.
Die unfiltrierte Summary benötigte in einer authentifizierten
`EXPLAIN ANALYZE`-Abfrage ca. 808 ms (Messung, kein garantierter SLO).

## Dashboard und Chartbibliothek
Vier neue `DashboardWidget`-Typen:
- `e02_overview`: Median- und P90-Balken je Intervall
- `e02_compare`: OTIF vs. Nicht-OTIF (Fallzahl und Median)
- `e02_quality`: Datenabdeckung, ungültige und negative Zeitintervalle
- `e02_distribution`: ein frei auswählbares Intervall mit Histogramm,
  Einzelfallhäufigkeiten und vollständiger Datenquelle/Formel

Dazu kommt der frei platzierbare Graph-Knotentyp
`visualization:'process_interval'` mit `intervalKey`.
Median, P90, gültige Fälle und Abdeckung erscheinen direkt auf dem Baumknoten.
Die eigentliche Detailansicht zeigt zusätzlich Verteilung und Datenqualität.
Jeder Knoten kann umbenannt, verschoben, gefiltert, verbunden und nachträglich
im Dashboard Builder bearbeitet werden.

## UI-Fix: Aktionsicons abgeschnitten
`src/styles/v8.css`: Chart-Karten reservieren eine **interne Kopfzeile**
für Info, Filter, Einstellungen, Aufgliederung und Löschen. Die Buttons
positionieren sich nicht mehr über negative `top`-Werte außerhalb der
abgeschnittenen Diagrammkarte. Der Diagramminhalt scrollt bei Bedarf separat.
Fokusindikatoren, Tastaturbedienung und kleinere Ansichten bleiben berücksichtigt.

## Prüfungen / offene Punkte
- Supabase SQL: reale Vergleichswerte, leere und gefilterte Slices,
  19.953 Intervallzeilen, kein anonymer Zugriff.
- CI: automatische Tests für Preset-Validität, Kantenvererbung und 5 Intervalle,
  TypeScript, Vite und vollständige SVG-Assets.
- Der Workspace wird **privat** dem bestehenden NXT-Administratorkonto
  zugeordnet; keine Rohdaten verändert, kein anderer Workspace überschrieben.
- Ein visueller Browsertest an Desktop/iPad mit echten Benutzerrechten bleibt
  als zusätzlicher Praxistest sinnvoll.
