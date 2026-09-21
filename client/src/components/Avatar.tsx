import { useId } from 'react';
import { initials, isUploaded, presetOf, PresetId } from '../profileLogic';

// Original vector artwork: a web-lined mask, a darker "Amazing" mask, a spider emblem and a web with a dangling spider.
// (Deliberately generic shapes, not any official logo or artwork.)

const RAYS = Array.from({ length: 14 }, (_, i) => (i * 360) / 14);
const at = (deg: number, r: number, cx = 50, cy = 54): [number, number] => [cx + Math.cos((deg * Math.PI) / 180) * r, cy + Math.sin((deg * Math.PI) / 180) * r];

function Web({ stroke, width = 1.3, opacity = 0.85, cy = 54 }: { stroke: string; width?: number; opacity?: number; cy?: number }) {
  return (
    <g stroke={stroke} strokeWidth={width} fill="none" opacity={opacity} strokeLinecap="round">
      {RAYS.map((a) => {
        const [x, y] = at(a, 72, 50, cy);
        return <line key={a} x1="50" y1={cy} x2={x} y2={y} />;
      })}
      {[15, 29, 44, 61].map((r) => <circle key={r} cx="50" cy={cy} r={r} />)}
    </g>
  );
}

const legs = 'M46,40 Q26,26 16,30 M46,45 Q24,42 12,52 M46,52 Q26,58 15,72 M47,58 Q36,70 32,88';

function Art({ id }: { id: PresetId }) {
  const uid = useId().replace(/:/g, '');
  const clip = `clip${uid}`;
  const grad = `grad${uid}`;

  if (id === 'mask') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden>
        <defs>
          <clipPath id={clip}><circle cx="50" cy="50" r="50" /></clipPath>
          <radialGradient id={grad} cx="50%" cy="35%" r="75%"><stop offset="0" stopColor="#f5393f" /><stop offset="1" stopColor="#b3121a" /></radialGradient>
        </defs>
        <g clipPath={`url(#${clip})`}>
          <rect width="100" height="100" fill={`url(#${grad})`} />
          <Web stroke="#2a0508" />
          <path d="M13,47 Q36,25 47,53 Q30,63 13,47Z" fill="#fff" stroke="#120305" strokeWidth="2.8" strokeLinejoin="round" />
          <path d="M87,47 Q64,25 53,53 Q70,63 87,47Z" fill="#fff" stroke="#120305" strokeWidth="2.8" strokeLinejoin="round" />
        </g>
      </svg>
    );
  }

  if (id === 'amazing-mask') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden>
        <defs>
          <clipPath id={clip}><circle cx="50" cy="50" r="50" /></clipPath>
          <radialGradient id={grad} cx="50%" cy="30%" r="80%"><stop offset="0" stopColor="#d9232b" /><stop offset="0.6" stopColor="#9c1119" /><stop offset="1" stopColor="#5b070d" /></radialGradient>
          <linearGradient id={`${grad}e`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#bcd8ff" /></linearGradient>
        </defs>
        <g clipPath={`url(#${clip})`}>
          <rect width="100" height="100" fill={`url(#${grad})`} />
          <Web stroke="#07101f" width={1} opacity={0.9} />
          <path d="M9,52 Q33,20 48,56 Q27,68 9,52Z" fill={`url(#${grad}e)`} stroke="#050912" strokeWidth="3.2" strokeLinejoin="round" />
          <path d="M91,52 Q67,20 52,56 Q73,68 91,52Z" fill={`url(#${grad}e)`} stroke="#050912" strokeWidth="3.2" strokeLinejoin="round" />
          <path d="M20,44 Q32,36 38,46" fill="none" stroke="#7db8ff" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
          <path d="M80,44 Q68,36 62,46" fill="none" stroke="#7db8ff" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
        </g>
        <circle cx="50" cy="50" r="48.5" fill="none" stroke="#7db8ff" strokeWidth="2" opacity="0.55" />
      </svg>
    );
  }

  if (id === 'spider') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden>
        <defs>
          <clipPath id={clip}><circle cx="50" cy="50" r="50" /></clipPath>
          <radialGradient id={grad} cx="50%" cy="30%" r="80%"><stop offset="0" stopColor="#f5393f" /><stop offset="1" stopColor="#a90f17" /></radialGradient>
        </defs>
        <g clipPath={`url(#${clip})`}>
          <rect width="100" height="100" fill={`url(#${grad})`} />
          <g fill="#0b0405" stroke="#0b0405" strokeLinecap="round">
            <ellipse cx="50" cy="60" rx="8" ry="15" stroke="none" />
            <circle cx="50" cy="40" r="5.5" stroke="none" />
            <path d={legs} fill="none" strokeWidth="3" />
            <path d={legs} fill="none" strokeWidth="3" transform="translate(100 0) scale(-1 1)" />
          </g>
        </g>
      </svg>
    );
  }

  // 'web': a navy night sky with a web and a red spider dangling on a thread
  return (
    <svg viewBox="0 0 100 100" aria-hidden>
      <defs>
        <clipPath id={clip}><circle cx="50" cy="50" r="50" /></clipPath>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1a2c6e" /><stop offset="1" stopColor="#050a1e" /></linearGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="100" fill={`url(#${grad})`} />
        <Web stroke="#ffffff" width={0.9} opacity={0.45} cy={22} />
        <line x1="50" y1="0" x2="50" y2="52" stroke="#ffffff" strokeWidth="1.2" opacity="0.9" />
        <g fill="#e62429" stroke="#e62429" strokeLinecap="round" transform="translate(0 30) scale(1)">
          <ellipse cx="50" cy="56" rx="6" ry="9" stroke="none" />
          <circle cx="50" cy="45" r="4" stroke="none" />
          <path d="M46,45 Q34,38 27,42 M46,49 Q32,48 24,56 M46,54 Q34,60 29,70 M47,58 Q40,66 38,76" fill="none" strokeWidth="2" />
          <path d="M46,45 Q34,38 27,42 M46,49 Q32,48 24,56 M46,54 Q34,60 29,70 M47,58 Q40,66 38,76" fill="none" strokeWidth="2" transform="translate(100 0) scale(-1 1)" />
        </g>
      </g>
    </svg>
  );
}

/** Round profile picture: a built-in picture, an uploaded photo, or the person's initials. */
export default function Avatar({ avatar, name, size = 40, className = '' }: { avatar?: string | null; name: string; size?: number; className?: string }) {
  const preset = presetOf(avatar);
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: size * 0.4 }} role="img" aria-label={`${name}'s picture`}>
      {preset ? (
        <Art id={preset} />
      ) : isUploaded(avatar) ? (
        <img src={avatar!} alt="" draggable={false} />
      ) : (
        <span className="avatar-initials" aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
