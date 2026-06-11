import { avatarColor, initials } from "../lib/util";

interface Props {
  name: string;
  size?: number;
  radius?: string;
}

export default function Avatar({ name, size = 30, radius }: Props) {
  return (
    <div
      className="avatar"
      style={{
        background: avatarColor(name),
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        borderRadius: radius ?? (size <= 32 ? "9px" : "12px"),
      }}
    >
      {initials(name)}
    </div>
  );
}
