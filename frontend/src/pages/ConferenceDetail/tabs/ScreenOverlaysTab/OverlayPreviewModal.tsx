import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ScreenOverlay } from '../../../../types';
import api from '../../../../config/api';
import RichTextDisplay from '../../../../components/common/RichTextDisplay';

interface OverlayPreviewModalProps {
  overlay: ScreenOverlay;
  onDismiss: () => void;
}

export function OverlayPreviewModal({ overlay, onDismiss }: OverlayPreviewModalProps) {
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => onDismiss(), 300);
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) return;

    const duration = overlay.duration_seconds * 1000;
    const interval = 50;
    const step = (interval / duration) * 100;
    let remaining = 100;

    const timer = setInterval(() => {
      remaining -= step;
      setProgress(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(timer);
        handleDismiss();
      }
    }, interval);

    return () => clearInterval(timer);
  }, [visible, overlay.duration_seconds, handleDismiss]);

  const imageUrl = overlay.image_url ? `${api.defaults.baseURL}${overlay.image_url}` : null;

  return createPortal(
    <div
      className={`fixed inset-0 z-9999 flex items-center justify-center transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleDismiss}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Preview badge */}
      <div className="absolute top-4 left-4 z-20 px-3 py-1.5 bg-yellow-400 text-yellow-900 text-xs font-semibold rounded-full shadow-lg">
        PREVIEW
      </div>

      {/* Animation layer */}
      <PreviewAnimationEffect
        style={overlay.animation_style}
        durationSeconds={overlay.duration_seconds}
      />

      {/* Content card */}
      <div
        className={`relative z-10 max-w-lg w-full mx-4 p-8 text-center ${getPreviewAnimationClass(
          overlay.animation_style,
          visible
        )}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 text-white/60 hover:text-white rounded-full hover:bg-white/10"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {imageUrl && (
          <img src={imageUrl} alt="" className="w-full max-h-48 object-contain rounded-lg mb-4" />
        )}

        {overlay.body_text && (
          <RichTextDisplay
            content={overlay.body_text}
            className="text-white/80 prose-invert mb-4"
          />
        )}

        {/* Progress bar */}
        <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mt-4">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-50"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

function getPreviewAnimationClass(_style: string, visible: boolean): string {
  if (!visible) return 'opacity-0 scale-95';
  return 'animate-overlay-fade';
}

type PreviewEffectProps = { durationSeconds: number };

function PreviewAnimationEffect({
  style,
  durationSeconds,
}: {
  style: string;
  durationSeconds: number;
}) {
  switch (style) {
    case 'confetti':
      return <PreviewConfettiEffect durationSeconds={durationSeconds} />;
    case 'fireworks':
      return <PreviewFireworksEffect durationSeconds={durationSeconds} />;
    case 'balloons':
      return <PreviewBalloonsEffect durationSeconds={durationSeconds} />;
    case 'sparkle':
      return <PreviewSparkleEffect durationSeconds={durationSeconds} />;
    case 'spotlight':
      return <PreviewSpotlightEffect durationSeconds={durationSeconds} />;
    case 'snow':
      return <PreviewSnowEffect durationSeconds={durationSeconds} />;
    case 'stars':
      return <PreviewStarsEffect durationSeconds={durationSeconds} />;
    default:
      return null;
  }
}

function PreviewConfettiEffect({ durationSeconds }: PreviewEffectProps) {
  const pieces = Array.from({ length: 30 }, (_, i) => {
    const colors = [
      '#ff3b6f',
      '#ffe63b',
      '#3bff8a',
      '#3bc5ff',
      '#c77dff',
      '#ff6fb4',
      '#ff9f1c',
      '#00f5d4',
    ];
    const color = colors[i % colors.length];
    const left = `${Math.random() * 100}%`;
    const delay = `${Math.random() * durationSeconds * 0.5}s`;
    const duration = `${durationSeconds * (0.4 + Math.random() * 0.3)}s`;
    const size = 6 + Math.random() * 6;
    return (
      <div
        key={i}
        className="absolute rounded-sm"
        style={{
          left,
          top: '-10px',
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
          opacity: 0.9,
          animation: `pv-confetti-fall ${duration} ease-in ${delay} forwards`,
        }}
      />
    );
  });
  return (
    <>
      <style>{`
        @keyframes pv-confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{pieces}</div>
    </>
  );
}

function PreviewFireworksEffect({ durationSeconds }: PreviewEffectProps) {
  const burstDuration = Math.max(1, durationSeconds / 3);
  const burstSpacing = (durationSeconds * 0.8) / 7;
  const bursts = Array.from({ length: 8 }, (_, i) => {
    const left = 15 + Math.random() * 70;
    const top = 10 + Math.random() * 50;
    const delay = i * burstSpacing;
    const colors = [
      '#ff3b6f',
      '#ffe63b',
      '#3bff8a',
      '#3bc5ff',
      '#c77dff',
      '#ff6fb4',
      '#ff9f1c',
      '#00f5d4',
    ];
    const color = colors[i % colors.length];
    return (
      <div key={i} className="absolute" style={{ left: `${left}%`, top: `${top}%` }}>
        {Array.from({ length: 12 }, (_, j) => {
          const angle = (j / 12) * 360;
          const rad = (angle * Math.PI) / 180;
          const dist = 40 + Math.random() * 40;
          const tx = Math.cos(rad) * dist;
          const ty = Math.sin(rad) * dist;
          return (
            <div
              key={j}
              className="absolute w-2 h-2 rounded-full"
              style={{
                backgroundColor: color,
                boxShadow: `0 0 10px 3px ${color}`,
                animation: `pv-fw-burst-${i} ${burstDuration}s ease-out ${delay}s forwards`,
                ['--tx' as string]: `${tx}px`,
                ['--ty' as string]: `${ty}px`,
              }}
            />
          );
        })}
      </div>
    );
  });
  const keyframes = Array.from(
    { length: 8 },
    (_, i) => `
    @keyframes pv-fw-burst-${i} {
      0% { transform: translate(0, 0) scale(0); opacity: 1; }
      20% { opacity: 1; transform: scale(1.2); }
      100% { transform: translate(var(--tx), var(--ty)) scale(0.3); opacity: 0; }
    }
  `
  ).join('');
  return (
    <>
      <style>{keyframes}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{bursts}</div>
    </>
  );
}

function PreviewBalloonsEffect({ durationSeconds }: PreviewEffectProps) {
  const balloonColors = [
    '#ff3b6f',
    '#3bc5ff',
    '#3bff8a',
    '#ffe63b',
    '#c77dff',
    '#ff6fb4',
    '#ff9f1c',
    '#00f5d4',
  ];
  const balloons = Array.from({ length: 15 }, (_, i) => {
    const color = balloonColors[i % balloonColors.length];
    const left = 5 + Math.random() * 90;
    const size = 24 + Math.random() * 20;
    const delay = Math.random() * durationSeconds * 0.5;
    const riseDuration = durationSeconds * (0.5 + Math.random() * 0.3);
    const sway = -30 + Math.random() * 60;
    return (
      <div
        key={i}
        className="absolute"
        style={{
          left: `${left}%`,
          bottom: '-60px',
          animation: `pv-balloon-rise-${i} ${riseDuration}s ease-out ${delay}s forwards`,
          ['--sway' as string]: `${sway}px`,
        }}
      >
        <div
          style={{
            width: `${size}px`,
            height: `${size * 1.2}px`,
            backgroundColor: color,
            borderRadius: '50%',
            position: 'relative',
            boxShadow: `inset -${size / 6}px -${size / 6}px ${size / 3}px rgba(0,0,0,0.15), 0 0 ${size / 2}px ${color}40`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              bottom: '-8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: `8px solid ${color}`,
            }}
          />
        </div>
        <div
          style={{
            width: '1px',
            height: '20px',
            backgroundColor: 'rgba(255,255,255,0.4)',
            margin: '0 auto',
          }}
        />
      </div>
    );
  });
  const keyframes = Array.from(
    { length: 15 },
    (_, i) => `
    @keyframes pv-balloon-rise-${i} {
      0% { transform: translateY(0) translateX(0); opacity: 0.9; }
      25% { transform: translateY(-30vh) translateX(var(--sway)); }
      50% { transform: translateY(-60vh) translateX(calc(var(--sway) * -0.5)); }
      75% { transform: translateY(-90vh) translateX(var(--sway)); }
      100% { transform: translateY(-120vh) translateX(0); opacity: 0; }
    }
  `
  ).join('');
  return (
    <>
      <style>{keyframes}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{balloons}</div>
    </>
  );
}

function PreviewSparkleEffect({ durationSeconds: _durationSeconds }: PreviewEffectProps) {
  const sparkleColors = [
    '#ffe63b',
    '#ff6fb4',
    '#3bff8a',
    '#3bc5ff',
    '#c77dff',
    '#00f5d4',
    '#ff3b6f',
    '#ffffff',
  ];
  const sparkles = Array.from({ length: 25 }, (_, i) => {
    const color = sparkleColors[i % sparkleColors.length];
    const left = Math.random() * 100;
    const top = Math.random() * 100;
    const size = 3 + Math.random() * 5;
    const animDuration = 0.8 + Math.random() * 1.2;
    const delay = Math.random() * 2;
    return (
      <div
        key={i}
        className="absolute rounded-full"
        style={{
          left: `${left}%`,
          top: `${top}%`,
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
          boxShadow: `0 0 ${size * 2}px ${size}px ${color}80`,
          animation: `pv-sparkle-twinkle ${animDuration}s ease-in-out ${delay}s infinite`,
        }}
      />
    );
  });
  return (
    <>
      <style>{`
        @keyframes pv-sparkle-twinkle {
          0%, 100% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{sparkles}</div>
    </>
  );
}

function PreviewSpotlightEffect({ durationSeconds }: PreviewEffectProps) {
  const rotationDuration = Math.max(2, durationSeconds / 2);
  const beams = Array.from({ length: 3 }, (_, i) => {
    const offset = i * 120;
    const speed = rotationDuration * (0.8 + i * 0.2);
    return (
      <div
        key={i}
        className="absolute"
        style={{
          left: '50%',
          top: '50%',
          width: '200vmax',
          height: '200vmax',
          marginLeft: '-100vmax',
          marginTop: '-100vmax',
          background: `conic-gradient(from ${offset}deg, transparent 0deg, ${
            i === 0
              ? 'rgba(255,99,111,0.12)'
              : i === 1
                ? 'rgba(59,197,255,0.12)'
                : 'rgba(199,125,255,0.12)'
          } 10deg, ${
            i === 0
              ? 'rgba(255,99,111,0.25)'
              : i === 1
                ? 'rgba(59,197,255,0.25)'
                : 'rgba(199,125,255,0.25)'
          } 15deg, ${
            i === 0
              ? 'rgba(255,99,111,0.12)'
              : i === 1
                ? 'rgba(59,197,255,0.12)'
                : 'rgba(199,125,255,0.12)'
          } 20deg, transparent 30deg, transparent 360deg)`,
          animation: `pv-spotlight-sweep ${speed}s linear infinite`,
        }}
      />
    );
  });
  return (
    <>
      <style>{`
        @keyframes pv-spotlight-sweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{beams}</div>
    </>
  );
}

function PreviewSnowEffect({ durationSeconds }: PreviewEffectProps) {
  const flakes = Array.from({ length: 35 }, (_, i) => {
    const left = Math.random() * 100;
    const size = 2 + Math.random() * 4;
    const delay = Math.random() * durationSeconds * 0.5;
    const fallDuration = durationSeconds * (0.6 + Math.random() * 0.3);
    const drift = -30 + Math.random() * 60;
    const opacity = 0.5 + Math.random() * 0.4;
    return (
      <div
        key={i}
        className="absolute rounded-full"
        style={{
          left: `${left}%`,
          top: '-10px',
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: ['#e0f2ff', '#f0e6ff', '#ffe0f0', '#ffffff'][i % 4],
          opacity,
          boxShadow: `0 0 ${size * 2}px ${size}px rgba(255,255,255,0.2)`,
          animation: `pv-snow-fall-${i} ${fallDuration}s linear ${delay}s forwards`,
          ['--drift' as string]: `${drift}px`,
        }}
      />
    );
  });
  const keyframes = Array.from(
    { length: 35 },
    (_, i) => `
    @keyframes pv-snow-fall-${i} {
      0% { transform: translateY(0) translateX(0); }
      25% { transform: translateY(25vh) translateX(var(--drift)); }
      50% { transform: translateY(50vh) translateX(calc(var(--drift) * -0.5)); }
      75% { transform: translateY(75vh) translateX(var(--drift)); }
      100% { transform: translateY(105vh) translateX(0); opacity: 0; }
    }
  `
  ).join('');
  return (
    <>
      <style>{keyframes}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{flakes}</div>
    </>
  );
}

function PreviewStarsEffect({ durationSeconds }: PreviewEffectProps) {
  const starColors = [
    '#ffe63b',
    '#ff6fb4',
    '#3bff8a',
    '#3bc5ff',
    '#c77dff',
    '#ff3b6f',
    '#00f5d4',
    '#ffffff',
  ];
  const stars = Array.from({ length: 20 }, (_, i) => {
    const color = starColors[i % starColors.length];
    const angle = (i / 20) * 360 + Math.random() * 18;
    const rad = (angle * Math.PI) / 180;
    const dist = 30 + Math.random() * 40;
    const tx = Math.cos(rad) * dist;
    const ty = Math.sin(rad) * dist;
    const delay = (i / 20) * durationSeconds * 0.7;
    const flightDuration = durationSeconds * (0.4 + Math.random() * 0.2);
    const size = 4 + Math.random() * 4;
    return (
      <div
        key={i}
        className="absolute"
        style={{
          left: '50%',
          top: '50%',
          width: `${size}px`,
          height: `${size}px`,
          animation: `pv-star-radiate-${i} ${flightDuration}s ease-out ${delay}s forwards`,
          ['--tx' as string]: `${tx}vw`,
          ['--ty' as string]: `${ty}vh`,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: color,
            boxShadow: `0 0 ${size * 3}px ${size}px ${color}80`,
            clipPath:
              'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
          }}
        />
      </div>
    );
  });
  const keyframes = Array.from(
    { length: 20 },
    (_, i) => `
    @keyframes pv-star-radiate-${i} {
      0% { transform: translate(0, 0) scale(0); opacity: 1; }
      30% { transform: translate(calc(var(--tx) * 0.3), calc(var(--ty) * 0.3)) scale(1.5); opacity: 1; }
      100% { transform: translate(var(--tx), var(--ty)) scale(0.5); opacity: 0; }
    }
  `
  ).join('');
  return (
    <>
      <style>{keyframes}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">{stars}</div>
    </>
  );
}
