# NXT Analytics – Teamzugang, Einladungen und endgültiges Löschen
Stand: 23. November 2026

## Behobener Fehler
Auf iPhones/Teams-In-App-Browsern erschien bei „Einladung abschließen“ teilweise
`Auth session missing!`. Die bisherige Implementierung verbrauchte den
Einmalcode schon beim ersten Seitenaufruf und öffnete anschließend ein
Passwortformular. Verlor der Browser währenddessen die Sitzungsdaten, war
`auth.updateUser({password})` nicht mehr autorisiert.

**Neu:** Der Token wird beim Seitenaufruf aus der URL entfernt und **nur im
Arbeitsspeicher der geöffneten Seite** bis zur Passwort-Eingabe behalten.
Erst beim Abschicken erfolgt `verifyOtp({token_hash,type})`; dann muss eine
vollständige Sitzung des genau richtigen Auth-Nutzers vorhanden sein. Falls
der Browser die Sitzung nicht übernommen hat, wird sie einmalig mit
`setSession` wiederhergestellt. Die Passwortänderung folgt unmittelbar.
Ein fehlender/ungültiger Einmalcode führt nicht mehr zu einem irreführenden
„erfolgreich eingeladen“-Zustand.

## Neuer Teamzugang
1. Als Administrator **Team & Zugänge** öffnen.
2. **Vor- und Nachname**, **E-Mail-Adresse**, **Viewer/Analyst/Admin** eingeben.
3. **Einmaligen NXT-Link erstellen**. Name wird als Auth-Profil-Metadatum
   gespeichert und erscheint in der Mitgliederliste.
4. Den Link ausschließlich vertraulich an die betreffende Person senden,
   etwa über einen Direktchat. Kein automatischer SMTP-Versand wird behauptet.
5. Die Person öffnet die NXT-Adresse, legt das eigene Passwort zweimal
   fest und drückt **Passwort festlegen**. Erst bei diesem Klick wird das
   Einmaltoken verbraucht und die Supabase-Sitzung unmittelbar verwendet.
6. Danach kann sie sich regulär mit E-Mail + Passwort anmelden.

Links:
- Neu: `https://hennerdesma-art.github.io/DigitaleTransformation-WoodCorp/#nxt_invite=<hash>&type=invite`
- Erneuern: gleiche NXT-URL, aber `&type=magiclink` für bestehende Mitglieder.
Beide sind Einmalcodes und verlieren nach der konfigurierten Supabase-OTP-Frist
ihre Gültigkeit. Die Funktion liefert **nie** einen rohen Supabase-Action-Link
an die Teammitglieder.

## Abgelaufener/verwendeter Link
Unter **Team & Zugänge → Mitglieder → Zugangslink erneuern** lässt sich für
ein **noch freigeschaltetes** Mitglied ein neuer Einmalcode erzeugen. Der
aktuelle Rollenstatus bleibt unverändert. Ein Auth-Konto ohne
`woodcorp_access` erhält **keine automatische Freigabe**.

Gerade bei mobilen In-App-Browsern: Link am besten direkt in Safari/Chrome
öffnen und das Fenster während der Passwortvergabe nicht neu laden.
Verliert der Browser die Seite, kann ein neuer Link benötigt werden.

## Endgültiges Entfernen
Unter **Team & Zugänge → Mitglieder → Endgültig löschen**:
- Das Ziel wird mit **Name, E-Mail und Anzahl eigener Workspaces** angezeigt.
- Der Administrator bestätigt die exakte E-Mail-Adresse.
- Serverseitige Authentifizierung **und** Admin-Rolle werden kontrolliert.
- Eigene Kontolöschung und Löschung des letzten Administrators sind verboten.
- `auth.admin.deleteUser(id,false)` löscht den Auth-Nutzer (hard delete)
  einschließlich seiner Supabase-Sessions. Die bestehenden Fremdschlüssel
  entfernen `woodcorp_access` und alle vom Nutzer besessenen
  `nxt_workspaces`. Einträge in `nxt_invitation_audit` zu seiner
  E-Mail werden nach erfolgreicher Löschung bereinigt.
- Bei Auth-Fehlern wird der Vorgang als fehlgeschlagen angezeigt, nicht als
  erfolgreich.
- Andere Konten/Workspaces und die beiden WoodCorp-Rohdatentabellen bleiben
  unverändert.
- Eine spätere Einladung muss wieder den vollständigen **Name + E-Mail +
  Einmal-Link**-Prozess durchlaufen.

**Supabase-Hinweis:** Bereits ausgegebene Access-JWTs können bis zu ihrem
Ablauf formal gültig bleiben. Die NXT-Datenrichtlinien prüfen jedoch die
aktuelle Mitgliedschaft in `woodcorp_access`, die beim Hard Delete via FK
entfällt. Damit kann die gelöschte Identität die Projektdaten nicht weiter
abfragen. Für besonders sensible Operationen empfiehlt Supabase zusätzlich
eine Session-ID-Prüfung.

## Referenzen, QA und Grenzen
- Vorbild: `nxt-netzwerkforschung-survey` Teamverwaltung,
  `supabase/functions/team-access/index.ts` + `js/team-access-ui.js`.
  Die separate App wurde nicht verändert.
- Supabase Auth: `verifyOtp`, `updateUser`, `generateLink`,
  `deleteUser` dokumentiert.
- Quelltext: `src/lib/invite.ts`, `src/components/AuthScreen.tsx`,
  `src/App.tsx`, `supabase/functions/nxt-members/index.ts`.
- Datenbank: `sql/nxt_invitation_hard_delete_fk.sql` (bereits angewendet).
- Tests: `src/core/invite.test.ts` und `src/core/team-edge.test.ts`
  (simulierte Auth-/Edge-Umgebung ohne echte Nutzer zu löschen).

**Grenze:** Ein echter Link kann nur von dem beabsichtigten Empfänger angenommen
und ein Passwort gesetzt werden. Wir haben keine fremde Identität authentifiziert
und keinen echten Nutzer im Rahmen dieser Implementierung gelöscht. Die
Praxiskontrolle durch einen eingeladenen Kommilitonen ist der letzte Schritt.
