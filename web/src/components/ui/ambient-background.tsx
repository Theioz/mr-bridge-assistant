export function AmbientBackground() {
  return (
    <>
      <div aria-hidden="true" className="ambient-grain" />
      <svg
        aria-hidden="true"
        className="ambient-watercolor"
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter id="ambient-watercolor" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.0085"
              numOctaves={3}
              seed={7}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={180}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation={14} />
          </filter>
        </defs>
        <g filter="url(#ambient-watercolor)">
          <ellipse cx={980} cy={160} rx={360} ry={500} fill="oklch(62% 0.13 65 / 0.42)" />
          <ellipse cx={180} cy={780} rx={440} ry={600} fill="oklch(38% 0.10 240 / 0.55)" />
          <ellipse cx={820} cy={640} rx={280} ry={380} fill="oklch(28% 0.08 240 / 0.40)" />
          <ellipse cx={520} cy={20} rx={380} ry={180} fill="oklch(72% 0.10 65 / 0.28)" />
          <ellipse cx={120} cy={280} rx={240} ry={320} fill="oklch(50% 0.08 240 / 0.32)" />
        </g>
      </svg>
    </>
  );
}
