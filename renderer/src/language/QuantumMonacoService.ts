import type * as Monaco from "monaco-editor";
import type { QuantumLanguageAdapter } from "../../../backend/src/languages";
import { registerSilqLanguage, updateSilqDiagnostics } from "./SilqLanguageService";

let allLanguagesRegistered = false;

const GATE_DOCS: Record<string, string> = {
  h: "Hadamard (H): creates equal superposition (|0⟩ + |1⟩)/√2.",
  x: "Pauli-X: flips a qubit state |0⟩ ↔ |1⟩ (bit flip).",
  y: "Pauli-Y: bit and phase flip rotation.",
  z: "Pauli-Z: phase flip (|0⟩ → |0⟩, |1⟩ → -|1⟩).",
  s: "S Phase: π/2 phase gate.",
  t: "T Phase: π/4 phase gate.",
  cx: "Controlled-NOT (CNOT): flips target qubit when control qubit is |1⟩.",
  cnot: "Controlled-NOT (CNOT): flips target qubit when control qubit is |1⟩.",
  cz: "Controlled-Phase (CZ): applies phase flip when both qubits are |1⟩.",
  swap: "SWAP: exchanges quantum states between two qubits.",
  measure: "Measurement: projects quantum state onto computational Z-basis.",
  m: "Measurement: projects quantum state onto computational Z-basis.",
  reset: "Reset: returns active qubit state back to pure ground state |0⟩.",
  resetall: "ResetAll: resets all qubits in target array back to |0⟩.",
};

export function registerAllQuantumLanguages(monaco: typeof Monaco): void {
  registerSilqLanguage(monaco);

  if (allLanguagesRegistered) return;
  allLanguagesRegistered = true;

  // 1. OpenQASM 3.0
  monaco.languages.register({
    id: "openqasm3",
    extensions: [".qasm", ".qasm3"],
    aliases: ["OpenQASM 3", "openqasm3", "qasm3", "qasm"],
  });
  monaco.languages.setMonarchTokensProvider("openqasm3", {
    tokenizer: {
      root: [
        [/\/\/.*/, "comment"],
        [/\/\*[\s\S]*?\*\//, "comment"],
        [/\b(OPENQASM|include|def|gate|qubit|bit|qreg|creg|measure|reset|barrier|if|else|for|while|return|input|output|const)\b/, "keyword"],
        [/\b(h|x|y|z|s|t|cx|cnot|cz|swap|rx|ry|rz|u|u1|u2|u3|ccx)\b/i, "operator"],
        [/->/, "delimiter"],
        [/[{}()[\];,]/, "delimiter"],
        [/\d+(\.\d+)?/, "number"],
        [/"[^"\\]*"/, "string"],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration("openqasm3", {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
  });
  monaco.languages.registerCompletionItemProvider("openqasm3", {
    provideCompletionItems: (model, position) => {
      const word = model.getWordAtPosition(position);
      const range = word
        ? new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
        : new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);

      const suggestions = [
        {
          label: "h",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "h ${1:q[0]};",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: GATE_DOCS.h,
        },
        {
          label: "cx",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "cx ${1:q[0]}, ${2:q[1]};",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: GATE_DOCS.cx,
        },
        {
          label: "measure",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "measure ${1:q[0]} -> ${2:c[0]};",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: GATE_DOCS.measure,
        },
        {
          label: "header",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'OPENQASM 3.0;\ninclude "stdgates.inc";\n\nqubit[${1:2}] q;\nbit[${1:2}] c;\n\n${0}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: "OpenQASM 3.0 Header Template",
        },
      ];
      return { suggestions };
    },
  });
  monaco.languages.registerHoverProvider("openqasm3", {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const doc = GATE_DOCS[word.word.toLowerCase()];
      return doc ? { contents: [{ value: `**${word.word}**\n\n${doc}` }] } : null;
    },
  });

  // 2. OpenQASM 2.0
  monaco.languages.register({
    id: "openqasm2",
    extensions: [".qasm2"],
    aliases: ["OpenQASM 2.0", "openqasm2", "qasm2"],
  });
  monaco.languages.setMonarchTokensProvider("openqasm2", {
    tokenizer: {
      root: [
        [/\/\/.*/, "comment"],
        [/\b(OPENQASM|include|qreg|creg|gate|measure|reset|barrier|opaque|if)\b/, "keyword"],
        [/\b(h|x|y|z|s|t|cx|cz|swap|u1|u2|u3|id|ccx)\b/i, "operator"],
        [/->/, "delimiter"],
        [/[{}()[\];,]/, "delimiter"],
        [/\d+(\.\d+)?/, "number"],
        [/"[^"\\]*"/, "string"],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration("openqasm2", {
    comments: { lineComment: "//" },
    brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
  });

  // 3. Microsoft Q#
  monaco.languages.register({
    id: "qsharp",
    extensions: [".qs"],
    aliases: ["Q#", "qsharp", "qs"],
  });
  monaco.languages.setMonarchTokensProvider("qsharp", {
    tokenizer: {
      root: [
        [/\/\/.*/, "comment"],
        [/\b(namespace|open|operation|function|body|use|borrow|let|mutable|set|return|if|elif|else|for|in|while|repeat|until|fixup|within|apply|Adjoint|Controlled|is|newtype)\b/, "keyword"],
        [/\b(Unit|Result|Qubit|Int|Double|Bool|Pauli|String|Zero|One)\b/, "type"],
        [/\b(H|X|Y|Z|S|T|CNOT|CZ|SWAP|M|Reset|ResetAll|Message)\b/, "operator"],
        [/[{}()[\];,:]/, "delimiter"],
        [/\d+(\.\d+)?/, "number"],
        [/"[^"\\]*"/, "string"],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration("qsharp", {
    comments: { lineComment: "//" },
    brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
  });
  monaco.languages.registerCompletionItemProvider("qsharp", {
    provideCompletionItems: (model, position) => {
      const word = model.getWordAtPosition(position);
      const range = word
        ? new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
        : new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);

      const suggestions = [
        {
          label: "H",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "H(${1:q[0]});",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: GATE_DOCS.h,
        },
        {
          label: "CNOT",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "CNOT(${1:q[0]}, ${2:q[1]});",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: GATE_DOCS.cnot,
        },
        {
          label: "M",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "M(${1:q[0]})",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: GATE_DOCS.m,
        },
        {
          label: "operation",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "operation ${1:Main}() : Result[] {\n    use q = Qubit[${2:2}];\n    ${0}\n    ResetAll(q);\n    return [];\n}",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: "Q# Operation Template",
        },
      ];
      return { suggestions };
    },
  });
  monaco.languages.registerHoverProvider("qsharp", {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const doc = GATE_DOCS[word.word.toLowerCase()];
      return doc ? { contents: [{ value: `**${word.word}**\n\n${doc}` }] } : null;
    },
  });

  // 4. Quil
  monaco.languages.register({
    id: "quil",
    extensions: [".quil"],
    aliases: ["Quil", "quil"],
  });
  monaco.languages.setMonarchTokensProvider("quil", {
    tokenizer: {
      root: [
        [/#.*/, "comment"],
        [/\b(DECLARE|BIT|OCTET|INTEGER|REAL|COMPLEX|SHARING|OFFSET|PRAGMA|NOP|HALT|WAIT)\b/, "keyword"],
        [/\b(H|X|Y|Z|S|T|CNOT|CZ|SWAP|MEASURE|RESET|RX|RY|RZ|PHASE|CPHASE|CCNOT)\b/, "operator"],
        [/[()[\]]/, "delimiter"],
        [/\d+(\.\d+)?/, "number"],
        [/"[^"\\]*"/, "string"],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration("quil", {
    comments: { lineComment: "#" },
    brackets: [["[", "]"], ["(", ")"]],
    autoClosingPairs: [
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
  });
  monaco.languages.registerCompletionItemProvider("quil", {
    provideCompletionItems: (model, position) => {
      const word = model.getWordAtPosition(position);
      const range = word
        ? new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
        : new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);

      const suggestions = [
        {
          label: "H",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "H ${1:0}",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: GATE_DOCS.h,
        },
        {
          label: "CNOT",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "CNOT ${1:0} ${2:1}",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: GATE_DOCS.cnot,
        },
        {
          label: "MEASURE",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "MEASURE ${1:0} ro[${2:0}]",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: GATE_DOCS.measure,
        },
        {
          label: "DECLARE",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: "DECLARE ro BIT[${1:2}]\n\n${0}",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: "Quil Declare Template",
        },
      ];
      return { suggestions };
    },
  });
  monaco.languages.registerHoverProvider("quil", {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const doc = GATE_DOCS[word.word.toLowerCase()];
      return doc ? { contents: [{ value: `**${word.word}**\n\n${doc}` }] } : null;
    },
  });
}

export async function updateQuantumDiagnostics(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  adapter: QuantumLanguageAdapter
): Promise<void> {
  const diagnostics = await adapter.diagnostics(model.getValue());
  monaco.editor.setModelMarkers(
    model,
    adapter.id,
    diagnostics.map((item) => ({
      severity:
        item.severity === "error"
          ? monaco.MarkerSeverity.Error
          : item.severity === "warning"
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info,
      message: item.message,
      startLineNumber: item.line,
      startColumn: item.column,
      endLineNumber: item.endLine ?? item.line,
      endColumn: item.endColumn ?? item.column + 1,
    }))
  );
}

export { registerSilqLanguage, updateSilqDiagnostics };
