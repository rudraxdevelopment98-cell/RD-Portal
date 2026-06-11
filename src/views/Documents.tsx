import { usePortal } from "../context/PortalContext";
import EmptyState from "../components/EmptyState";
import { Store } from "../lib/store";
import { fmt } from "../lib/util";

export default function Documents() {
  const { state, proj, myRole, inProj, assigneeName, reload } = usePortal();
  if (!proj) return <EmptyState icon="▤" message="No project selected." />;

  const docs = inProj(state.docs);
  const canUpload = ["Owner", "Admin", "Manager", "Member"].includes(myRole ?? "");

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const size = (f.size / 1024).toFixed(0) + " KB";
    const cat = f.type.includes("pdf") ? "PDF" : f.type.includes("image") ? "Image" : "File";
    if (Store.mode === "cloud") {
      await Store.createDoc({ name: f.name, category: cat, size, file: f } as any);
    } else {
      if (f.size <= 1_500_000) {
        const reader = new FileReader();
        reader.onload = async () => {
          await Store.createDoc({ name: f.name, category: cat, size, data: reader.result as string, by: Store.sessionUser()! });
          await Store.addActivity("Uploaded: " + f.name);
          await reload();
        };
        reader.readAsDataURL(f);
        return;
      }
      await Store.createDoc({ name: f.name, category: cat, size, data: null, by: Store.sessionUser()! });
    }
    await Store.addActivity("Uploaded: " + f.name);
    await reload();
    e.target.value = "";
  };

  const del = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    await Store.deleteDoc(id);
    await Store.addActivity("Deleted a document");
    await reload();
  };

  return (
    <>
      <div className="page-h">
        <div><h1>Documents</h1><p>Files for {proj.name}.</p></div>
        {canUpload && (
          <div className="actions">
            <label className="btn primary" style={{ cursor: "pointer" }}>
              + Upload
              <input type="file" style={{ display: "none" }} onChange={upload} />
            </label>
          </div>
        )}
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Name</th><th>Category</th><th>Size</th><th>By</th><th>Date</th><th /></tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18, opacity: 0.6 }}>▤</span>
                      <b>{d.name}</b>
                    </div>
                  </td>
                  <td><span className="chip">{d.category}</span></td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{d.size}</td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{assigneeName(d.by)}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--faint)" }}>{fmt(d.date)}</td>
                  <td style={{ textAlign: "right" }}>
                    {d.data && (
                      <a className="btn sm" href={d.data} target="_blank" rel="noopener noreferrer" download={d.name} style={{ marginRight: 6 }}>
                        Open
                      </a>
                    )}
                    <button className="btn danger sm" onClick={() => del(d.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!docs.length && <EmptyState icon="▤" message="No documents yet." />}
        </div>
      </div>
    </>
  );
}
