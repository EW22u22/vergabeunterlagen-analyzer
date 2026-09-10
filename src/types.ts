export type FieldStatus = 'gefunden' | 'unklar' | 'nicht_gefunden';

export interface ExtractedSection {
  file: string;
  locator: string;
  text: string;
}

export interface Evidence {
  file: string;
  locator: string;
  quote?: string;
}

export interface FieldResult {
  key: string;
  label: string;
  status: FieldStatus;
  value: string;
  evidence: Evidence[];
}

export interface AnalysisReport {
  title: string | null;
  fields: FieldResult[];
  warnings: string[];
}

export interface ParsedUpload {
  sections: ExtractedSection[];
  warnings: string[];
}
