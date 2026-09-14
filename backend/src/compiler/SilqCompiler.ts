import type { CircuitModel, Diagnostic, SilqCompiler as SilqCompilerContract } from "../contracts";
import { CircuitGenerator } from "./CircuitGenerator";
import { IRGenerator } from "./IRGenerator";
import { Lexer } from "./Lexer";
import { OpenQasmGenerator } from "./OpenQasmGenerator";
import { Parser } from "./Parser";
import { SemanticAnalyzer } from "./SemanticAnalyzer";
import type { CompilationResult, ProgramNode } from "./types";

export class SilqCompiler implements SilqCompilerContract {
  constructor(private readonly lexer = new Lexer(), private readonly parser = new Parser(), private readonly analyzer = new SemanticAnalyzer(), private readonly irGenerator = new IRGenerator(), private readonly qasmGenerator = new OpenQasmGenerator(), private readonly circuitGenerator = new CircuitGenerator()) {}
  async analyze(source: string): Promise<CompilationResult> { const tokens = this.lexer.tokenize(source); const parsed = this.parser.parse(tokens); const semantic = this.analyzer.analyze(parsed.ast); const generated = this.irGenerator.generate(parsed.ast); const diagnostics = [...parsed.diagnostics, ...semantic.diagnostics, ...generated.diagnostics]; return { tokens, ast: parsed.ast, semantic, ir: generated.ir, qasm: this.qasmGenerator.generate(generated.ir), circuit: this.circuitGenerator.generate(generated.ir), diagnostics }; }
  async parse(source: string): Promise<ProgramNode> { return (await this.analyze(source)).ast; }
  async compile(source: string): Promise<Uint8Array> { return new TextEncoder().encode((await this.analyze(source)).qasm); }
  async diagnostics(source: string): Promise<Diagnostic[]> { return (await this.analyze(source)).diagnostics; }
  async generateCircuit(source: string): Promise<CircuitModel> { return (await this.analyze(source)).circuit; }
}
