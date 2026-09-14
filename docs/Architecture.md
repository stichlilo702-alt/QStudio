# Architecture

QStudio is an Electron desktop application with a React renderer and TypeScript compiler and simulation modules. The main process owns filesystem dialogs, workspace file I/O, terminal execution, and optional AI provider calls. The renderer receives those capabilities through a narrow, context-isolated preload API and uses a Zustand store for UI state.

The compiler, language adapters, simulator, debugger, and circuit model currently run locally in the renderer bundle. The `backend`, `simulator`, `ai`, and `extensions` directories contain concrete local implementations as well as contracts; hardware execution and cloud services are represented only by partial interfaces or extension points.

## Compiler pipeline

`Lexer → Parser → AST → SemanticAnalyzer → QuantumIR → OpenQasmGenerator → CircuitGenerator` is fully composed by `SilqCompiler`. Each stage can be substituted independently. The parser produces a typed tree consumed by the Monaco outline and AST explorer.

The state-vector simulator consumes `QuantumIR`, retaining a normalized complex amplitude vector and deriving probabilities, sampled measurements, registers, and Bloch vectors. `QuantumDebugger` replays deterministic IR prefixes to support stepping and historic state inspection.

```text
Renderer (React / Monaco)
  ├── compiler and language adapters → QuantumIR → circuit view
  ├── QuantumIR → state-vector simulator → debugger/output panels
  └── preload IPC → Electron main → filesystem, terminal, optional AI
```

## Dependency rules

- UI depends on contracts and injected services, never remote implementation details.
- The main process has exclusive Node filesystem authority.
- Provider credentials are read at runtime from environment variables and never bundled into the renderer.
