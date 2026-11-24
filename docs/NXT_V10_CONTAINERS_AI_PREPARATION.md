# NXT v10 — Container, Blocksystem und AI-Vorbereitung

## Bedienung und Filtervertrag
- Im Bearbeitungsmodus Container aus der Palette hinzufügen. Blöcke in die Fläche ziehen, wieder herausziehen oder im Zahnrad einer Gruppe zuordnen. Container am Kopf verschieben; enthaltene Elemente folgen relativ.
- Gemeinsame Filter: jede Mitgliedschaft erzeugt eine implizite gerichtete Filterkante vom Container zum Mitglied. Alle bestehenden globalen und expliziten Filterkanten bleiben erhalten. Mitgliederfilter werden nicht auf Geschwister oder den Containerausgang zurückpropagiert.
- Ein Pfeil vom Container nach außen trägt ausschließlich seinen eigenen und eingehenden gemeinsamen Kontext. Individuelle Filter können weiterhin durch explizite Kanten weitergegeben werden. Zyklen durch neue Pfeile oder Gruppierung werden abgewiesen.
- Einstellungen: Titel, Kurzbeschreibung, Farbe und Maße. Automatisches Wachstum bei neuen Elementen. Ein-/Ausklappen ändert nur Darstellung, nicht Datenkontext; verborgene direkte Mitgliedskanten werden im eingeklappten Zustand nicht gezeigt. Auflösen entfernt nur Container und dessen explizite Kanten, Mitglieder bleiben an ihren absoluten Positionen.
- Keine verschachtelten Container in dieser ersten Version. Kein automatisches Umverdrahten oder Löschen vorhandener individueller Pfeile. Maße über Einstellungen, nicht über direkte Resize-Handles.
- Persistenz: optionale Eigenschaften in AnalysisNode, Graph-Version 2 und Workspace-Version 3 bleiben unverändert. Alte Dokumente ohne Container bleiben gültig. Supabase JSONB/RLS benötigt keine Migration.

## Blocksystem
NXT-Farben und ursprüngliches Logo unverändert. Neue semantische Gruppenvarianten Türkis, Graphit und Sand, konsistente Radien, lesbare Überschriften, Fokuszustände und kompakte Bibliothek. Kein Eingriff in Metrikformeln oder Nutzerverwaltung.

## AI Dashboard Builder – expliziter Vorbereitungsmodus
Neue Oberfläche in der Analyse. Lokale, deterministische Vorlagen für Executive, Segment und Prozessintervalle; Forschungsfrage, Vorschau der Widgettypen, Prüfung per normalizeDashboard sowie Abgleich mit dem freigegebenen Filterkatalog. Nach Bestätigung wird nur das Dashboard des gewählten Knotens ersetzt. Kein Modellaufruf, keine Datenübertragung, kein API-Key, keine vorgetäuschte KI-Auswertung.
 
Für den nächsten Schritt: serverseitige, authentifizierte Supabase Edge Function mit Rollenprüfung, Rate Limits, Provider-Key ausschließlich als Secret, strukturierter Ausgabe für erlaubte Widgets und Filter, Validierung im Backend und Client, Vorschau vor jeder Änderung. Thinking-Path-Ausgabe soll bestehende WorkspaceDocument-Struktur inklusive Container-Metadaten verwenden. Keine beliebige SQL-Ausführung, keine Rohdaten an den Provider, keine ungeprüften Ursachenbehauptungen. 
