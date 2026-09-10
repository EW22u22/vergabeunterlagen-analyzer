# Vergabeunterlagen Analyzer – V1

Fokussierte V1 für die strukturierte Auswertung kompletter Vergabeunterlagen aus Auftragnehmer-Sicht.

## Was die App analysiert

- Was soll geliefert werden?
- Produkte / Artikel
- Mengen
- Größen
- Materialien
- Farben
- Veredelungen / Logos / Druck / Stick
- Qualitätsanforderungen
- Normen / Zertifizierungen
- Muster / Bemusterung
- Lieferorte
- Lieferfristen
- Vertragslaufzeit
- Lose
- Optionen / Verlängerungen
- Mindestanforderungen
- Eignungsnachweise
- Referenzen
- Umsatzanforderungen
- Versicherungen
- Ausschlusskriterien
- Zuschlagskriterien
- Preisgewichtung
- Zahlungsbedingungen
- Vertragsstrafen
- Gewährleistung
- Angebotsfrist
- Fragenfrist
- einzureichende Formulare
- Unterschriften
- Nebenangebote
- Bietergemeinschaften
- besondere Risiken
- widersprüchliche / unklare Angaben

Jede gefundene Information soll mit Datei + Fundstelle belegt werden.

## Unterstützte Dateien

PDF, DOCX, XLSX, XLS, CSV, TXT, Markdown und ZIP mit unterstützten Dateien.

PDFs werden seitenweise ausgelesen, Excel-Dateien mit Blatt- und Zeilenangaben. Bei DOCX gibt es Absatzbereiche, weil Word-Dateien technisch keine stabilen Seitenzahlen enthalten.

### Wichtige V1-Grenze

Bildbasierte/scannte PDFs ohne Textschicht werden erkannt und als OCR-Problem gemeldet. Dafür ist in V2 ein OCR-/Vision-Schritt vorgesehen.

## Deployment

1. Repository bei GitHub anlegen und den kompletten Inhalt dieses Ordners hochladen.
2. Repository mit Vercel verbinden.
3. In Vercel unter Environment Variables setzen:
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_MODEL`
4. Neu deployen.
5. `/api/status` öffnen. `aiConfigured` muss `true` sein.

Wichtig: Ein Claude-Pro-Abo enthält nicht automatisch API-Guthaben. Der API-Schlüssel wird separat über Anthropic verwaltet und kann nutzungsabhängige Kosten verursachen.

## Architektur

Dateien werden zunächst im Browser lokal extrahiert. Dadurch müssen große Originaldateien nicht als kompletter Upload an eine Vercel Function gesendet werden. Die extrahierten Abschnitte werden in kontrollierten Paketen an `/api/analyze` geschickt. Die KI erstellt zuerst Teilergebnisse und führt diese anschließend in einer zweiten Stufe zu einer Gesamtanalyse zusammen.
