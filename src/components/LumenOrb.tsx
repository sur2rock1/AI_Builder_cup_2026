import React, { useId } from 'react';

/**
 * Lumen's presence: a glowing amber-white orb with a simple face.
 * Never a human avatar, never a robot mascot. (Stitch / journey lock.)
 */
interface LumenOrbProps {
  size?: number;
  speaking?: boolean;
  level?: number;
  active?: boolean;
  thinking?: boolean;
  className?: string;
}

export const LumenOrb: React.FC<LumenOrbProps> = ({
  size = 128,
  speaking = false,
  level = 0,
  active = false,
  thinking = false,
  className = '',
}) => {
  const fillId = useId().replace(/:/g, '');
  const voice = Math.min(1, Math.max(0, speaking ? level : 0));
  const scale = 1 + voice * 0.18;
  const glow = 0.45 + voice * 0.35;
  const smileOpen = 6 + voice * 10;
  const eyeY = 42 - voice * 2;

  return (
    <div
      className={`relative grid place-items-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div
        className={`absolute inset-0 rounded-full blur-2xl ${active && !speaking ? 'animate-pulse' : ''}`}
        style={{
          background: `radial-gradient(circle, rgba(232,184,109,${glow}), rgba(255,248,231,0.22) 52%, transparent 72%)`,
          transform: `scale(${1.08 + voice * 0.28})`,
          transition: 'transform 120ms ease-out',
        }}
      />
      {thinking && (
        <div
          className="absolute rounded-full border-2 border-amber-200/20 border-t-amber-100/80 animate-spin"
          style={{ width: size * 0.82, height: size * 0.82, animationDuration: '1.1s' }}
        />
      )}
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 100 100"
        className="relative"
        style={{ transform: `scale(${scale})`, transition: 'transform 100ms ease-out' }}
      >
        <defs>
          <radialGradient id={fillId} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="28%" stopColor="#FFF4D6" />
            <stop offset="62%" stopColor="#E8B86D" />
            <stop offset="100%" stopColor="#C9843A" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill={`url(#${fillId})`} />
        <circle cx="36" cy="28" r="14" fill="rgba(255,255,255,0.45)" />
        <ellipse cx="36" cy={eyeY} rx="4.2" ry="5.2" fill="#5A3A16" />
        <ellipse cx="64" cy={eyeY} rx="4.2" ry="5.2" fill="#5A3A16" />
        <path
          d={`M 36,62 Q 50,${62 + smileOpen} 64,62`}
          fill="none"
          stroke="#5A3A16"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
