import React, { useState } from 'react';
import { PhotoVisualData } from '../types';
import { Sparkles, Camera, ZoomIn, Info, RefreshCw, Send, Layers } from 'lucide-react';

interface PhotoRealisticVisualProps {
  topic: string;
  grade: string;
  photoData?: PhotoVisualData;
  isLoadingPhoto?: boolean;
  onGeneratePhoto: (customPrompt?: string) => void;
}

export const PhotoRealisticVisual: React.FC<PhotoRealisticVisualProps> = ({
  topic,
  grade,
  photoData,
  isLoadingPhoto = false,
  onGeneratePhoto,
}) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const [activeAnnotation, setActiveAnnotation] = useState<{ label: string; description: string } | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPrompt.trim()) return;
    onGeneratePhoto(customPrompt.trim());
    setCustomPrompt('');
  };

  // Default educational fallback image seed based on topic if no image yet
  const defaultImageUrl =
    photoData?.imageUrl ||
    `https://picsum.photos/seed/${encodeURIComponent(topic.toLowerCase().replace(/[^a-z0-9]/g, ''))}/1280/720?blur=1`;

  return (
    <div className="w-full h-full flex flex-col bg-[#05170e] text-[#f0f9f3] relative overflow-hidden select-none">
      {/* Top Banner & AI Visual Generator Prompt Bar */}
      <div className="px-5 py-3 bg-[#082214]/90 border-b border-[#1b432a] flex flex-wrap items-center justify-between gap-3 z-10 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 to-emerald-500 flex items-center justify-center shadow-md">
            <Camera className="w-4 h-4 text-black" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white font-serif flex items-center gap-2">
              <span>Photorealistic &amp; Scientific Visuals</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 font-mono font-bold border border-amber-400/30">
                REAL-TIME AI
              </span>
            </h3>
            <p className="text-[11px] text-[#86b59b]">
              Visual evidence, microscopy, and photographic depictions of <strong className="text-white">{topic}</strong>
            </p>
          </div>
        </div>

        {/* Custom Photo Ask Input on the fly */}
        <form onSubmit={handleCustomSubmit} className="flex items-center gap-2 max-w-md w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={`Ask for specific photo/angle (e.g. inside leaf cell)...`}
              className="w-full pl-3 pr-8 py-1.5 text-xs rounded-xl bg-[#0c2819] border border-[#215337] focus:border-amber-400 focus:outline-none text-white placeholder-[#5e8b72]"
            />
            {customPrompt && (
              <button
                type="button"
                onClick={() => setCustomPrompt('')}
                className="absolute right-2 top-2 text-xs text-[#6e9b82] hover:text-white"
              >
                &times;
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoadingPhoto || !customPrompt.trim()}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-amber-400 text-black font-bold text-xs flex items-center gap-1.5 hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer shadow-md"
          >
            <Sparkles className="w-3 h-3" />
            <span>Generate</span>
          </button>
        </form>
      </div>

      {/* Main Image Display Area */}
      <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden bg-black/40">
        {isLoadingPhoto ? (
          <div className="flex flex-col items-center justify-center text-center p-8 bg-[#092215]/80 border border-[#23583a] rounded-3xl backdrop-blur-md shadow-2xl max-w-sm">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400/50 flex items-center justify-center mb-3 animate-pulse">
              <Sparkles className="w-6 h-6 text-amber-300 animate-spin" />
            </div>
            <h4 className="text-sm font-bold text-white mb-1">Generating AI Realistic Photo...</h4>
            <p className="text-xs text-[#8ab69e]">
              Synthesizing photorealistic educational visualization for &ldquo;{topic}&rdquo;...
            </p>
          </div>
        ) : (
          <div className="relative max-w-4xl max-h-[82%] w-full h-full flex items-center justify-center rounded-2xl overflow-hidden border-2 border-[#1f4e34] shadow-2xl group bg-[#020b06]">
            {/* The Image */}
            <img
              src={defaultImageUrl}
              alt={photoData?.caption || `Photorealistic depiction of ${topic}`}
              referrerPolicy="no-referrer"
              className={`w-full h-full object-contain rounded-xl transition-transform duration-300 ${
                isZoomed ? 'scale-125 cursor-zoom-out' : 'cursor-zoom-in'
              }`}
              onClick={() => setIsZoomed(!isZoomed)}
            />

            {/* Overlay Gradient for readability */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-5 pt-12 pointer-events-none">
              <div className="max-w-2xl">
                <span className="text-[10px] text-amber-400 uppercase font-mono font-bold tracking-wider block mb-1">
                  Scientific Photographic Depiction
                </span>
                <h4 className="text-base font-bold text-white font-serif leading-snug">
                  {photoData?.caption || `High-Resolution Photographic Study: ${topic}`}
                </h4>
                <p className="text-xs text-[#b8dfcc] mt-1 leading-relaxed line-clamp-2">
                  {photoData?.promptUsed ||
                    `Photorealistic representation illustrating the real-world scale, physical environment, and empirical manifestations of ${topic} for ${grade}.`}
                </p>
              </div>
            </div>

            {/* Interactive Annotation Pins if available */}
            {photoData?.annotations?.map((ann, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveAnnotation(ann);
                }}
                style={{ top: `${ann.y}%`, left: `${ann.x}%` }}
                className="absolute z-20 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-amber-400 text-black font-bold text-[10px] flex items-center justify-center shadow-lg border-2 border-white hover:scale-125 transition-transform cursor-pointer animate-pulse"
                title={ann.label}
              >
                {idx + 1}
              </button>
            ))}

            {/* Zoom Action Button */}
            <button
              onClick={() => setIsZoomed(!isZoomed)}
              className="absolute top-3 right-3 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-[#a4d4bc] hover:text-white border border-[#23583a] backdrop-blur-md transition-colors cursor-pointer"
              title={isZoomed ? 'Zoom Out' : 'Zoom In'}
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            {/* Quick Regenerate Photo Button */}
            <button
              onClick={() => onGeneratePhoto()}
              disabled={isLoadingPhoto}
              className="absolute top-3 right-14 px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 text-[#a4d4bc] hover:text-white border border-[#23583a] backdrop-blur-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Regenerate Visual"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Regenerate</span>
            </button>
          </div>
        )}
      </div>

      {/* Floating Active Annotation Card */}
      {activeAnnotation && (
        <div className="absolute bottom-6 right-6 z-30 max-w-sm p-4 rounded-2xl bg-[#082415] border-2 border-amber-400/80 shadow-2xl text-white animate-fadeIn">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              {activeAnnotation.label}
            </span>
            <button
              onClick={() => setActiveAnnotation(null)}
              className="text-xs text-[#8ab69e] hover:text-white cursor-pointer"
            >
              &times;
            </button>
          </div>
          <p className="text-xs text-[#cce7da] leading-relaxed">{activeAnnotation.description}</p>
        </div>
      )}
    </div>
  );
};
