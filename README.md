# NXT | Digital Transformation · Analytics

Interaktive, geschützte Web-App für WoodCorp Order-to-Cash / Reutlingen University NXT.
Designvorgaben: NXT-Türkis `#008B92`, Interaktion nach **NXT | Digital Transformation** und UI UX Pro Max.

## Live-Architektur (Stand 23.11.2026)

- Statische NXT Web-App auf GitHub Pages (HTML/CSS/JavaScript, responsive).
- Supabase Auth (E-Mail/Passwort, Session, Wiederherstellung) und `woodcorp_access` (Rollen `viewer`, `analyst`, `admin`).
- Supabase-Projekt: Woodcorp Process Intelligence (`maqyirapxoygcsljdqyk`); Daten über RLS geschützte Tabellen.
- Admin-Edge-Funktion `nxt-members` (erste Einrichtung, Mitglieder anzeigen, einmalige Einladungslinks, Rollen ändern, Rechte entziehen).
- Analyse-RPCs `nxt_case_metrics`, `nxt_breakdown`, `nxt_monthly`, `nxt_dimensions` (sichere, erlaubte Filter, aggregiert auf Auftragsebene).
- Hauptansichten: Übersicht, Analysebaum, Dashboards, Datenbasis, Team (nur Admin), Profil.
- Der Baum unterstützt Knotenauswahl, Knoten-Filter, globale Filter, Drilldown von Werk zu Produkttyp, Verschieben, Zoom und Verlauf.
- Case/Event-Verknüpfung: `case_key`; 19.953 Aufträge, 210.135 Aktivitäten (Bestandsaufnahme zum 23.11.2026).
- Die Beispielabbildungen dienen **nur als Designreferenz**; echte KPIs stammen aus Supabase.

## Erste Einrichtung und Login

1. GitHub Pages für `main` in **Settings > Pages > Build and deployment > Source: GitHub Actions** aktivieren, sofern noch nicht aktiv.
2. Zieladresse: `https://hennerdesma-art.github.io/DigitaleTransformation-WoodCorp/`.
3. Für die einmalige Admin-Einrichtung die URL mit `?setup=1` öffnen. E-Mail ist vorgegeben; das Initialpasswort und den **separat bereitgestellten** einmaligen Einrichtungscode manuell eingeben.
4. Der Code ist nur einmal und zeitlich begrenzt gültig. Er steht **nicht** im Repository. Supabase Auth speichert den Passwort-Hash. Der Client enthält niemals einen Secret-/Service-Role-Key.
5. Danach über das normale Login einloggen. Unter **Team & Zugänge** E-Mail + Rolle wählen, Einladungslink erzeugen, an Zielperson senden. Sie öffnet den Link und legt ihr Passwort fest.
6. Unter **Authentication > URL Configuration** im Supabase Dashboard die GitHub-Pages-URL als Site URL / erlaubten Redirect konfigurieren; ggf. den genauen Pfad mit `?invite=1` und `?recovery=1` erlauben.
7. Optional SMTP für zuverlässige Auth-Benachrichtigungen einrichten. Das aktuelle Einladungsmodul generiert bewusst **kopierbare Links**, sendet nicht automatisch E-Mails.

> Wichtig: Direktes ungeschütztes Self-Signup ist nicht vorgesehen; nur Mitglieder mit Eintrag in `woodcorp_access` können auf Analyse-Daten zugreifen. Für öffentliches Hosting gelten RLS und serverseitige Admin-Prüfung, nicht nur sichtbare Menüs.

## Projektstruktur

```text
index.html                App-Einstieg
css/styles.css            NXT Design- und Komponentenregeln
js/config.js              öffentliche Supabase-Konfiguration
js/filters.js             globale und lokale Filtervererbung
js/app.js                 Auth, Navigation, Baum, Dashboards, Team
assets/favicon.svg        NXT-inspiriertes Favicon
.github/workflows/pages.yml   GitHub Pages Deployment
```

Das **Original-Logo** wird derzeit von der bestehenden öffentlichen NXT-Netzwerkforschungs-Asset-Datei referenziert und nicht grafisch verändert.

## Daten-/Qualitätskonventionen

- On-Time Delivery: `delivered_date <= promised_date`; Vergleich mit `order_date_met` ergab bei 9.618 Aufträgen Abweichungen. Vor geschäftlicher Interpretation der Kennzahl Definition klären.
- Mengen-Konformität: `order_tolerance_met = 1`, Nenner nur Datensätze mit vorhandenem Flag.
- Nicht ohne spezifische Freigabe Änderungen an Tabellen `woodcorp_cases`/`woodcorp_activities` durchführen.
- Keine Kennzahlen aus dem Design-Mockup als echte Daten verwenden.
- Keine Secret-Keys, Passwörter oder Einladungslinks in Commits, URLs von geteilten Analytics-Ansichten oder Logs speichern.
- Für erweiterte Filter je Dimension nur erlaubte Feldnamen/Werte und gleiche Filterbasis im Baum sowie im Dashboard.
- Anpassungen zuerst in der tatsächlichen App testen (Maus, Touch, Tastatur, reduzierte Bewegung, schmale Bildschirme).
- Bei späterer Umstellung auf eigenständiges Hosting die erlaubten Origins der Edge-Funktion entsprechend kontrolliert aktualisieren.

## Entwicklungsstand

Die App wurde als grundsätzliche Architektur mit realen RPCs implementiert. Syntax und Backend-SQL-RPCs wurden überprüft. Ein vollständiger Browser-E2E-Test inklusive GitHub-Pages-Hosting und erster Admin-Registrierung steht aus, bis GitHub Pages erreichbar ist und der Einrichtungscode über den Browser einmalig eingelöst wurde.
