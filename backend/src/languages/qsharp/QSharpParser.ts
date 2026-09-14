import type { Diagnostic } from "../../contracts";
import type {
  CompilationResult,
  GateNode,
  IROperation,
  ProgramNode,
  QubitDeclarationNode,
  QubitRef,
  Range,
  SemanticModel,
  StatementNode,
  Token,
  TokenKind,
} from "../../compiler/types";
import { CircuitGenerator } from "../../compiler/CircuitGenerator";
import { OpenQasmGenerator } from "../../compiler/OpenQasmGenerator";

const QSHARP_KEYWORDS = new Set([
  "namespace",
  "open",
  "operation",
  "function",
  "body",
  "use",
  "borrow",
  "let",
  "mutable",
  "set",
  "return",
  "if",
  "elif",
  "else",
  "for",
  "in",
  "while",
  "repeat",
  "until",
  "fixup",
  "within",
  "apply",
  "Adjoint",
  "Controlled",
  "is",
  "newtype",
  "Unit",
  "Result",
  "Qubit",
  "Int",
  "Double",
  "Bool",
  "Pauli",
  "String",
  "Zero",
  "One",
  "H",
  "X",
  "Y",
  "Z",
  "S",
  "T",
  "CNOT",
  "CZ",
  "SWAP",
  "M",
  "Reset",
  "ResetAll",
]);

const GATE_OPCODES: Record<string, IROperation["opcode"]> = {
  h: "h",
  x: "x",
  y: "y",
  z: "z",
  s: "s",
  t: "t",
  cnot: "cx",
  cx: "cx",
  cz: "cz",
  swap: "swap",
  m: "measure",
  reset: "reset",
  resetall: "reset",
};

export class QSharpParser {
  private cursor = 0;
  private diagnostics: Diagnostic[] = [];

  tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let position = 0;
    let line = 1;
    let column = 1;

    const push = (kind: TokenKind, value: string, start: number, startLine: number, startColumn: number) => {
      tokens.push({
        kind,
        value,
        start,
        end: position,
        line: startLine,
        column: startColumn,
      });
    };

    const advance = (): string => {
      const char = source[position++] ?? "";
      if (char === "\n") {
        line++;
        column = 1;
      } else {
        column++;
      }
      return char;
    };

    while (position < source.length) {
      const char = source[position];
      if (/\s/.test(char)) {
        advance();
        continue;
      }

      const start = position;
      const startLine = line;
      const startColumn = column;

      // Line comments: //
      if (char === "/" && source[position + 1] === "/") {
        let value = "";
        while (position < source.length && source[position] !== "\n") {
          value += advance();
        }
        push("comment", value, start, startLine, startColumn);
        continue;
      }

      // Identifiers / Keywords (including dotted namespace components)
      if (/[A-Za-z_]/.test(char)) {
        let value = "";
        while (/[A-Za-z0-9_]/.test(source[position] ?? "")) {
          value += advance();
        }
        push(QSHARP_KEYWORDS.has(value) ? "keyword" : "identifier", value, start, startLine, startColumn);
        continue;
      }

      // Numbers
      if (/\d/.test(char)) {
        let value = "";
        while (/\d/.test(source[position] ?? "")) {
          value += advance();
        }
        if (source[position] === "." && /\d/.test(source[position + 1] ?? "")) {
          value += advance();
          while (/\d/.test(source[position] ?? "")) {
            value += advance();
          }
        }
        push("number", value, start, startLine, startColumn);
        continue;
      }

      // Strings
      if (char === '"') {
        let value = advance();
        while (position < source.length && source[position] !== '"') {
          value += advance();
        }
        if (source[position] === '"') value += advance();
        push("string", value, start, startLine, startColumn);
        continue;
      }

      // Single symbol
      advance();
      push("symbol", char, start, startLine, startColumn);
    }

    tokens.push({ kind: "eof", value: "", start: position, end: position, line, column });
    return tokens;
  }

  parse(source: string): CompilationResult {
    const tokens = this.tokenize(source);
    this.cursor = 0;
    this.diagnostics = [];

    const body: StatementNode[] = [];
    const symbols = new Map<string, { kind: "qubit" | "variable"; size?: number; range: Range; references: Range[] }>();
    const operations: IROperation[] = [];
    let totalQubits = 0;

    const firstToken = tokens[0] ?? { start: 0, end: 0, line: 1, column: 1 };
    const lastToken = tokens[tokens.length - 1] ?? firstToken;

    while (!this.at(tokens, "eof")) {
      const current = this.peek(tokens);

      if (current.kind === "comment" || current.value === ";") {
        this.next(tokens);
        continue;
      }

      // namespace Name { ... }
      if (current.value === "namespace") {
        this.next(tokens);
        this.consumeNamespaceOrDotted(tokens);
        this.consumeUntil(tokens, "{");
        continue;
      }

      // open Namespace;
      if (current.value === "open") {
        this.next(tokens);
        this.consumeUntil(tokens, ";");
        continue;
      }

      // operation Name() : Type { ... }
      if (current.value === "operation" || current.value === "function") {
        const start = this.next(tokens);
        const nameToken = this.expect(tokens, "identifier");
        this.consumeUntil(tokens, "{");
        body.push({
          kind: "Function",
          name: nameToken.value,
          body: [],
          range: this.range(start, this.previous(tokens)),
        });
        continue;
      }

      // use q = Qubit[2]; or use (q0, q1) = (Qubit(), Qubit());
      if (current.value === "use" || current.value === "borrow") {
        const start = this.next(tokens);
        const regName = this.expect(tokens, "identifier");
        this.expectValue(tokens, "=");

        let size = 1;
        if (this.at(tokens, "Qubit")) {
          this.next(tokens);
          if (this.at(tokens, "[")) {
            this.next(tokens);
            const sizeToken = this.expect(tokens, "number");
            size = Number(sizeToken.value || "1");
            this.expectValue(tokens, "]");
          } else if (this.at(tokens, "(")) {
            this.next(tokens);
            this.expectValue(tokens, ")");
            size = 1;
          }
        }
        this.consumeUntil(tokens, ";");
        const nodeRange = this.range(start, this.previous(tokens));

        if (size < 1 || size > 12) {
          this.diagnostics.push({
            severity: "error",
            message: "The local state-vector simulator supports 1–12 qubits.",
            line: nodeRange.line,
            column: nodeRange.column,
            endLine: nodeRange.line,
            endColumn: nodeRange.column + regName.value.length,
            range: nodeRange,
          });
        }

        if (symbols.has(regName.value)) {
          this.diagnostics.push({
            severity: "error",
            message: `Duplicate declaration '${regName.value}'.`,
            line: nodeRange.line,
            column: nodeRange.column,
            endLine: nodeRange.line,
            endColumn: nodeRange.column + regName.value.length,
            range: nodeRange,
          });
        } else {
          symbols.set(regName.value, { kind: "qubit", size, range: nodeRange, references: [] });
          totalQubits += size;
        }

        const qNode: QubitDeclarationNode = {
          kind: "QubitDeclaration",
          name: regName.value,
          size,
          range: nodeRange,
        };
        body.push(qNode);
        continue;
      }

      // let / mutable declarations: let results = [M(q[0]), M(q[1])];
      if (current.value === "let" || current.value === "mutable") {
        const start = this.next(tokens);
        const varName = this.expect(tokens, "identifier");
        this.consumeUntil(tokens, "=");

        // Check if there are M(...) calls inside the expression
        while (!this.at(tokens, "eof") && !this.at(tokens, ";")) {
          if (this.peek(tokens).value === "M") {
            const mStart = this.next(tokens);
            this.consumeUntil(tokens, "(");
            const qRef = this.parseQubitRef(tokens, symbols);
            this.consumeUntil(tokens, ")");
            if (qRef) {
              const gateNode: GateNode = {
                kind: "Gate",
                gate: "measure",
                targets: [qRef],
                controls: [],
                range: this.range(mStart, this.previous(tokens)),
              };
              body.push(gateNode);
              operations.push({
                opcode: "measure",
                targets: [qRef.index],
                controls: [],
                source: gateNode.range,
              });
            }
          } else {
            this.next(tokens);
          }
        }
        this.consumeUntil(tokens, ";");

        const nodeRange = this.range(start, this.previous(tokens));
        symbols.set(varName.value, { kind: "variable", range: nodeRange, references: [] });
        body.push({
          kind: "Variable",
          name: varName.value,
          range: nodeRange,
        });
        continue;
      }

      // return statement
      if (current.value === "return") {
        const start = this.next(tokens);
        this.consumeUntil(tokens, ";");
        body.push({
          kind: "Return",
          range: this.range(start, this.previous(tokens)),
        });
        continue;
      }

      // ResetAll(q); - In Q#, ResetAll is the release/deallocation cleanup idiom before returning
      if (current.value === "ResetAll") {
        const start = this.next(tokens);
        this.consumeUntil(tokens, "(");
        const regToken = this.expect(tokens, "identifier");
        this.consumeUntil(tokens, ")");
        this.consumeUntil(tokens, ";");
        const nodeRange = this.range(start, this.previous(tokens));

        const symbol = symbols.get(regToken.value);
        body.push({
          kind: "Gate",
          gate: "resetall",
          targets:
            symbol && symbol.size
              ? Array.from({ length: symbol.size }, (_, idx) => ({ name: regToken.value, index: idx, range: nodeRange }))
              : [],
          controls: [],
          range: nodeRange,
        });
        continue;
      }

      // Gates: H(q[0]); CNOT(q[0], q[1]); Reset(q[0]); M(q[0]);
      const gateLower = current.value.toLowerCase();
      if (GATE_OPCODES[gateLower]) {
        const start = this.next(tokens);
        this.consumeUntil(tokens, "(");
        const refs: QubitRef[] = [];

        while (!this.at(tokens, "eof") && !this.at(tokens, ")")) {
          if (this.peek(tokens).kind === "identifier") {
            const qRef = this.parseQubitRef(tokens, symbols);
            if (qRef) refs.push(qRef);
          } else {
            this.next(tokens);
          }
        }
        if (this.at(tokens, ")")) this.next(tokens);
        this.consumeUntil(tokens, ";");
        const nodeRange = this.range(start, this.previous(tokens));

        const opcode = GATE_OPCODES[gateLower]!;
        let targets: QubitRef[] = [];
        let controls: QubitRef[] = [];

        if (opcode === "cx" || opcode === "cz") {
          if (refs.length < 2) {
            this.diagnostics.push({
              severity: "error",
              message: `${current.value} requires two qubits (control, target).`,
              line: nodeRange.line,
              column: nodeRange.column,
              endLine: nodeRange.line,
              endColumn: nodeRange.column + current.value.length,
              range: nodeRange,
            });
          }
          controls = refs.slice(0, 1);
          targets = refs.slice(1, 2);
        } else if (opcode === "swap") {
          if (refs.length < 2) {
            this.diagnostics.push({
              severity: "error",
              message: "SWAP requires two target qubits.",
              line: nodeRange.line,
              column: nodeRange.column,
              endLine: nodeRange.line,
              endColumn: nodeRange.column + current.value.length,
              range: nodeRange,
            });
          }
          targets = refs.slice(0, 2);
        } else {
          targets = refs.slice(0, 1);
        }

        const gateNode: GateNode = {
          kind: "Gate",
          gate: gateLower,
          targets,
          controls,
          range: nodeRange,
        };
        body.push(gateNode);

        if (targets.length > 0 || controls.length > 0) {
          operations.push({
            opcode,
            targets: targets.map((t) => t.index),
            controls: controls.map((c) => c.index),
            source: nodeRange,
          });
        }
        continue;
      }

      // Closing brace of namespace / operation
      if (current.value === "}") {
        this.next(tokens);
        continue;
      }

      this.error(current, `Unexpected token or statement '${current.value}'`);
      this.next(tokens);
    }

    const ast: ProgramNode = {
      kind: "Program",
      body,
      range: this.range(firstToken, lastToken),
    };

    const semantic: SemanticModel = {
      symbols: symbols as SemanticModel["symbols"],
      diagnostics: this.diagnostics,
    };

    const ir = {
      qubits: Math.max(totalQubits, ...operations.flatMap((op) => [...op.targets, ...op.controls]).map((i) => i + 1)),
      operations,
    };

    const circuitGen = new CircuitGenerator();
    const qasmGen = new OpenQasmGenerator();

    return {
      tokens,
      ast,
      semantic,
      ir,
      qasm: qasmGen.generate(ir),
      circuit: circuitGen.generate(ir),
      diagnostics: this.diagnostics,
    };
  }

  private parseQubitRef(
    tokens: Token[],
    symbols: Map<string, { kind: "qubit" | "variable"; size?: number; range: Range; references: Range[] }>
  ): QubitRef | undefined {
    const start = this.expect(tokens, "identifier");
    let index = 0;

    if (this.at(tokens, "[")) {
      this.next(tokens);
      const indexToken = this.expect(tokens, "number");
      index = Number(indexToken.value || "0");
      this.expectValue(tokens, "]");
    }

    const range = this.range(start, this.previous(tokens));
    const symbol = symbols.get(start.value);

    if (!symbol) {
      this.diagnostics.push({
        severity: "error",
        message: `Unknown quantum register '${start.value}'.`,
        line: range.line,
        column: range.column,
        endLine: range.line,
        endColumn: range.column + start.value.length,
        range,
      });
      return { name: start.value, index, range };
    }

    if (symbol.kind !== "qubit") {
      this.diagnostics.push({
        severity: "error",
        message: `'${start.value}' is not a quantum register.`,
        line: range.line,
        column: range.column,
        endLine: range.line,
        endColumn: range.column + start.value.length,
        range,
      });
      return { name: start.value, index, range };
    }

    symbol.references.push(range);
    if (symbol.size !== undefined && (index < 0 || index >= symbol.size)) {
      this.diagnostics.push({
        severity: "error",
        message: `Invalid qubit index ${index} for register '${start.value}' (size ${symbol.size}).`,
        line: range.line,
        column: range.column,
        endLine: range.line,
        endColumn: range.column + start.value.length + 3,
        range,
      });
    }

    return { name: start.value, index, range };
  }

  private consumeNamespaceOrDotted(tokens: Token[]): void {
    while (!this.at(tokens, "eof") && !this.at(tokens, "{") && !this.at(tokens, ";")) {
      this.next(tokens);
    }
  }

  private consumeUntil(tokens: Token[], value: string): void {
    while (!this.at(tokens, "eof") && !this.at(tokens, value)) {
      this.next(tokens);
    }
    if (this.at(tokens, value)) {
      this.next(tokens);
    }
  }

  private expect(tokens: Token[], kind: Token["kind"]): Token {
    const token = this.peek(tokens);
    if (token.kind !== kind) {
      this.error(token, `Expected ${kind}, received '${token.value || "end of file"}'`);
    } else {
      this.next(tokens);
    }
    return token;
  }

  private expectValue(tokens: Token[], value: string): void {
    const token = this.peek(tokens);
    if (token.value !== value) {
      this.error(token, `Expected '${value}', received '${token.value || "end of file"}'`);
    } else {
      this.next(tokens);
    }
  }

  private error(token: Token, message: string): void {
    const endColumn = token.column + Math.max(1, token.value.length);
    this.diagnostics.push({
      severity: "error",
      message,
      line: token.line,
      column: token.column,
      endLine: token.line,
      endColumn,
      range: { start: token.start, end: token.end },
    });
  }

  private peek(tokens: Token[]): Token {
    return tokens[this.cursor] ?? tokens[tokens.length - 1];
  }

  private next(tokens: Token[]): Token {
    return tokens[this.cursor++] ?? tokens[tokens.length - 1];
  }

  private previous(tokens: Token[]): Token {
    return tokens[Math.max(0, this.cursor - 1)];
  }

  private at(tokens: Token[], value: string): boolean {
    const token = this.peek(tokens);
    return token.kind === value || token.value === value;
  }

  private range(start: Token, end: Token): Range {
    return { start: start.start, end: end.end, line: start.line, column: start.column };
  }
}
