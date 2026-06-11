interface Props { icon?: string; message: string }

export default function EmptyState({ icon = "◌", message }: Props) {
  return (
    <div className="empty">
      <div className="ic">{icon}</div>
      <span dangerouslySetInnerHTML={{ __html: message }} />
    </div>
  );
}
