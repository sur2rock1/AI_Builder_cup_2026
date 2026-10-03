import React, { useEffect, useRef, useState } from 'react';
import { Upload, CheckCircle, AlertCircle, FileText, X, Loader2, AlertTriangle, ShieldCheck, Circle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// Admin upload form (lives inside AdminLibrary — learners never see it).
//
// One board + grade + subject per upload: one or more TEXTBOOK PDFs, plus
// an optional official SYLLABUS PDF that becomes the authority for scope.
// The server runs split → extract → structure → automated AI review →
// publish as a background job (src/curriculum/pdfIngest.ts); this form
// polls that job and shows each stage and the review report. There is no
// human approval step — the AI review decides what is published
// (DECISIONS.md D-2026-09-26-7).
// ─────────────────────────────────────────────────────────────────

interface VerificationReport {
  conceptsChecked: number; conceptsCorrected: number; conceptsRejected: number;
  examplesCorrected: number; examplesDropped: number; prerequisiteEdgesDropped: number;
  issues: string[];
}

interface Job {
  id: string;
  stage: 'queued' | 'splitting' | 'extracting' | 'merging' | 'structuring' | 'verifying' | 'publishing' | 'done' | 'error';
  message: string;
  chunksDone: number;
  chunksTotal: number;
  progress?: number;
  warnings: string[];
  error?: string;
  result?: {
    subjectId: string; label: string; board: string; grade: string;
    chapterCount: number; conceptCount: number; newConcepts: number; chapters: string[];
    verification: VerificationReport;
    chapterLimit?: number; chaptersLoaded?: string[]; chaptersNotLoaded?: number;
  };
  chunksSkipped?: number;
}

interface Props {
  adminToken: string;
  boards: string[];
  onPublished: (courseId: string) => void;
}

const STAGES: Array<{ id: Job['stage']; label: string }> = [
  { id: 'splitting', label: 'Split PDFs' },
  { id: 'extracting', label: 'Read chapters & concepts' },
  { id: 'merging', label: 'Combine chapters' },
  { id: 'structuring', label: 'Link prerequisites & concept types' },
  { id: 'verifying', label: 'AI review: check examples, facts, misconceptions; write ladder items' },
  { id: 'publishing', label: 'Publish' },
];

const SUBJECT_SUGGESTIONS = ['Mathematics', 'Science', 'Biology', 'Chemistry', 'Physics', 'History', 'Geography', 'English Language', 'English Literature', 'Economics', 'Computer Science'];
const MB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Reads any response safely — an HTML error page must never surface as "Unexpected token '<'". */
async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { error: `Server returned ${res.status} ${res.statusText || ''}`.trim() }; }
}

export const CurriculumUpload: React.FC<Props> = ({ adminToken, boards, onPublished }) => {
  const [board, setBoard] = useState('');
  const [gradeLevel, setGradeLevel] = useState(8);
  const [subject, setSubject] = useState('');
  // D-2026-09-26-9: load only the first N chapters (demo / cost control).
  // Reading stops at chapter N+1, so the rest of the PDF is never sent to Gemini;
  // pre-generation then covers exactly the chapters that were loaded.
  const [chapterLimit, setChapterLimit] = useState(3);
  const [allChapters, setAllChapters] = useState(false);
  const [textbooks, setTextbooks] = useState<File[]>([]);
  const [syllabus, setSyllabus] = useState<File | null>(null);
  const [phase, setPhase] = useState<'idle' | 'sending' | 'working' | 'done' | 'error'>('idle');
  const [sendPct, setSendPct] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sylRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const headers = (): Record<string, string> => (adminToken ? { 'X-Admin-Token': adminToken } : {});
  const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';

  const addTextbooks = (list: FileList | null) => {
    if (!list) return;
    const pdfs = Array.from(list).filter(isPdf);
    const rejected = list.length - pdfs.length;
    setTextbooks(prev => {
      const seen = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...pdfs.filter(f => !seen.has(f.name + f.size))].slice(0, 10);
    });
    setError(rejected ? `${rejected} file(s) skipped — only PDFs are accepted.` : '');
  };

  const reset = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    setTextbooks([]); setSyllabus(null); setJob(null); setPhase('idle'); setError(''); setSendPct(0); setShowIssues(false);
  };

  const poll = (jobId: string) => {
    pollRef.current = window.setInterval(async () => {
      try {
        const json = await readJson(await fetch(`/api/curriculum/jobs/${jobId}`, { headers: headers() }));
        if (!json.job) throw new Error(json.error || 'Lost track of the job');
        setJob(json.job);
        if (json.job.stage === 'done' || json.job.stage === 'error') {
          window.clearInterval(pollRef.current!);
          pollRef.current = null;
          if (json.job.stage === 'done') { setPhase('done'); onPublished(json.job.result?.subjectId); }
          else { setPhase('error'); setError(json.job.error || 'Ingestion failed'); }
        }
      } catch (e: any) {
        window.clearInterval(pollRef.current!);
        pollRef.current = null;
        setPhase('error'); setError(e.message);
      }
    }, 2000);
  };

  const submit = () => {
    if (!board.trim()) { setError('Choose or type the board, e.g. IGCSE or CBSE.'); return; }
    if (!subject.trim()) { setError('Give the subject, e.g. Mathematics.'); return; }
    if (!textbooks.length) { setError('Add at least one textbook PDF.'); return; }
    setError(''); setPhase('sending'); setSendPct(0);

    const form = new FormData();
    textbooks.forEach(f => form.append('textbooks', f));
    if (syllabus) form.append('syllabus', syllabus);
    form.append('board', board.trim());
    form.append('grade', String(gradeLevel));
    form.append('subject', subject.trim());
    form.append('chapterLimit', allChapters ? 'all' : String(Math.max(1, Math.floor(chapterLimit) || 3)));

    // XHR rather than fetch: fetch cannot report upload progress, and a
    // 119 MB book should not look frozen while it transfers.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/curriculum/upload');
    if (adminToken) xhr.setRequestHeader('X-Admin-Token', adminToken);
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
  const stageIdx = job ? STAGES.findIndex(s => s.id === job.stage) : -1;

  const input: React.CSSProperties = {
    width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: 8,
    padding: '9px 11px', color: '#e5e7eb', fontSize: 13, boxSizing: 'border-box',
  };
  const label: React.CSSProperties = { color: '#9ca3af', fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4, display: 'block' };
  const btn = (primary: boolean): React.CSSProperties => ({
    flex: 1, background: primary ? '#1d4ed8' : '#1f2937', border: primary ? 'none' : '1px solid #374151',
    borderRadius: 8, padding: '10px 0', color: primary ? 'white' : '#e5e7eb', fontSize: 14,
    fontWeight: 600, cursor: 'pointer',
  });

  return (
    <div style={{ background: '#0d1117', border: '1px solid #1f2937', borderRadius: 16, padding: 22, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16 }}>Add textbooks to the library</div>
      <div style={{ color: '#6b7280', fontSize: 12, marginTop: 3, marginBottom: 16, lineHeight: 1.5 }}>
        One board, grade and subject per upload. Gemini reads every chapter, links prerequisites, then an automated
        review re-checks every worked example and fact before anything reaches a learner. Books added to the same
        board + grade + subject are combined — upload Book A now and Book B later.
      </div>

      {(phase === 'idle' || phase === 'error') && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <span style={label}>Board</span>
              <input style={input} list="pt-boards" placeholder="IGCSE, CBSE, IB MYP…" value={board} onChange={e => setBoard(e.target.value)} />
              <datalist id="pt-boards">{boards.map(b => <option key={b} value={b} />)}</datalist>
            </div>
            <div>
              <span style={label}>Grade</span>
              <select style={{ ...input, cursor: 'pointer' }} value={gradeLevel} onChange={e => setGradeLevel(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(g => <option key={g} value={g}>Grade {g}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Subject</span>
              <input style={input} list="pt-subjects" placeholder="Mathematics" value={subject} onChange={e => setSubject(e.target.value)} />
              <datalist id="pt-subjects">{SUBJECT_SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ flex: 1 }}>
              <span style={{ ...label, marginBottom: 2 }}>Chapters to load</span>
              <div style={{ color: '#6b7280', fontSize: 11.5, lineHeight: 1.4 }}>
                {allChapters
                  ? 'Whole book: every chapter is read, reviewed and pre-generated (most Gemini usage).'
                  : `Only the first ${chapterLimit || 1} chapter(s) are read, reviewed and pre-generated — the rest of the PDF is never sent to Gemini. Upload the same book again with a higher number to add more.`}
              </div>
            </div>
            <input type="number" min={1} max={200} value={chapterLimit} disabled={allChapters}
                   onChange={e => setChapterLimit(Math.max(1, Number(e.target.value) || 1))}
                   style={{ ...input, width: 70, textAlign: 'center', opacity: allChapters ? 0.4 : 1 }} />
            <label style={{ color: '#d1d5db', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={allChapters} onChange={e => setAllChapters(e.target.checked)} /> All chapters
            </label>
          </div>

          <span style={label}>Textbook PDFs (required)</span>
          <div onClick={() => fileRef.current?.click()}
               onDragOver={e => { e.preventDefault(); setDragOver(true); }}
               onDragLeave={() => setDragOver(false)}
               onDrop={e => { e.preventDefault(); setDragOver(false); addTextbooks(e.dataTransfer.files); }}
               style={{ border: `2px dashed ${dragOver ? '#60a5fa' : '#374151'}`, borderRadius: 10,
                        padding: '16px', textAlign: 'center', cursor: 'pointer', marginBottom: 10,
                        background: dragOver ? 'rgba(59,130,246,0.07)' : 'transparent' }}>
            <Upload size={22} color="#6b7280" style={{ margin: '0 auto 6px' }} />
            <div style={{ color: '#9ca3af', fontSize: 13 }}>Click or drop textbook PDFs here</div>
            <div style={{ color: '#6b7280', fontSize: 11.5, marginTop: 2 }}>Up to 10 files · up to 500 MB each · scanned or digital</div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" multiple
                 onChange={e => { addTextbooks(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />

          {textbooks.map((f, i) => (
            <div key={f.name + f.size} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                 background: '#111827', border: '1px solid #1f2937', borderRadius: 8, marginBottom: 6 }}>
              <FileText size={15} color="#60a5fa" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e5e7eb', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                <div style={{ color: '#6b7280', fontSize: 11 }}>{MB(f.size)}{f.size > 40 * 1024 * 1024 ? ' · will be split into parts' : ''}</div>
              </div>
              <button onClick={() => setTextbooks(fs => fs.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><X size={15} /></button>
            </div>
          ))}

          <span style={{ ...label, marginTop: 10 }}>Official syllabus PDF (optional — sets what is in and out of scope)</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <button onClick={() => sylRef.current?.click()} style={{ ...btn(false), flex: 'none', padding: '8px 12px', fontSize: 12.5 }}>
              {syllabus ? 'Replace syllabus' : 'Choose syllabus PDF'}
            </button>
            {syllabus && (
              <span style={{ color: '#d1d5db', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={14} color="#a78bfa" /> {syllabus.name}
                <button onClick={() => setSyllabus(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><X size={14} /></button>
              </span>
            )}
          </div>
          <input ref={sylRef} type="file" accept=".pdf,application/pdf"
                 onChange={e => { const f = e.target.files?.[0]; if (f && isPdf(f)) setSyllabus(f); e.target.value = ''; }} style={{ display: 'none' }} />

          {error && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#f87171', fontSize: 13, marginBottom: 12 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>{error}</span>
            </div>
          )}

          <button onClick={submit} style={{ ...btn(true), width: '100%' }}>
            {allChapters ? 'Read, check and publish the whole book →' : `Read, check and publish first ${chapterLimit} chapter(s) →`}
          </button>
        </>
      )}

      {busy && (
        <div style={{ padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#e5e7eb', fontSize: 14, marginBottom: 12 }}>
            <Loader2 size={18} className="animate-spin" color="#60a5fa" />
            <span>{phase === 'sending' ? `Uploading… ${sendPct}%` : job?.message || 'Working…'}</span>
          </div>
          {phase === 'working' && STAGES.map((s, i) => {
            const done = stageIdx > i;
            const active = stageIdx === i;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '3px 0',
                                        color: done ? '#4ade80' : active ? '#e5e7eb' : '#6b7280' }}>
                {done ? <CheckCircle size={14} /> : active ? <Loader2 size={14} className="animate-spin" /> : <Circle size={14} />}
                <span>{s.label}</span>
                {active && s.id === 'extracting' && job?.chunksTotal ? <span style={{ color: '#9ca3af' }}>· {job.chunksDone}/{job.chunksTotal} parts</span> : null}
                {active && s.id === 'verifying' && job?.progress ? <span style={{ color: '#9ca3af' }}>· {Math.round(job.progress * 100)}%</span> : null}
              </div>
            );
          })}
          <div style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>A full textbook takes several minutes — you can leave this open.</div>
        </div>
      )}

      {phase === 'done' && job?.result && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <CheckCircle size={24} color="#4ade80" />
            <div>
              <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 15 }}>
                {job.result.board} · {job.result.grade} · {job.result.label} published
              </div>
              <div style={{ color: '#9ca3af', fontSize: 12.5 }}>
                {job.result.newConcepts} new concept(s) · {job.result.conceptCount} total across {job.result.chapterCount} chapter(s)
              </div>
              {job.result.chapterLimit ? (
                <div style={{ color: '#fbbf24', fontSize: 12, marginTop: 2 }}>
                  Chapter limit {job.result.chapterLimit}: loaded {(job.result.chaptersLoaded || []).join(', ') || '—'}
                  {job.chunksSkipped ? ` · ${job.chunksSkipped} later part(s) of the PDF not read` : ''}
                  {' '}· upload again with a higher number or “All chapters” to add more.
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c4b5fd', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              <ShieldCheck size={15} /> Automated review
            </div>
            {(() => {
              const v = job.result.verification;
              return (
                <div style={{ color: '#d1d5db', fontSize: 12.5, lineHeight: 1.7 }}>
                  {v.conceptsChecked} concepts checked · {v.conceptsCorrected} corrected · {v.conceptsRejected} rejected<br />
                  {v.examplesCorrected} worked example(s) corrected · {v.examplesDropped} dropped as unfixable/unverified<br />
                  {v.prerequisiteEdgesDropped} invalid prerequisite link(s) removed
                  {v.issues.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <button onClick={() => setShowIssues(s => !s)} style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', padding: 0, fontSize: 12 }}>
                        {showIssues ? 'Hide' : 'Show'} {v.issues.length} review note(s)
                      </button>
                      {showIssues && (
                        <ul style={{ margin: '6px 0 0 16px', padding: 0, color: '#9ca3af', fontSize: 11.5, maxHeight: 180, overflowY: 'auto' }}>
                          {v.issues.map((x, i) => <li key={i}>{x}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {job.warnings.length > 0 && (
            <div style={{ display: 'flex', gap: 8, color: '#fbbf24', fontSize: 12, marginBottom: 12, lineHeight: 1.45 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{job.warnings.slice(0, 4).join(' · ')}{job.warnings.length > 4 ? ` · +${job.warnings.length - 4} more` : ''}</div>
            </div>
          )}
          <button onClick={reset} style={{ ...btn(false), width: '100%' }}>Upload another</button>
        </div>
      )}
    </div>
  );
};

export default CurriculumUpload;
