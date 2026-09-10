import { AlertTriangle, CheckCircle2, CircleHelp, FileSearch } from 'lucide-react';
import type { AnalysisReport as Report } from '../types';

const groups = [
  ['Leistungsumfang', ['scope','products','quantities','sizes','materials','colors','finishing','quality','standards','samples']],
  ['Lieferung & Vertrag', ['delivery_locations','delivery_deadlines','contract_duration','lots','options','payment_terms','contract_penalties','warranty']],
  ['Eignung & Teilnahme', ['minimum_requirements','eligibility_evidence','references','turnover','insurance','exclusion_criteria','variants','consortia']],
  ['Angebot & Fristen', ['award_criteria','price_weighting','submission_deadline','questions_deadline','required_forms','signatures']],
  ['Besonderheiten', ['risks','contradictions']],
] as const;

function StatusIcon({ status }: { status: string }) {
  if (status === 'gefunden') return <CheckCircle2 size={17} />;
  if (status === 'unklar') return <AlertTriangle size={17} />;
  return <CircleHelp size={17} />;
}

export function AnalysisReport({ report }: { report: Report }) {
  const byKey = new Map(report.fields.map((field) => [field.key, field]));
  return (
    <section className="report">
      <div className="reportTitle">
        <div className="eyebrow">Analyse abgeschlossen</div>
        <h2>{report.title || 'Vergabeunterlagen'}</h2>
        <p>Extrahierte Informationen mit Quellenbelegen aus den hochgeladenen Unterlagen.</p>
      </div>

      {report.warnings.length > 0 && (
        <div className="warningBox">
          <AlertTriangle size={18} />
          <div>{report.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
        </div>
      )}

      {groups.map(([title, keys]) => (
        <section className="card resultGroup" key={title}>
          <h3>{title}</h3>
          <div className="resultGrid">
            {keys.map((key) => {
              const field = byKey.get(key);
              if (!field) return null;
              return (
                <article className={`resultItem status-${field.status}`} key={field.key}>
                  <div className="resultItemHead">
                    <span className="statusIcon"><StatusIcon status={field.status} /></span>
                    <strong>{field.label}</strong>
                    <span className="statusText">{field.status.replace('_', ' ')}</span>
                  </div>
                  <div className="resultValue">{field.value}</div>
                  {field.evidence?.length > 0 && (
                    <div className="evidenceList">
                      {field.evidence.slice(0, 6).map((ev, i) => (
                        <div className="evidence" key={`${ev.file}-${ev.locator}-${i}`}>
                          <FileSearch size={14} />
                          <div>
                            <strong>{ev.file}</strong> · {ev.locator}
                            {ev.quote && <div className="quote">„{ev.quote}“</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
