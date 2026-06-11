import { useState } from "react";
import { usePortal } from "../context/PortalContext";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { Store } from "../lib/store";
import { fmt } from "../lib/util";

export default function Research() {
  const { state, proj, myRole, inProj, reload } = usePortal();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", url: "", category: "Reference", note: "" });

  if (!proj) return <EmptyState icon="⌕" message="No project selected." />;

  const items = inProj(state.research);
  const canAdd = ["Owner", "Admin", "Manager", "Member"].includes(myRole ?? "");
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!form.title.trim()) return alert("Title required");
    await Store.createResearch({ ...form });
    await Store.addActivity("Added research: " + form.title);
    setAdding(false);
    setForm({ title: "", url: "", category: "Reference", note: "" });
    await reload();
  };

  const CATS = ["Reference", "Paper", "Disclosure", "Competitor", "Note"];

  return (
    <>
      <div className="page-h">
        <div><h1>Research</h1><p>Sources &amp; notes for {proj.name}.</p></div>
        {canAdd && (
          <div className="actions">
            <button className="btn primary" onClick={() => setAdding(true)}>+ Add entry</button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon="⌕" message="No research entries yet." />
      ) : (
        <div className="grid c2">
          {items.map((r) => (
            <div key={r.id} className="card">
              <div className="bd">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span className="chip">{r.category}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>{fmt(r.date)}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{r.title}</div>
                <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.55 }}>{r.note}</div>
                {r.url && (
                  <a className="btn ghost sm" style={{ marginTop: 12, display: "inline-flex" }} href={r.url} target="_blank" rel="noopener noreferrer">
                    Open source ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <Modal title="Add research entry" onClose={() => setAdding(false)} onOk={save} okLabel="Add entry">
          <label className="field"><span>Title</span>
            <input value={form.title} onChange={f("title")} placeholder="Source or topic name" autoFocus />
          </label>
          <label className="field"><span>URL (optional)</span>
            <input value={form.url} onChange={f("url")} placeholder="https://…" type="url" />
          </label>
          <label className="field"><span>Category</span>
            <select value={form.category} onChange={f("category")}>
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field"><span>Note</span>
            <textarea value={form.note} onChange={f("note") as any} rows={3} placeholder="What's important about this?" />
          </label>
        </Modal>
      )}
    </>
  );
}
