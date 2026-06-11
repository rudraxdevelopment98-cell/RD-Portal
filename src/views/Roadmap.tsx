import { useState } from "react";
import { usePortal } from "../context/PortalContext";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import GitHubPanel from "../components/GitHubPanel";
import type { Phase } from "../lib/types";
import { Store } from "../lib/store";

function defaultPhases(): Phase[] {
  return [
    { num: "1", label: "Phase 1", name: "Planning", status: "active" },
    { num: "2", label: "Phase 2", name: "Build", status: "" },
    { num: "3", label: "Phase 3", name: "Test", status: "" },
    { num: "4", label: "Phase 4", name: "Launch", status: "" },
  ];
}

export default function Roadmap() {
  const { proj, isManager, reload } = usePortal();
  const [editing, setEditing] = useState(false);
  const [editPhases, setEditPhases] = useState<Phase[]>([]);

  if (!proj) return <EmptyState icon="◎" message="No project selected." />;

  const phases: Phase[] = proj.phases?.length ? proj.phases : defaultPhases();
  const doneCount = phases.filter((p) => p.status === "done").length;
  const activePhase = phases.find((p) => p.status === "active");

  const openEdit = () => {
    setEditPhases(phases.map((p) => ({ ...p })));
    setEditing(true);
  };

  const updatePhase = (i: number, key: keyof Phase, value: string) => {
    setEditPhases((prev) => prev.map((p, idx) => idx === i ? { ...p, [key]: value } : p));
  };

  const addPhase = () => {
    const n = editPhases.length + 1;
    setEditPhases((prev) => [...prev, { num: String(n), label: `Phase ${n}`, name: "", status: "" }]);
  };

  const removePhase = (i: number) => {
    setEditPhases((prev) => prev.filter((_, idx) => idx !== i));
  };

  const savePhases = async () => {
    const cleaned = editPhases.map((p, i) => ({
      ...p,
      num: p.num || String(i + 1),
      label: p.label || `Phase ${i + 1}`,
    }));
    await Store.updateProject(proj.id, { phases: cleaned });
    await Store.addActivity("Updated the roadmap");
    setEditing(false);
    await reload();
  };

  return (
    <>
      <div className="page-h">
        <div>
          <h1>{proj.name} · Roadmap</h1>
          <p>{proj.desc || "Project phases and milestones."}</p>
        </div>
        {isManager && (
          <div className="actions">
            <button className="btn ghost sm" onClick={openEdit}>✎ Edit roadmap</button>
          </div>
        )}
      </div>

      {/* Phase summary */}
      {activePhase && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "10px 16px", background: "var(--panel-2)", borderRadius: 10, border: "1px solid var(--line-soft)" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--coral)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Currently active
          </span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{activePhase.label} · {activePhase.name}</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)" }}>
            {doneCount} of {phases.length} phases done
          </span>
        </div>
      )}

      {/* Stepper */}
      <div className="card">
        <div className="bd" style={{ padding: "28px 24px" }}>
          <div className="stepper">
            {phases.map((ph, i) => (
              <div key={i} className={`step ${ph.status}`}>
                <div className="ddot">{ph.num || i + 1}</div>
                <div className="t">{ph.label}</div>
                <div className="s">{ph.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* GitHub sync */}
      {proj.repo && (
        <div style={{ marginTop: 16 }}>
          <div className="shead">
            <h3>GitHub</h3><div className="ln" />
          </div>
          <GitHubPanel repo={proj.repo} />
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title={`Edit roadmap — ${proj.name}`} onClose={() => setEditing(false)} onOk={savePhases} okLabel="Save roadmap">
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--muted)" }}>
            Mark phases as <b style={{ color: "var(--coral)" }}>active</b> (current) or <b style={{ color: "var(--sage)" }}>done</b> (completed). Only one active phase at a time.
          </p>
          {editPhases.map((ph, i) => (
            <div key={i} className="row" style={{ marginBottom: 9, alignItems: "center" }}>
              <input
                value={ph.label}
                onChange={(e) => updatePhase(i, "label", e.target.value)}
                placeholder={`Phase ${i + 1}`}
                style={{ flex: "0 0 110px" }}
              />
              <input
                value={ph.name}
                onChange={(e) => updatePhase(i, "name", e.target.value)}
                placeholder="Phase name"
                style={{ flex: 2 }}
              />
              <select
                value={ph.status}
                onChange={(e) => updatePhase(i, "status", e.target.value)}
                style={{ flex: "0 0 110px" }}
              >
                <option value="">Upcoming</option>
                <option value="active">Active</option>
                <option value="done">Done</option>
              </select>
              <button
                className="btn danger sm"
                style={{ flex: "none" }}
                onClick={() => removePhase(i)}
              >✕</button>
            </div>
          ))}
          <button className="btn ghost sm" style={{ marginTop: 4 }} onClick={addPhase}>+ Add phase</button>
        </Modal>
      )}
    </>
  );
}
