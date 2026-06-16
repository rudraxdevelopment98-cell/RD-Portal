import type { TreeNode } from "../lib/types";

const FOLDER_ICON: Record<string, string> = {
  src: "◉", web: "◉", app: "◉", components: "❖", lib: "▤", supabase: "⬢",
  docs: "▦", ".github": "⚙", public: "◳", api: "⇄", server: "⇄", tests: "✓", test: "✓",
};

function iconFor(node: TreeNode): string {
  if (node.type === "file") return "·";
  return FOLDER_ICON[node.name] ?? "▸";
}

function Node({ node, depth }: { node: TreeNode; depth: number }) {
  const kids = node.children ?? [];
  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 16 }}>
      {depth > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 8px",
            borderRadius: 7,
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: node.type === "dir" ? "var(--txt)" : "var(--muted)",
          }}
        >
          <span style={{ color: node.type === "dir" ? "var(--coral)" : "var(--faint)", width: 14, textAlign: "center" }}>
            {iconFor(node)}
          </span>
          <span style={{ fontWeight: node.type === "dir" ? 600 : 400 }}>
            {node.name}{node.type === "dir" ? "/" : ""}
          </span>
        </div>
      )}
      {kids.length > 0 && (
        <div style={{ borderLeft: depth > 0 ? "1px solid var(--line-soft)" : "none", marginLeft: depth > 0 ? 6 : 0 }}>
          {kids.map((c) => <Node key={c.path} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export default function RepoTree({ tree }: { tree: TreeNode | null | undefined }) {
  if (!tree || !tree.children?.length) {
    return <div style={{ color: "var(--muted)", fontSize: 13 }}>No structure data — sync the repo to generate it.</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <Node node={tree} depth={0} />
    </div>
  );
}
