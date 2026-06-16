import { useState } from "react";
import Modal from "./Modal";
import { getToken, setToken } from "../lib/github";

export default function TokenSettings({ onClose }: { onClose: () => void }) {
  const existing = getToken();
  const [value, setValue] = useState(existing ?? "");
  const [saved, setSaved] = useState(false);

  const save = () => {
    setToken(value || null);
    setSaved(true);
    setTimeout(onClose, 600);
  };

  const clear = () => {
    setToken(null);
    setValue("");
    setSaved(true);
    setTimeout(onClose, 600);
  };

  return (
    <Modal title="GitHub access" onClose={onClose} onOk={save} okLabel={saved ? "Saved ✓" : "Save token"}>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
        Add a <b style={{ color: "var(--txt)" }}>personal access token</b> to read private repos and raise the
        rate limit to 5,000 calls/hour. A fine-grained token with read-only
        <b style={{ color: "var(--txt)" }}> Contents</b>, <b style={{ color: "var(--txt)" }}>Issues</b> and
        <b style={{ color: "var(--txt)" }}> Metadata</b> access is enough.
      </p>
      <label className="field">
        <span>Personal access token</span>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="github_pat_… or ghp_…"
          autoFocus
        />
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5 }}>
          Create a token ↗
        </a>
        {existing && (
          <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={clear}>
            Remove token
          </button>
        )}
      </div>
      <p style={{ margin: "16px 0 0", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>
        Stored only in this browser (localStorage) — never sent anywhere except GitHub, and never built into the site.
      </p>
    </Modal>
  );
}
