/** Curio mark (same drawing as public/favicon.svg and the app icons). */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="curio-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b8ff9" /><stop offset="1" stopColor="#4f46e5" /></linearGradient>
        <linearGradient id="curio-cover" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a5b4fc" /><stop offset="1" stopColor="#6366f1" /></linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="232" fill="url(#curio-bg)" />
      <rect x="312" y="246" width="400" height="520" rx="60" fill="#fff" opacity=".28" transform="rotate(-13 512 506)" />
      <rect x="312" y="246" width="400" height="520" rx="60" fill="#fff" opacity=".5" transform="rotate(7 512 506)" />
      <rect x="312" y="252" width="400" height="520" rx="60" fill="#fff" />
      <rect x="356" y="296" width="312" height="250" rx="34" fill="url(#curio-cover)" />
      <circle cx="610" cy="352" r="30" fill="#fff" opacity=".85" />
      <path d="M356 500 l92-86 72 62 54-40 94 78 V512 a34 34 0 0 1 -34 34 H390 a34 34 0 0 1 -34 -34 Z" fill="#fff" opacity=".55" />
      <rect x="356" y="590" width="230" height="36" rx="18" fill="#c7d2fe" />
      <rect x="356" y="650" width="150" height="36" rx="18" fill="#e0e7ff" />
    </svg>
  );
}
