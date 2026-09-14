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

const OQ3_KEYWORDS = new Set([
  "OPENQASM",
  "include",
  "qubit",
  "bit",
  "qreg",
  "creg",
  "gate",
  "measure",
  "reset",
  "barrier",
]);

const GATE_OPCODES: Record<string, IROperation["opcode"]> = {
  h: "h",
  x: "x",
  y: "y",
  z: "z",
  s: "s",
  t: "t",
  cx: "cx",
  cnot: "cx",
  cz: "cz",
  swap: "swap",
};

export class OpenQasm3Parser {
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

      // Line comment
      if (char === "/" && source[position + 1] === "/") {
        let value = "";
        while (position < source.length && source[position] !== "\n") {
          value += advance();
        }
        push("comment", value, start, startLine, startColumn);
        continue;
      }

      // Block comment
      if (char === "/" && source[position + 1] === "*") {
        let value = advance() + advance();
        while (position < source.length && !(source[position] === "*" && source[position + 1] === "/")) {
          value += advance();
        }
        if (position < source.length) {
          value += advance() + advance();
        }
        push("comment", value, start, startLine, startColumn);
        continue;
      }

      // Arrow ->
      if (char === "-" && source[position + 1] === ">") {
        advance();
        advance();
        push("symbol", "->", start, startLine, startColumn);
        continue;
      }

      // Identifier / Keyword
      if (/[A-Za-z_]/.test(char)) {
        let value = "";
        while (/[A-Za-z0-9_]/.test(source[position] ?? "")) {
          value += advance();
        }
        push(OQ3_KEYWORDS.has(value) ? "keyword" : "identifier", value, start, startLine, startColumn);
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

      // Strings (e.g. "stdgates.inc")
      if (char === '"' || char === "'") {
        const quote = char;
        let value = advance();
        while (position < source.length && source[position] !== quote) {
          value += advance();
        }
        if (source[position] === quote) {
          value += advance();
        }
        push("string", value, start, startLine, startColumn);
        continue;
      }

      // Single-character symbols
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

      // Header: OPENQASM 3.0; / OPENQASM 3;
      if (current.value === "OPENQASM") {
        this.next(tokens);
        const versionToken = this.peek(tokens);
        if (versionToken.kind === "number" || versionToken.value.startsWith("3")) {
          this.next(tokens);
        } else {
          this.error(versionToken, `Expected OpenQASM version '3.0' or '3', got '${versionToken.value}'`);
        }
        this.consumeUntil(tokens, ";");
        continue;
      }

      // Include: include "stdgates.inc";
      if (current.value === "include") {
        this.next(tokens);
        this.consumeUntil(tokens, ";");
        continue;
      }

      // Qubit declaration: qubit[2] q; or qubit q;
      if (current.value === "qubit" || current.value === "qreg") {
        const start = this.next(tokens);
        let size = 1;

        if (this.at(tokens, "[")) {
          this.next(tokens);
          const sizeToken = this.expect(tokens, "number");
          size = Number(sizeToken.value || "1");
          this.expectValue(tokens, "]");
        }

        const nameToken = this.expect(tokens, "identifier");
        this.consumeUntil(tokens, ";");
        const nodeRange = this.range(start, this.previous(tokens));

        if (size < 1 || size > 12) {
          this.diagnostics.push({
            severity: "error",
            message: "The local state-vector simulator supports 1–12 qubits.",
            line: nodeRange.line,
            column: nodeRange.column,
            endLine: nodeRange.line,
            endColumn: nodeRange.column + nameToken.value.length,
            range: nodeRange,
          });
        }

        if (symbols.has(nameToken.value)) {
          this.diagnostics.push({
            severity: "error",
            message: `Duplicate declaration '${nameToken.value}'.`,
            line: nodeRange.line,
            column: nodeRange.column,
            endLine: nodeRange.line,
            endColumn: nodeRange.column + nameToken.value.length,
            range: nodeRange,
          });
        } else {
          symbols.set(nameToken.value, { kind: "qubit", size, range: nodeRange, references: [] });
          totalQubits += size;
        }

        const qNode: QubitDeclarationNode = {
          kind: "QubitDeclaration",
          name: nameToken.value,
          size,
          range: nodeRange,
        };
        body.push(qNode);
        continue;
      }

      // Classical Bit declaration: bit[2] c; or bit c;
      if (current.value === "bit" || current.value === "creg") {
        const start = this.next(tokens);
        let size = 1;

        if (this.at(tokens, "[")) {
          this.next(tokens);
          const sizeToken = this.expect(tokens, "number");
          size = Number(sizeToken.value || "1");
          this.expectValue(tokens, "]");
        }

        const nameToken = this.expect(tokens, "identifier");
        this.consumeUntil(tokens, ";");
        const nodeRange = this.range(start, this.previous(tokens));

        symbols.set(nameToken.value, { kind: "variable", size, range: nodeRange, references: [] });
        body.push({
          kind: "Variable",
          name: nameToken.value,
          range: nodeRange,
        });
        continue;
      }

      // Measure assignment syntax: c[0] = measure q[0]; or c = measure q;
      if (current.kind === "identifier" && this.isMeasureAssignment(tokens)) {
        const start = this.next(tokens); // bit name
        this.consumeUntil(tokens, "=");
        this.expectValue(tokens, "measure");
        const qRef = this.parseQubitRef(tokens, symbols);
        this.consumeUntil(tokens, ";");

        if (qRef) {
          const gateNode: GateNode = {
            kind: "Gate",
            gate: "measure",
            targets: [qRef],
            controls: [],
            range: this.range(start, this.previous(tokens)),
          };
          body.push(gateNode);
          operations.push({
            opcode: "measure",
            targets: [qRef.index],
            controls: [],
            source: gateNode.range,
          });
        }
        continue;
      }

      // Measure statement syntax: measure q[0] -> c[0]; or measure q[0];
      if (current.value === "measure") {
        const start = this.next(tokens);
        const qRef = this.parseQubitRef(tokens, symbols);
        if (this.at(tokens, "->")) {
          this.next(tokens);
          this.consumeBitRef(tokens);
        }
        this.consumeUntil(tokens, ";");

        if (qRef) {
          const gateNode: GateNode = {
            kind: "Gate",
            gate: "measure",
            targets: [qRef],
            controls: [],
            range: this.range(start, this.previous(tokens)),
          };
          body.push(gateNode);
          operations.push({
            opcode: "measure",
            targets: [qRef.index],
            controls: [],
            source: gateNode.range,
          });
        }
        continue;
      }

      // Reset statement: reset q[0];
      if (current.value === "reset") {
        const start = this.next(tokens);
        const qRef = this.parseQubitRef(tokens, symbols);
        this.consumeUntil(tokens, ";");

        if (qRef) {
          const gateNode: GateNode = {
            kind: "Gate",
            gate: "reset",
            targets: [qRef],
            controls: [],
            range: this.range(start, this.previous(tokens)),
          };
          body.push(gateNode);
          operations.push({
            opcode: "reset",
            targets: [qRef.index],
            controls: [],
            source: gateNode.range,
          });
        }
        continue;
      }

      // Barrier statement: barrier q[0], q[1];
      if (current.value === "barrier") {
        this.next(tokens);
        this.consumeUntil(tokens, ";");
        continue;
      }

      // Quantum Gates: h, x, y, z, s, t, cx, cnot, cz, swap
      const gateLower = current.value.toLowerCase();
      if (GATE_OPCODES[gateLower]) {
        const start = this.next(tokens);
        const refs: QubitRef[] = [];

        while (!this.at(tokens, "eof") && !this.at(tokens, ";")) {
          if (this.peek(tokens).kind === "identifier") {
            const qRef = this.parseQubitRef(tokens, symbols);
            if (qRef) refs.push(qRef);
          } else if (this.at(tokens, ",")) {
            this.next(tokens);
          } else {
            this.next(tokens);
          }
        }
        this.consumeUntil(tokens, ";");
        const nodeRange = this.range(start, this.previous(tokens));

        const opcode = GATE_OPCODES[gateLower]!;
        let targets: QubitRef[] = [];
        let controls: QubitRef[] = [];

        if (opcode === "cx" || opcode === "cz") {
          if (refs.length < 2) {
            this.diagnostics.push({
              severity: "error",
              message: `${gateLower.toUpperCase()} requires two qubits (control, target).`,
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

      // Syntax error fallback
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

  private consumeBitRef(tokens: Token[]): void {
    if (this.peek(tokens).kind === "identifier") {
      this.next(tokens);
      if (this.at(tokens, "[")) {
        this.next(tokens);
        if (this.peek(tokens).kind === "number") this.next(tokens);
        if (this.at(tokens, "]")) this.next(tokens);
      }
    }
  }

  private isMeasureAssignment(tokens: Token[]): boolean {
    let offset = 0;
    let foundEquals = false;
    while (true) {
      const tok = this.peekAhead(tokens, offset++);
      if (tok.kind === "eof" || tok.value === ";") break;
      if (tok.value === "=") foundEquals = true;
      if (foundEquals && tok.value === "measure") return true;
    }
    return false;
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

  private peekAhead(tokens: Token[], offset: number): Token {
    return tokens[this.cursor + offset] ?? tokens[tokens.length - 1];
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
