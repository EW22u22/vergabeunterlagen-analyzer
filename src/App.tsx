import { useMemo, useState } from 'react';
import { BrainCircuit, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { UploadPanel } from './components/UploadPanel';
import { AnalysisReport } from './components/AnalysisReport';
import { extractFiles, splitForAnalysis } from './lib/extractFiles';
import type { AnalysisReport as Report } from './types';

async function postJson(payload: unknown) {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [progress, setProgress] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);

  const canAnalyze = useMemo(() => files.length > 0 && !busy, [files, busy]);

  async function analyze() {
    setBusy(true);
    setError('');
    setReport(null);
    setWarnings([]);
    setProgress(0);
    try {
      setPhase('Dateien werden vollständig ausgelesen …');
      const parsed = await extractFiles(files);
      setWarnings(parsed.warnings);
      if (!parsed.sections.length) throw new Error('Aus den Dateien konnte kein analysierbarer Text extrahiert werden.');

      const chunks = splitForAnalysis(parsed.sections);
      const partials: unknown[] = [];
      for (let i = 0; i < chunks.length; i += 1) {
        setPhase(`KI analysiert Dokumentabschnitte ${i + 1} von ${chunks.length} …`);
        partials.push(await postJson({ mode: 'chunk', sections: chunks[i] }));
        setProgress(Math.round(((i + 1) / (chunks.length + 1)) * 100));
      }

      setPhase('Teilergebnisse werden zusammengeführt und geprüft …');
      const finalReport = await postJson({ mode: 'finalize', partials }) as Report;
      finalReport.warnings = [...parsed.warnings, ...(finalReport.warnings ?? [])];
      setReport(finalReport);
      setProgress(100);
      setPhase('Fertig');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFiles([]);
    setReport(null);
    setWarnings([]);
    setError('');
    setPhase('');
    setProgress(0);
  }

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="brand"><div className="brandMark"><BrainCircuit size={22} /></div><div><strong>Vergabeunterlagen Analyzer</strong><span>KI-gestützte Dokumentauswertung</span></div></div>
        <div className="privacy"><ShieldCheck size={16} /> Fakten mit Quellenbelegen</div>
      </header>

      <main className="container">
        <section className="hero">
          <div className="eyebrow">Auftragnehmer-Perspektive</div>
          <h1>Vergabeunterlagen komplett lesen. Relevante Punkte strukturiert finden.</h1>
          <p>Alle Unterlagen gemeinsam hochladen. Die KI extrahiert Produkte, Mengen, technische Anforderungen, Fristen, Nachweise, Vertragsbedingungen und weitere relevante Punkte – ohne GO/NO-GO-Entscheidung.</p>
        </section>

        {!report && (
          <>
            <UploadPanel
              files={files}
              disabled={busy}
              onFiles={(next) => setFiles((current) => [...current, ...next])}
              onRemove={(index) => setFiles((current) => current.filter((_, i) => i !== index))}
            />

            {warnings.length > 0 && <div className="warningBox"><div>{warnings.map((w, i) => <div key={i}>{w}</div>)}</div></div>}
            {error && <div className="errorBox">{error}</div>}

            <div className="actionRow">
              <button className="primaryBtn" onClick={analyze} disabled={!canAnalyze}>
                {busy ? <LoaderCircle className="spin" size={18} /> : <BrainCircuit size={18} />}
                {busy ? 'Analyse läuft …' : 'Unterlagen analysieren'}
              </button>
              <span className="actionHint">Keine Bewertung, nur strukturierte Extraktion.</span>
            </div>

            {busy && (
              <div className="progressCard">
                <div className="progressMeta"><strong>{phase}</strong><span>{progress}%</span></div>
                <div className="progressTrack"><div className="progressFill" style={{ width: `${progress}%` }} /></div>
              </div>
            )}
          </>
        )}

        {report && (
          <>
            <div className="reportActions"><button className="secondaryBtn" onClick={reset}><RotateCcw size={16} /> Neue Analyse</button></div>
            <AnalysisReport report={report} />
          </>
        )}
      </main>
    </div>
  );
}
