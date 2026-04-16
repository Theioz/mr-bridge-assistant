type Props = {
  greeting: string;
};

export default function DashboardGreeting({ greeting }: Props) {
  return (
    <h1
      className="font-heading"
      style={{
        fontSize: "var(--t-display)",
        lineHeight: 1.02,
        letterSpacing: "-0.025em",
        fontWeight: 400,
        margin: 0,
        color: "var(--color-text)",
      }}
    >
      {greeting}
    </h1>
  );
}
