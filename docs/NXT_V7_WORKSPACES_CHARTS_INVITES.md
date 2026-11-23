# NXT Analytics v7 – Ladezuverlässigkeit, leere Workspaces, Diagramme und Teamzugänge
Stand: 23. November 2026

## 1. Neuen Workspace anlegen
Unter **Workspaces → Neuer Workspace** oder über die Workspace-Auswahl **Neu**.
Erstellt und speichert **genau einen neutralen Ausgangsknoten**:
- Anzeigename „Ausgangsknoten“, noch keine KPI, noch keine Unterpunkte, keine Kanten
- keine übernommenen Filter oder Dashboard-Konfigurationen des vorherigen Workspaces
- private Sichtbarkeit als Ausgangszustand, durch RLS geschützter Eigentümer
- erst danach kann der Nutzer den Ausgangsknoten benennen, die Kennzahl auswählen oder Knoten/Diagramme per Drag & Drop hinzufügen
- bestehende gespeicherte Workspaces bleiben unverändert

## 2. KPI-Ladefehler und Timeoutbehandlung
### Diagnose
Die bisherige App verschickte die gleiche Case-Aggregation mehrfach (für globale Karte, Ribbon, Detail, sowie jede Knotenkarte).
Bei mehreren verknüpften Knoten kam es zu einer großen Anzahl gleichzeitiger Abfragen.
Zusätzlich führte die Datenbank bislang bei jeder Zeile eines einfachen Fallfilters einen Join zur Event-Merkmaltabelle aus.

### Korrektur
- `nxt_case_matches`: für leere Filter direkter Rückgabewert; fallbezogene Event-Merkmale nur bei entsprechender Filterart nachschlagen; anonyme Ausführung weiter gesperrt
- Indizes auf Lieferterminen ergänzt, Statistiken aktualisiert
- Abfragen clientseitig zusammengeführt (inflight- und TTL-Cache), maximal drei gleichzeitige RPCs pro Browser und zwei parallele Graph-Knotenberechnungen
- Ribbon und Hauptkennzahlen verwenden **denselben** `nxt_case_metrics`-Vertrag
- Cache wird bei Sitzungswechsel invalidiert; noch laufende Antworten können keine alten Nutzerwerte zurück in den Cache legen
- React initialisiert den Canvas unabhängig vom Erfolg von KPI-/Trendabfragen
- KPI, Trend und Detailsegmente werden getrennt ausgewertet (`Promise.allSettled`): Ein fehlerhaftes Diagramm löscht nicht die übrigen gültigen KPIs
- Fehler werden einzeln sichtbar; Benutzer kann **Aktualisieren** wählen

SQL-Reproduzierbarkeit nach Optimierung:
`EXPLAIN ANALYZE SELECT public.nxt_kpi_summary('[]'::jsonb)` zeigte ~108 ms auf dem verbundenen Datenbankprojekt.
OTIF-Fälle 6.027, Essen-Fälle 9.093, Aufträge mit ≥3 Mengenänderungen 1.757: unverändert.
Dieser Messwert ist keine garantierte Browser-End-to-End-Ladezeit.

## 3. Workspace löschen
- In jeder berechtigten Workspace-Kachel gibt es jetzt **Löschen**.
- Nur Eigentümer mit Analyst-/Adminrolle oder Administrator.
- Vor dem endgültigen Entfernen muss der vollständige Workspace-Name exakt eingegeben werden.
- `DELETE` prüft ID und erwartete Revision, nutzt bestehende Supabase-RLS und muss per `RETURNING id` die Löschung bestätigen. Eine nicht autorisierte 0-Zeilen-Operation gilt als **Fehler**.
- Nach Entfernen eines aktiven Workspace zurück zu einem leeren lokalen Baum.
- Es werden keine Case-/Event-Rohdaten, Projektmitglieder oder andere Workspaces gelöscht.
- SQL-Transaktions-QA mit Admin-Rolle durchgeführt; Test-Workspace wurde nur innerhalb einer zurückgerollten Transaktion angelegt.

## 4. Diagramme
Die Bibliothek bietet **18 Widgettypen**, davon zwölf neue fachlich passende Celonis-orientierte Visualisierungen:
1. KPI
2. Zeitreihe
3. Balkendiagramm
4. Datentabelle
5. Donutdiagramm
6. Text/Forschungsfrage
7. Horizontales Ranking
8. Vertikale Säulen
9. Gestapelte OTIF-Fehlerklassen
10. 100%-gestapelte OTIF-Klassen
11. Heatmap (zwei Dimensionen)
12. Pareto-Kostenanalyse
13. Streudiagramm (Volumen × OTIF × modellierte Kosten)
14. Wasserfall (Verspätung + Unterlieferung)
15. Bullet/KPI-Zielvergleich
16. Häufigkeitsverteilung (Mengenänderungen oder Verzögerungsfenster)
17. Treemap-Proportionsdarstellung
18. OTIF-Funnel

Die fachlich passenden Varianten stehen auch als frei verschiebbare **Graph-Canvas-Knoten** zur Verfügung.
Die neuen Daten-RPCs `nxt_chart_segments`, `nxt_chart_heatmap` und `nxt_chart_distribution` sind nach Feld und Filter allowlisted und nutzen die Case-Ebene, keine vervielfachenden Event-Join-Aggregationen.
Jedes Diagramm erhält denselben Filterkontext und stellt eine numerische Datentabelle für Kontrolle/Barrierefreiheit bereit.
Die Farben entsprechen der bestehenden NXT-Designsprache.

Wichtig: Modellierte Vertragsstrafen mit 0,75 €/kg sind **keine nachgewiesenen bezahlten Kosten**. Streudiagramme belegen keine kausalen Zusammenhänge. Der OTIF-Funnel zeigt Fallteilmengen, keine bestätigte Prozesskonversion.

## 5. Einladungen mit NXT-Webseitenlink
Vorbild: **nxt-netzwerkforschung-survey** mit Supabase `generateLink({type:'invite'})` und Einmal-Token als Fragment der eigenen GitHub-Pages-Adresse.

Die Version 4 von `nxt-members` wurde aus dem vollständigen bisherigen Funktionsstand abgeleitet. Der vorhandene Admin-Guard für `woodcorp_access.role='admin'`, Rollenverwaltung und bestehende Bootstraplogik bleiben erhalten.
Neue Einladungen:
1. Administrator wählt E-Mail und Rolle in **Team & Zugänge**.
2. Edge-Funktion prüft JWT, Adminrolle, E-Mail/Role und kurzen Wiederholungsabstand.
3. Bei neuem Supabase-Auth-Nutzer erzeugt `generateLink` ein einmaliges `hashed_token`, anschließend wird die Rolle in `woodcorp_access` hinterlegt.
4. UI zeigt einen **NXT-Webseitenlink** im Muster:
   `https://hennerdesma-art.github.io/DigitaleTransformation-WoodCorp/#nxt_invite=<one-time-token>&type=invite`.
5. Der Token ist im URL-Fragment, wird vor der API-Verifikation aus der Browseradresse entfernt und mit `auth.verifyOtp({token_hash,type:'invite'})` validiert.
6. Anschließend setzt die eingeladene Person auf der NXT-Loginmaske ihr Passwort.
7. Bestehende Auth-Nutzer ohne NXT-Zugriff werden zugeordnet und melden sich über ihren bestehenden Zugang an; Mitglieder mit existierendem Zugriff erhalten keine Dublette.
8. Admin kopiert den Link und versendet ihn vertraulich (kein angeblicher automatischer E-Mail-Versand ohne SMTP).

**Sicherheitsgrenzen:** Keine Service-Role-Keys im Browser, keine öffentliche Gruppenregistrierung, keine beliebige Supabase-SQL-Ausführung, JWT + Admin-Check in der Edge Function. Der Token ist einmalig und hat die konfigurierte Supabase-OTP-Gültigkeit.

## Technische Änderungen
- `src/core/graph.ts`
- `src/App.tsx`
- `src/lib/supabase.ts`, `src/lib/workspaces.ts`, `src/lib/invite.ts`
- `src/components/WorkspaceOverview.tsx`, `AuthScreen.tsx`, `TeamPanel` in App
- `src/core/dashboard.ts`, `src/components/DashboardBuilder.tsx`, `AdvancedCharts.tsx`, `GraphCanvas.tsx`, `GraphNodeVisual.tsx`, `NodeSettings.tsx`
- `src/core/v7.test.ts`, `src/core/invite.test.ts`, `src/styles/v7.css`
- `sql/nxt_v7_optimize_filters.sql`, `sql/nxt_v7_chart_data.sql`
- `supabase/functions/nxt-members/index.ts`

## Verifikation / Grenzen
- GitHub Actions: `npm ci`, alle Tests, TypeScript, Vite-Build, lokale SVG-Assets.
- Datenbankabfragen zu Segment, Heatmap und Ereignisverteilung erfolgreich; `anon` darf neue RPCs nicht ausführen.
- Geschütztes Workspace-Löschen erfolgreich in SQL-Transaktion geprüft und zurückgerollt.
- Edge-Funktion v4 produktiv deployed, Quelltextvergleich GitHub/Supabase stimmt überein; Funktionsquelle enthält Admin-Guard.
- **Noch offener Praxistest:** Ein wirklicher Einladungsempfänger muss den Link einmalig öffnen und das Passwort setzen; dieser Schritt wurde nicht mit einer echten fremden Identität durchgeführt.
- **Noch offener visueller E2E-Test:** Vollständiger Browsertest mit Supabase-Nutzer und komplexen Workspaces. SQL- und CI-Tests ersetzen dies nicht.
- Bestehender Supabase-Sicherheitshinweis „Leaked Password Protection Disabled“ sollte separat in der Auth-Konfiguration behoben werden.
