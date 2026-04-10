interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 32, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Mr. Bridge"
    >
      {/* Geometric background square */}
      <rect width="32" height="32" rx="7" fill="#1d4ed8" fillOpacity="0.15" />
      {/* M stroke */}
      <path
        d="M6 22V10l5 6 5-6v12"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* B strokes */}
      <path
        d="M18 10h5a2.5 2.5 0 0 1 0 5h-5V10z"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 15h5.5a2.5 2.5 0 0 1 0 5H18V15z"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 10v12"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
