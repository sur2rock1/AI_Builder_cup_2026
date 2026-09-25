import React, { useEffect, useRef, useState } from 'react';
import { Upload, CheckCircle, AlertCircle, FileText, X, Loader2, AlertTriangle, Link2, Globe, BookOpen } from 'lucide-react';
import { authFetch, getIdToken } from '../firebase/auth';

interface Props {
  onCurriculumLoaded: (subjectId: string, label: string) => void;
  isOpen: boolean;
  onClose: () => void;
  defaultStudentId?: string;
}

interface LearnerOpt {
  studentId: string;
  name: string;
  grade: string;
}

interface SourceRef { kind: 'file' | 'url'; label: string; href?: string }

interface Job {
  id: string;
  stage: string;
  message: string;
  chunksDone: number;
  chunksTotal: number;
  warnings: string[];
  error?: string;
  rails?: {
    files: { message: string; done: number; total: number };
    internet: { message: string; done: number; total: number };
  };
  preview?: {
    suggestedTitle: string;
    summary: string;
    topics: string[];
    keyConcepts: string[];
    sources: SourceRef[];
    sourceType: string;
    estimatedMinutes: number;
    ageBand: string;
    ageGroupLabel: string;
    grade: string;
    learnerName?: string;
  };
  program?: {
    programId: string;
    subjectId: string;
    label: string;
    lessonCount: number;
    quizCount: number;
    lessons: Array<{ id: string; title: string; minutes: number }>;
  };
  result?: {
    subjectId: string;
    label: string;
    suggestedLabel?: string;
    chapterCount: number;
    conceptCount: number;
    chapters: string[];
  };
}

const ACCEPT = '.pdf,.epub,.docx,.doc,.rtf,.odt,.xlsx,.csv,.pptx,.ppt,.md,.txt,.html,.htm,.xml,.png,.jpg,.jpeg,.webp,.gif,.svg,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.webm';
const MB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function kindLabel(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'epub') return 'EPUB';
  if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) return 'Document';
  if (['xlsx', 'csv'].includes(ext)) return 'Spreadsheet';
  if (['ppt', 'pptx'].includes(ext)) return 'Slides';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'heic'].includes(ext)) return 'Image';
  if (['mp3', 'm4a', 'wav', 'ogg'].includes(ext)) return 'Audio';
  if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) return 'Video';
  if (['md', 'txt', 'xml'].includes(ext)) return 'Notes';
  if (['html', 'htm'].includes(ext)) return 'HTML';
  return ext.toUpperCase();
}

function urlKind(url: string) {
  if (/youtu\.be|youtube\.com/i.test(url)) return 'YouTube';
  if (/docs\.google\.com\/document/i.test(url)) return 'Google Doc';
  return 'Web page';
}

async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { error: `Server returned ${res.status} ${res.statusText || ''}`.trim() }; }
}

type Phase = 'idle' | 'sending' | 'extracting' | 'preview' | 'saving' | 'generating' | 'ready' | 'error';

export const CurriculumUpload: React.FC<Props> = ({ onCurriculumLoaded, isOpen, onClose, defaultStudentId }) => {
  const [role, setRole] = useState<'parent' | 'learner'>('learner');
  const [children, setChildren] = useState<LearnerOpt[]>([]);
  const [studentId, setStudentId] = useState(defaultStudentId || '');
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [urlDraft, setUrlDraft] = useState('');
  const [topic, setTopic] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [sendPct, setSendPct] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  useEffect(() => {
    if (!isOpen) return;
    authFetch('/api/learners')
      .then(r => r.json())
      .then(j => {
        const list: LearnerOpt[] = (j.learners || []).map((l: LearnerOpt) => ({
          studentId: l.studentId, name: l.name, grade: l.grade,
        }));
        setRole(j.role === 'parent' ? 'parent' : 'learner');
        setChildren(list);
        setStudentId(prev => {
          if (defaultStudentId && list.some(l => l.studentId === defaultStudentId)) return defaultStudentId;
          if (prev && list.some(l => l.studentId === prev)) return prev;
          return list[0]?.studentId || '';
        });
      })
      .catch(() => {});
  }, [isOpen, defaultStudentId]);

  if (!isOpen) return null;

  const learner = children.find(c => c.studentId === studentId) || children[0];

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list);
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...next.filter(f => !seen.has(f.name + f.size))].slice(0, 10);
    });
    setError('');
  };

  const addUrl = () => {
    const raw = urlDraft.trim();
    if (!raw) return;
    const parts = raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    const bad = parts.filter(u => !/^https?:\/\//i.test(u));
    const good = parts.filter(u => /^https?:\/\//i.test(u));
    setUrls(prev => [...new Set([...prev, ...good])].slice(0, 8));
    setUrlDraft('');
    setError(bad.length ? 'Links need to start with http:// or https://' : '');
  };

  const reset = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    setFiles([]); setUrls([]); setUrlDraft(''); setTopic(''); setJob(null); setNameDraft('');
    setPhase('idle'); setError(''); setSendPct(0); setSaving(false);
  };

  const applyJob = (next: Job) => {
    setJob(next);
    if (next.stage === 'preview') {
      setNameDraft(next.preview?.suggestedTitle || next.result?.suggestedLabel || '');
      setPhase('preview');
    } else if (next.stage === 'ready') {
      setPhase('ready');
    } else if (next.stage === 'saving') setPhase('saving');
    else if (next.stage === 'generating') setPhase('generating');
    else if (next.stage === 'error') { setPhase('error'); setError(next.error || 'Extraction failed'); }
  };

  const poll = (jobId: string) => {
    pollRef.current = window.setInterval(async () => {
      try {
        const json = await readJson(await fetch(`/api/curriculum/jobs/${jobId}`));
        if (!json.job) throw new Error(json.error || 'Lost track of the job');
        applyJob(json.job);
        if (['preview', 'ready', 'error'].includes(json.job.stage)) {
          window.clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      } catch (e: any) {
        window.clearInterval(pollRef.current!);
        pollRef.current = null;
        setPhase('error'); setError(e.message);
      }
    }, 1500);
  };

  const submit = async () => {
    if (!files.length && !urls.length && !topic.trim()) {
      setError('Type a topic, or add a file or a link.'); return;
    }
    if (!learner?.grade) { setError('We need a learner profile before we can shape the lesson.'); return; }
    setError(''); setPhase('sending'); setSendPct(0);

    const form = new FormData();
    files.forEach(f => form.append('files', f));
    form.append('urls', JSON.stringify(urls));
    form.append('topic', topic.trim());
    form.append('studentId', learner.studentId);
    form.append('grade', learner.grade);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/curriculum/upload');
    const token = await getIdToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) setSendPct(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => { setPhase('error'); setError('Could not reach the server.'); };
    xhr.onload = () => {
      let json: any;
      try { json = JSON.parse(xhr.responseText); }
      catch { json = { error: `Server returned ${xhr.status}` }; }
      if (xhr.status >= 400 || !json.jobId) { setPhase('error'); setError(json.error || 'Upload failed'); return; }
      setPhase('extracting');
      setJob({ id: json.jobId, stage: 'queued', message: 'Starting…', chunksDone: 0, chunksTotal: 0, warnings: [] });
      poll(json.jobId);
    };
    xhr.send(form);
  };

  const confirm = async () => {
    if (!job?.id || job.stage !== 'preview') return;
    const label = nameDraft.trim();
    if (!label) { setError('Give this subject a name, or keep the suggestion.'); return; }
    setSaving(true); setError(''); setPhase('saving');
    try {
      const res = await authFetch('/api/curriculum/confirm', {
        method: 'POST',
        body: JSON.stringify({ jobId: job.id, label, studentId: learner?.studentId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not save the program');
      const next = await readJson(await fetch(`/api/curriculum/jobs/${job.id}`));
      if (next.job) applyJob(next.job);
      else {
        setJob(prev => prev && {
          ...prev,
          stage: 'ready',
          program: j.program,
          result: { ...prev.result!, subjectId: j.curriculum.subjectId, label: j.curriculum.label },
        });
        setPhase('ready');
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase('preview');
    } finally {
      setSaving(false);
    }
  };

  const startLearning = () => {
    const id = job?.program?.subjectId || job?.result?.subjectId;
    const label = job?.program?.label || nameDraft;
    if (!id || !label) return;
    reset();
    onCurriculumLoaded(id, label);
    onClose();
  };

  const busy = phase === 'sending' || phase === 'extracting' || phase === 'saving' || phase === 'generating';

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center px-3 sm:px-4">
      <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-5 sm:p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-white font-bold text-lg">Add learning materials</div>
            <div className="text-slate-400 text-xs mt-1 leading-relaxed">
              Type a topic and/or add files. Lumen searches the web and reads your files together for {learner ? `${learner.name} · ${learner.grade}` : 'this learner'}.
            </div>
          </div>
          <button onClick={() => { if (!busy) { reset(); onClose(); } }} disabled={busy}
            className="text-slate-500 hover:text-white disabled:cursor-default">
            <X size={20} />
          </button>
        </div>

        {(phase === 'idle' || phase === 'error') && (
          <>
            {role === 'parent' && children.length > 1 && (
              <div className="mb-3">
                <p className="text-slate-500 text-[11px] uppercase tracking-wider mb-1.5">Shape this lesson for</p>
                <div className="flex flex-wrap gap-2">
                  {children.map(c => (
                    <button key={c.studentId} type="button" onClick={() => setStudentId(c.studentId)}
                      className={`px-3 py-1.5 rounded-xl text-xs border ${studentId === c.studentId ? 'bg-indigo-600/30 border-indigo-400 text-white' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                      {c.name} · {c.grade.replace(/\s*\(Grade \d+\)/, '')}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {learner && role !== 'parent' && (
              <p className="text-slate-500 text-xs mb-3">Using {learner.name}’s profile · {learner.grade}</p>
            )}

            <label className="block mb-3">
              <span className="text-slate-400 text-xs">Topic — Lumen will search the web</span>
              <input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500"
                placeholder="e.g. photosynthesis"
                value={topic} onChange={e => setTopic(e.target.value)} />
            </label>

            <div onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer mb-3 ${dragOver ? 'border-sky-400 bg-sky-500/10' : 'border-slate-700'}`}>
              <Upload size={22} className="mx-auto mb-1 text-slate-500" />
              <div className="text-slate-300 text-sm">Drop files or click to add</div>
              <div className="text-slate-500 text-[11px] mt-1">PDF · Word · sheets · slides · images · notes · audio/video · up to 10</div>
            </div>
            <input ref={fileRef} type="file" accept={ACCEPT} multiple
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }} className="hidden" />

            <div className="flex gap-2 mb-3">
              <div className="flex-1 flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3">
                <Link2 size={14} className="text-slate-500" />
                <input className="flex-1 bg-transparent py-2.5 text-white text-sm outline-none"
                  placeholder="https://…  YouTube, article, or Google Doc"
                  value={urlDraft}
                  onChange={e => setUrlDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} />
              </div>
              <button type="button" onClick={addUrl}
                className="px-3 rounded-xl text-xs font-medium text-indigo-200 bg-indigo-600/30 border border-indigo-400/40">
                Add link
              </button>
            </div>

            {(files.length > 0 || urls.length > 0) && (
              <div className="mb-3 space-y-1.5">
                {files.map((f, i) => (
                  <div key={f.name + f.size} className="flex items-center gap-2.5 px-2.5 py-2 bg-slate-900 border border-white/5 rounded-xl">
                    <FileText size={15} className="text-sky-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-200 text-sm truncate">{f.name}</div>
                      <div className="text-slate-500 text-[11px]">{kindLabel(f.name)} · {MB(f.size)}</div>
                    </div>
                    <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} className="text-slate-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {urls.map(u => (
                  <div key={u} className="flex items-center gap-2.5 px-2.5 py-2 bg-slate-900 border border-white/5 rounded-xl">
                    <Link2 size={15} className="text-violet-300" />
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-200 text-sm truncate">{u}</div>
                      <div className="text-slate-500 text-[11px]">{urlKind(u)}</div>
                    </div>
                    <button onClick={() => setUrls(list => list.filter(x => x !== u))} className="text-slate-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="flex gap-2 items-start text-rose-400 text-sm mb-3">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}

            <button onClick={submit} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm">
              Read materials for {learner?.name || 'this learner'} →
            </button>
          </>
        )}

        {(phase === 'sending' || phase === 'extracting') && (
          <div className="pt-1 space-y-3">
            <div className="flex items-center gap-2.5 text-slate-200 text-sm">
              <Loader2 size={18} className="animate-spin text-sky-400" />
              <span>{phase === 'sending' ? 'Sending materials…' : job?.message || 'Working…'}</span>
            </div>
            {phase === 'sending' && (
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full" style={{ width: `${Math.max(3, sendPct)}%` }} />
              </div>
            )}
            <RailRow icon={<BookOpen size={14} />} label="Files" rail={job?.rails?.files} fallback={phase === 'sending' ? `${sendPct}% sent` : 'Preparing…'} />
            <RailRow icon={<Globe size={14} />} label="Internet" rail={job?.rails?.internet} fallback="Waiting…" />
          </div>
        )}

        {(phase === 'saving' || phase === 'generating') && (
          <div className="flex items-center gap-2.5 text-slate-200 text-sm py-4">
            <Loader2 size={18} className="animate-spin text-sky-400" />
            <span>{job?.message || (phase === 'saving' ? 'Saving…' : 'Building the program…')}</span>
          </div>
        )}

        {phase === 'preview' && job?.preview && (
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <CheckCircle size={22} className="text-emerald-400" />
              <div>
                <div className="text-emerald-400 font-bold">Review before saving</div>
                <div className="text-slate-400 text-xs">
                  Shaped for {job.preview.learnerName || learner?.name} · {job.preview.grade} · {job.preview.ageGroupLabel}
                </div>
              </div>
            </div>
            <p className="text-slate-400 text-xs mb-3 leading-relaxed">{job.preview.summary}</p>
            <label className="block mb-3">
              <span className="text-slate-400 text-xs">Suggested name — keep it or change it</span>
              <input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500"
                value={nameDraft} onChange={e => setNameDraft(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className="text-[11px] px-2 py-1 rounded-lg bg-white/5 text-slate-400">{job.preview.sourceType}</span>
              <span className="text-[11px] px-2 py-1 rounded-lg bg-white/5 text-slate-400">~{job.preview.estimatedMinutes} min</span>
              {job.preview.sources.map(s => (
                <span key={s.label + (s.href || '')} className={`text-[11px] px-2 py-1 rounded-lg ${s.kind === 'file' ? 'bg-sky-500/15 text-sky-200' : 'bg-violet-500/15 text-violet-200'}`}>
                  {s.kind === 'file' ? 'File' : 'Web'}: {s.label}
                </span>
              ))}
            </div>
            <div className="bg-slate-900 rounded-xl px-3.5 py-2.5 mb-3 max-h-40 overflow-y-auto">
              {(job.preview.topics.length ? job.preview.topics : job.preview.keyConcepts).map(c => (
                <div key={c} className="text-slate-300 text-sm py-1 border-b border-white/5 last:border-0">{c}</div>
              ))}
            </div>
            {job.preview.keyConcepts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {job.preview.keyConcepts.slice(0, 10).map(c => (
                  <span key={c} className="text-[11px] px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-200">{c}</span>
                ))}
              </div>
            )}
            {job.warnings.length > 0 && (
              <div className="flex gap-2 text-amber-300 text-xs mb-3 leading-relaxed">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <div>{job.warnings.length} part(s) skipped:<br />{job.warnings.slice(0, 3).join(' · ')}</div>
              </div>
            )}
            {error && (
              <div className="flex gap-2 items-start text-rose-400 text-sm mb-3">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={reset} className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-xl py-2.5 text-sm">Start over</button>
              <button onClick={confirm} disabled={saving || job.stage !== 'preview'}
                className="flex-1 bg-indigo-600 text-white font-semibold rounded-xl py-2.5 text-sm disabled:opacity-50">
                {saving ? 'Saving…' : 'Save and build program'}
              </button>
            </div>
          </div>
        )}

        {phase === 'ready' && job?.program && (
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <CheckCircle size={22} className="text-emerald-400" />
              <div>
                <div className="text-emerald-400 font-bold">{job.program.label} is ready</div>
                <div className="text-slate-400 text-xs">
                  {job.program.lessonCount} lessons · {job.program.quizCount} quizzes
                </div>
              </div>
            </div>
            <div className="bg-slate-900 rounded-xl px-3.5 py-2.5 mb-4 max-h-52 overflow-y-auto">
              {job.program.lessons.map(l => (
                <div key={l.id} className="flex justify-between text-sm py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-slate-200">{l.title}</span>
                  <span className="text-slate-500 text-xs">{l.minutes} min</span>
                </div>
              ))}
            </div>
            <button onClick={startLearning} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm">
              Start learning
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

function RailRow({ icon, label, rail, fallback }: {
  icon: React.ReactNode; label: string;
  rail?: { message: string; done: number; total: number };
  fallback: string;
}) {
  const pct = rail && rail.total ? Math.round((rail.done / rail.total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        <span>{rail?.message || fallback}</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all"
          style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
    </div>
  );
}

export default CurriculumUpload;
