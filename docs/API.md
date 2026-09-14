# API Contracts

## `QuantumLanguageAdapter`

Interface defining a pluggable quantum language compiler/adapter:

- `id`: Unique language identifier (`"silq"`, `"openqasm3"`, `"qsharp"`, `"quil"`, `"openqasm2"`).
- `name`: User-facing display title.
- `extensions`: Associated file extension list (`[".silq"]`, `[".qasm", ".qasm3"]`, `[".qs"]`, `[".quil"]`, `[".qasm", ".qasm2"]`).
- `monacoLanguageId`: Monaco editor language syntax ID.
- `capabilities`: Supported quantum feature flags (`gates`, `measurement`, `reset`, `controlledGates`, `multiQubitGates`).
- `examplePrograms`: Canonical runnable code examples for the language.
- `compile(source)`: Compiles quantum source into `CompilationResult` (containing `tokens`, `ast`, `semantic`, `ir`, `qasm`, `circuit`, `diagnostics`).
- `diagnostics(source)`: Returns line/column-targeted `Diagnostic[]` markers.
- `format?(source)`: Optional formatter.

## `LanguageRegistry`

Central registry for quantum language adapters:

- `register(adapter)`: Registers an adapter, preventing duplicates.
- `get(id)`: Retrieves an adapter by language ID.
- `list()`: Lists all registered quantum language adapters.
- `detectByExtension(path)`: Detects language from filename or file extension.
- `detectByContent(source)`: Detects language by inspecting headers or grammar keywords.
- `detect(path?, source?)`: Resolves the appropriate language adapter with Silq fallback.

## `SilqCompiler`

`parse(source)`, `compile(source)`, `diagnostics(source)`, and `generateCircuit(source)` form the compiler boundary. `SilqCompiler` composes the lexer, parser, semantic analyzer, IR, OpenQASM, and circuit stages.

## `QuantumSimulator` & `StateVectorSimulator`

`compile(source, languageId?)`, `run(source, shots, languageId?)`, `runIR(ir, shots)`, `measure(qubit)`, and `stop()` abstract simulators. `StateVectorSimulator` executes exact small-circuit state-vector simulation over 1–12 qubits for all registered quantum languages. `StateVectorResult` includes the single inspection run's probabilities, state vector, registers, and ordered measurement results, while `counts` aggregates independent shots.

Measurement uses computational-basis projective collapse and reset returns a qubit to $|0\rangle$. The shared IR does not yet model classical-register destinations or classical control flow, and no hardware backend is implemented.

## `QuantumDebugger`

Provides step-by-step historic state inspection and breakpoint management over `QuantumIR` operations produced by any quantum language adapter.

## `AIProvider`

`complete({ prompt, context })` returns a provider response. Provider implementations must obtain secrets from process environment at the trusted backend boundary.

## `HardwareBackend`

Adapters identify their vendor as IBM Quantum, Google Quantum AI, IonQ, Quantinuum, or Rigetti. The interface specifies execution, status, and cancellation only; no provider credentials or transport details are coupled to the IDE.

## Extension API

Extensions receive `commands`, `languages`, `themes`, `snippets`, and `panels` registries during `activate(api)`.
