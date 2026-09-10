import { FileArchive, FileSpreadsheet, FileText, UploadCloud, X } from 'lucide-react';
import { useRef } from 'react';

function icon(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip')) return <FileArchive size={17} />;
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) return <FileSpreadsheet size={17} />;
  return <FileText size={17} />;
}

export function UploadPanel({ files, onFiles, onRemove, disabled }: { files: File[]; onFiles: (files: File[]) => void; onRemove: (index: number) => void; disabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <section className="card">
      <div className="sectionHead">
        <div>
          <h2>Vergabeunterlagen</h2>
          <p>PDF, DOCX, XLSX/XLS, CSV, TXT oder ZIP – mehrere Dateien gleichzeitig.</p>
        </div>
      </div>

      <button
        className="dropzone"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <UploadCloud size={30} />
        <strong>Dateien hier ablegen oder auswählen</strong>
        <span>Die Dateien werden zuerst lokal im Browser ausgelesen.</span>
      </button>
      <input
        ref={inputRef}
        hidden
        multiple
        type="file"
        accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.zip"
        onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
      />

      {files.length > 0 && (
        <div className="fileList">
          {files.map((file, index) => (
            <div className="fileRow" key={`${file.name}-${file.size}-${index}`}>
              <span className="fileIcon">{icon(file.name)}</span>
              <div className="fileMeta">
                <strong>{file.name}</strong>
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <button className="iconBtn" onClick={() => onRemove(index)} disabled={disabled} aria-label={`${file.name} entfernen`}><X size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
