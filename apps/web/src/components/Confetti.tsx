'use client';

/**
 * A tiny dependency-free confetti burst for the picker reveal. Renders a
 * fixed set of colored pieces that fall + spin + fade once, then the
 * parent unmounts it. Purely decorative: pointer-events-none, and the
 * animation is skipped under prefers-reduced-motion (CSS handles that).
 */

const COLORS = ['#7c3aed', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
const PIECES = 28;

export function Confetti() {
  return (
    <div
      aria-hidden
      data-testid="confetti"
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0 overflow-visible"
    >
      <style>{`
        @keyframes huddle-confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(160px) rotate(540deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .huddle-confetti-piece { animation: none !important; opacity: 0; }
        }
      `}</style>
      {Array.from({ length: PIECES }).map((_, i) => {
        const left = (i / PIECES) * 100;
        const delay = (i % 6) * 60;
        const duration = 900 + (i % 5) * 160;
        const color = COLORS[i % COLORS.length];
        return (
          <span
            key={i}
            className="huddle-confetti-piece absolute block h-2 w-1.5 rounded-[1px]"
            style={{
              left: `${left}%`,
              backgroundColor: color,
              animation: `huddle-confetti-fall ${duration}ms ${delay}ms ease-in forwards`,
            }}
          />
        );
      })}
    </div>
  );
}
