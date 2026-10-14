// Switches between the plain-language Parent view (default) and the original
// engineering-style portal ("Under the hood"), which is unchanged.
import React, { useState } from 'react';
import { ParentReport } from './ParentReport';
import { ParentPortal } from '../components/ParentPortal';

interface Props { onBack: () => void; initialStudentId?: string }

export const ParentHome: React.FC<Props> = ({ onBack, initialStudentId }) => {
  const [mode, setMode] = useState<'parent' | 'technical'>('parent');
  if (mode === 'technical') {
    return (
      <div className="relative">
        <button onClick={() => setMode('parent')}
          className="fixed top-3 right-3 z-50 text-xs font-medium bg-white text-[#1E2430] rounded-full px-3.5 py-1.5 shadow-lg border border-slate-200">
          ← Parent view
        </button>
        <ParentPortal onBack={onBack} initialStudentId={initialStudentId} />
      </div>
    );
  }
  return <ParentReport onBack={onBack} initialStudentId={initialStudentId} onUnderTheHood={() => setMode('technical')} />;
};
