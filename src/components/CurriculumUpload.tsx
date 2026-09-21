import React, { useEffect, useRef, useState } from 'react';
import { Upload, CheckCircle, AlertCircle, FileText, X, Loader2, AlertTriangle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// Upload one or more textbook PDFs. Any size up to 500 MB each.
// The server splits, reads and merges them as a background job; this
// dialog polls that job and shows real progress.
// ─────────────────────────────────────────────────────────────────

interface Props {
  onCurriculumLoaded: (subjectId: string, label: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface Job {
  id: string;
  stage: 'queued' | 'splitting' | 'extracting' | 'merging' | 'done' | 'error';
  message: string;
  chunksDone: number;
  chunksTotal: number;
  warnings: string[];
  error?: string;
  result?: { subjectId: string; label: string; chapterCount: number; conceptCount: number; chapters: string[] };
}

const GRADES = ['Elementary (Grade 3-5)', 'Middle School (Grade 6-8)', 'Secondary 2 (Grade 8)', 'High School (Grade 9-12)'];
const MB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Reads any response safely — an HTML error page must never surface as "Unexpected token '<'". */
async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { error: `Server returned ${res.status} ${res.statusText || ''}`.trim() }; }
}

export const CurriculumUpload: React.FC<Props> = ({ onCurriculumLoaded, isOpen, onClose }) => {
  const [subjectLabel, setSubjectLabel] = useState('');
  const [grade, setGrade] = useState('Secondary 2 (Grade 8)');
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<'idle' | 'sending' | 'working' | 'done' | 'error'>('idle');
  const [sendPct, setSendPct] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);
  if (!isOpen) return null;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const pdfs = Array.from(list).filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    const rejected = list.length - pdfs.length;
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...pdfs.filter(f => !seen.has(f.name + f.size))].slice(0, 10);
    });
    setError(rejected ? `${rejected} file(s) skipped — only PDFs are accepted.` : '');
  };

  const reset = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    setFiles([]); setJob(null); setPhase('idle'); setError(''); setSendPct(0);
  };

  const poll = (jobId: string) => {
    pollRef.current = window.setInterval(async () => {
      try {
        const json = await readJson(await fetch(`/api/curriculum/jobs/${jobId}`));
        if (!json.job) throw new Error(json.error || 'Lost track of the job');
        setJob(json.job);
        if (json.job.stage === 'done' || json.job.stage === 'error') {
          window.clearInterval(pollRef.current!);
          pollRef.current = null;
          if (json.job.stage === 'done') setPhase('done');
          else { setPhase('error'); setError(json.job.error || 'Extraction failed'); }
        }
      } catch (e: any) {
        window.clearInterval(pollRef.current!);
        pollRef.current = null;
        setPhase('error'); setError(e.message);
      }
    }, 1500);
  };

  const submit = () => {
    if (!subjectLabel.trim()) { setError('Give the subject a name, e.g. "Sec 2 Maths".'); return; }
    if (!files.length) { setError('Add at least one PDF.'); return; }
    setError(''); setPhase('sending'); setSendPct(0);

    const form = new FormData();
    files.forEach(f => form.append('pdfs', f));
    form.append('subjectLabel', subjectLabel.trim());
    form.append('grade', grade);

    // XHR rather than fetch: fetch cannot report upload progress, and a
    // 119 MB book should not look frozen while it transfers.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/curriculum/upload');
    xhr.upload.onprogress = e => { if (e.lengthComputable) setSendPct(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => { setPhase('error'); setError('Could not reach the server.'); };
    xhr.onload = () => {
      let json: any;
      try { json = JSON.parse(xhr.responseText); }
      catch { json = { error: `Server returned ${xhr.status}` }; }
      if (xhr.status >= 400 || !json.jobId) { setPhase('error'); setError(json.error || 'Upload failed'); return; }
      setPhase('working');
      setJob({ id: json.jobId, stage: 'queued', message: 'Starting…', chunksDone: 0, chunksTotal: 0, warnings: [] });
      poll(json.jobId);
    };
    xhr.send(form);
  };

  const busy = phase === 'sending' || phase === 'working';
  const pct = phase === 'sending' ? sendPct
    : job && job.chunksTotal ? Math.round((job.chunksDone / job.chunksTotal) * 100) : 0;

  const input: React.CSSProperties = {
    width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 8,
    padding: '9px 11px', color: '#e5e7eb', fontSize: 13, marginBottom: 10, boxSizing: 'border-box',
  };
  const btn = (primary: boolean): React.CSSProperties => ({
    flex: 1, background: primary ? '#1d4ed8' : '#1f2937', border: primary ? 'none' : '1px solid #374151',
    borderRadius: 8, padding: '10px 0', color: primary ? 'white' : '#e5e7eb', fontSize: 14,
    fontWeight: 600, cursor: 'pointer',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0d1117', border: '1px solid #1f2937', borderRadius: 16, padding: 28,
                    width: 520, maxHeight: '88vh', overflowY: 'auto', fontFamily: 'system-ui, sans-serif' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 17 }}>Add textbooks</div>
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>
              Upload one or more PDFs. Gemini reads every chapter and extracts the concepts,
              common misconceptions and worked examples.
            </div>
          </div>
          <button onClick={() => { if (!busy) { reset(); onClose(); } }} disabled={busy}
                  style={{ background: 'none', border: 'none', color: '#6b7280', cursor: busy ? 'default' : 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {(phase === 'idle' || phase === 'error') && (
          <>
            <input style={input} placeholder='Subject name, e.g. "Sec 2 Maths"'
                   value={subjectLabel} onChange={e => setSubjectLabel(e.target.value)} />
            <select value={grade} onChange={e => setGrade(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {GRADES.map(g => <option key={g}>{g}</option>)}
            </select>
            <div style={{ color: '#6b7280', fontSize: 11.5, margin: '-4px 0 12px' }}>
              Books added under the same subject name are combined — e.g. upload Book 2A now and 2B later.
            </div>

            <div onClick={() => fileRef.current?.click()}
                 onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                 onDragLeave={() => setDragOver(false)}
                 onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                 style={{ border: `2px dashed ${dragOver ? '#60a5fa' : '#374151'}`, borderRadius: 10,
                          padding: '18px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: 12,
                          background: dragOver ? 'rgba(59,130,246,0.07)' : 'transparent' }}>
              <Upload size={24} color="#6b7280" style={{ margin: '0 auto 6px' }} />
              <div style={{ color: '#9ca3af', fontSize: 13.5 }}>Click or drop PDFs here</div>
              <div style={{ color: '#6b7280', fontSize: 11.5, marginTop: 2 }}>Up to 10 files · up to 500 MB each · scanned or digital</div>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" multiple
                   onChange={e => { addFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />

            {files.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {files.map((f, i) => (
                  <div key={f.name + f.size} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                       background: '#111827', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 6 }}>
                    <FileText size={16} color="#60a5fa" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#e5e7eb', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                      <div style={{ color: '#6b7280', fontSize: 11 }}>{MB(f.size)}{f.size > 50 * 1024 * 1024 ? ' · will be split into parts' : ''}</div>
                    </div>
                    <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}
                            style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#f87171', fontSize: 13, marginBottom: 12 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>{error}</span>
              </div>
            )}

            <button onClick={submit} style={{ ...btn(true), width: '100%' }}>
              Read {files.length > 1 ? `${files.length} books` : 'book'} with Gemini →
            </button>
          </>
        )}

        {busy && (
          <div style={{ padding: '6px 0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#e5e7eb', fontSize: 14, marginBottom: 12 }}>
              <Loader2 size={18} className="animate-spin" color="#60a5fa" />
              <span>{phase === 'sending' ? `Uploading ${files.length > 1 ? `${files.length} files` : files[0]?.name}…` : job?.message || 'Working…'}</span>
            </div>
            <div style={{ height: 8, background: '#1f2937', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(3, pct)}%`, background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)',
                            borderRadius: 99, transition: 'width .5s ease' }} />
            </div>
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>
              {phase === 'sending' ? `${sendPct}% sent`
                : job?.chunksTotal ? `${job.chunksDone} of ${job.chunksTotal} parts read`
                : 'Preparing…'}
              {phase === 'working' && ' · a full textbook takes a few minutes — you can leave this open'}
            </div>
          </div>
        )}

        {phase === 'done' && job?.result && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <CheckCircle size={24} color="#4ade80" />
              <div>
                <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 16 }}>{job.result.label} is ready</div>
                <div style={{ color: '#9ca3af', fontSize: 12.5 }}>
                  {job.result.conceptCount} concepts across {job.result.chapterCount} chapters
                </div>
              </div>
            </div>
            <div style={{ background: '#111827', borderRadius: 10, padding: '10px 14px', marginBottom: 12, maxHeight: 220, overflowY: 'auto' }}>
              {job.result.chapters.map(c => (
                <div key={c} style={{ color: '#d1d5db', fontSize: 13, padding: '5px 0', borderBottom: '1px solid #1f2937' }}>{c}</div>
              ))}
            </div>
            {job.warnings.length > 0 && (
              <div style={{ display: 'flex', gap: 8, color: '#fbbf24', fontSize: 12, marginBottom: 12, lineHeight: 1.45 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>{job.warnings.length} part(s) could not be read and were skipped:<br />{job.warnings.slice(0, 3).join(' · ')}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={reset} style={btn(false)}>Add more books</button>
              <button onClick={() => { const r = job.result!; reset(); onCurriculumLoaded(r.subjectId, r.label); onClose(); }}
                      style={btn(true)}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CurriculumUpload;
