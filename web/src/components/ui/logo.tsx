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
      style={{ color: "var(--color-primary)" }}
    >
      <rect width="32" height="32" rx="7" fill="#261C13" />
      <path
        d="M 8 23 V 9 L 16 18 L 24 9 V 23"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
