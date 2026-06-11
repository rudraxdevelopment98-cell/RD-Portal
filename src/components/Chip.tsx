import React from "react";

type Tone = "coral" | "gold" | "sage" | "slate" | "";

interface Props {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  style?: React.CSSProperties;
}

export default function Chip({ tone = "", children, dot, style }: Props) {
  return (
    <span className={`chip ${tone}`} style={style}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function priorityChip(p: string) {
  const t: Record<string, Tone> = { Critical: "coral", High: "gold", Medium: "slate", Low: "slate" };
  return <Chip tone={t[p] ?? "slate"}>{p}</Chip>;
}

export function statusChip(s: string) {
  const t: Record<string, Tone> = { Done: "sage", "In progress": "coral", "To do": "slate" };
  return <Chip tone={t[s] ?? "slate"} dot>{s}</Chip>;
}
