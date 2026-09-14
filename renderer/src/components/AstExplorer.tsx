import { useEffect, useState } from "react";
import type { ProgramNode, QubitRef, StatementNode } from "../../../backend/src/compiler/types";
import { useIDEStore } from "../store/ideStore";
import { defaultLanguageRegistry } from "../../../backend/src/languages";

export function AstExplorer(): JSX.Element {
  const tab = useIDEStore((state) => state.tabs.find((item) => item.id === state.activeTab));
  const source = tab?.content ?? "";
  const selectAst = useIDEStore((state) => state.selectAst);
  const [ast, setAst] = useState<ProgramNode>();

  const adapter = tab
    ? tab.language
      ? defaultLanguageRegistry.get(tab.language) ?? defaultLanguageRegistry.detect(tab.path ?? tab.title, source)
      : defaultLanguageRegistry.detect(tab.path ?? tab.title, source)
    : defaultLanguageRegistry.get("silq")!;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void adapter.compile(source).then((result) => {
        if (active) setAst(result.ast);
      });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [source, adapter]);

  return (
    <section className="ast">
      <div className="subheading">AST EXPLORER</div>
      {ast ? <AstNode node={ast} select={selectAst} /> : <p className="muted">Parsing AST...</p>}
    </section>
  );
}

function AstNode({
  node,
  select,
}: {
  node: ProgramNode | StatementNode;
  select(range: { start: number; end: number }): void;
}): JSX.Element {
  const children = node.kind === "Program" || node.kind === "Function" ? node.body : [];

  const getDetails = (): string => {
    switch (node.kind) {
      case "Function":
        return `fn ${node.name}`;
      case "QubitDeclaration":
        return `qubit: ${node.name}[${node.size}]`;
      case "Gate": {
        const tgt = node.targets.map((t: QubitRef) => `${t.name}[${t.index}]`).join(", ");
        const ctrl = node.controls.map((c: QubitRef) => `${c.name}[${c.index}]`).join(", ");
        return `${node.gate.toUpperCase()}(${tgt})${ctrl ? ` ctrl: ${ctrl}` : ""}`;
      }
      case "Variable":
        return `var: ${node.name}`;
      case "Return":
        return "return statement";
      default:
        return "";
    }
  };

  return (
    <details open className="ast-node">
      <summary onClick={() => select(node.range)}>
        <span className="ast-kind">{node.kind}</span>
        <span className="ast-detail">{getDetails()}</span>
      </summary>

      {children.length > 0 && (
        <div className="ast-children">
          {children.map((child: StatementNode, index: number) => (
            <AstNode
              key={`${child.range.start}-${index}`}
              node={child}
              select={select}
            />
          ))}
        </div>
      )}
    </details>
  );
}
