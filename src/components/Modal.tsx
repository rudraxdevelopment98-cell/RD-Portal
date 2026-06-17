import React, { useEffect } from "react";

interface Props {
  title: string;
  onClose: () => void;
  onOk?: () => void;
  okLabel?: string;
  okDisabled?: boolean;
  hideCancel?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}

export default function Modal({ title, onClose, onOk, okLabel = "Save", okDisabled, hideCancel, wide, children }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={wide ? "modal wide" : "modal"}>
        <div className="mh">
          <h3>{title}</h3>
          <span className="x" onClick={onClose}>✕</span>
        </div>
        <div className="mb">{children}</div>
        <div className="mf">
          {!hideCancel && <button className="btn ghost" onClick={onClose}>Cancel</button>}
          {onOk && <button className="btn primary" onClick={onOk} disabled={okDisabled}>{okLabel}</button>}
        </div>
      </div>
    </div>
  );
}
