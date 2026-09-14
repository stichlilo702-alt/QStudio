# Compiler & Language Guide

QStudio provides a modular compiler architecture supporting 5 quantum languages: **Silq**, **OpenQASM 3.0**, **Microsoft Q#**, **Quil**, and **OpenQASM 2.0**.

> [!NOTE]
> QStudio implements clearly documented subsets of each quantum language for local circuit compilation, state-vector simulation, SVG visualization, and quantum debugging. It does not claim 100% full specification compliance with third-party language runtimes.

---

## 1. Supported Quantum Languages

### A. Silq-inspired QStudio language

- **Extensions**: `.silq`
- **Supported Subset**:
  - Function declarations: `fn name() { ... }`
  - Qubit declarations: `let q = new Qubit[N];`
  - Variable assignments: `let x = ...;`
  - Gate operations: `H`, `X`, `Y`, `Z`, `S`, `T`, `CNOT`, `CZ`, `SWAP`
  - Controlled gate modifiers: `.controlled(control)` (e.g. `X(q[1]).controlled(q[0]);`)
  - Measurement & Reset: `measure(q[0])`, `measure(q)`, `reset(q[0])`
  - Return statements: `return measure(q);`
  - Line comments: `// ...`

### B. OpenQASM 3.0

- **Extensions**: `.qasm`, `.qasm3`
- **Supported Subset**:
  - Header: `OPENQASM 3.0;` or `OPENQASM 3;`
  - Includes: `include "stdgates.inc";`
  - Declarations: `qubit[N] q;`, `qubit q;`, `bit[N] c;`, `bit c;`
  - Gates: `h`, `x`, `y`, `z`, `s`, `t`, `cx`, `cnot`, `cz`, `swap`
  - Measurement: `measure q[0] -> c[0];`, `c[0] = measure q[0];`
  - Reset: `reset q[0];`
  - Barrier: `barrier q[0], q[1];`
  - Comments: `// ...`, `/* ... */`
- **Unsupported Features**: Arbitrary classical branching, subroutines, arbitrary angles/phases outside standard gates.

### C. Microsoft Q#

- **Extensions**: `.qs`
- **Supported Subset**:
  - Namespace & Open declarations: `namespace N { open Microsoft.Quantum.Intrinsic; ... }`
  - Operations: `operation Name(...) : Result[] { ... }`, `operation Name(...) : Unit { ... }`
  - Qubit allocation: `use q = Qubit[N];`, `use (q0, q1) = (Qubit(), Qubit());`
  - Gates: `H(q[0]);`, `X(q[0]);`, `Y(q[0]);`, `Z(q[0]);`, `S(q[0]);`, `T(q[0]);`, `CNOT(q[0], q[1]);`, `CZ(q[0], q[1]);`, `SWAP(q[0], q[1]);`
  - Measurements: `M(q[0])`, `let results = [M(q[0]), M(q[1])];`
  - Resets: `Reset(q[0]);`, `ResetAll(q);`
  - Return statements: `return results;`
  - Comments: `// ...`
- **Unsupported Features**: Advanced types, functors (`Adjoint`/`Controlled` on custom ops), loops, Q# project references.

### D. Quil (Rigetti)

- **Extensions**: `.quil`
- **Supported Subset**:
  - Declarations: `DECLARE ro BIT[N]`, `DECLARE memory REAL[N]`
  - Gates: `H <q>`, `X <q>`, `Y <q>`, `Z <q>`, `S <q>`, `T <q>`, `CNOT <q1> <q2>`, `CZ <q1> <q2>`, `SWAP <q1> <q2>`
  - Instructions: `MEASURE <q> ro[i]`, `MEASURE <q>`, `RESET <q>`, `RESET`
  - Comments: `# ...`
- **Unsupported Features**: Defgate expressions, classical logic gates (`AND`, `OR`), memory deflection modifiers.

### E. OpenQASM 2.0

- **Extensions**: `.qasm`, `.qasm2`
- **Supported Subset**:
  - Header: `OPENQASM 2.0;`
  - Includes: `include "qelib1.inc";`
  - Declarations: `qreg q[N];`, `creg c[N];`
  - Gates: `h`, `x`, `y`, `z`, `s`, `t`, `cx`, `cz`, `swap`
  - Measurement: `measure q[i] -> c[i];`
  - Reset: `reset q[i];`
  - Barrier: `barrier q;`
  - Comments: `// ...`
- **Unsupported Features**: User-defined gate macros (`gate`), opaque gates.

---

## 2. Compilation Pipeline & Common Quantum IR

Every language adapter produces a unified `CompilationResult`:

1. **Lexer / Tokenizer**: Creates tokens with accurate 1-indexed lines and columns.
2. **Parser**: Generates a typed AST (`ProgramNode`).
3. **Semantic Analyzer**: Validates register sizes, simulator-compatible qubit limits (1–12 qubits), symbol references, and index bounds.
4. **IR Lowering**: Generates `QuantumIR` containing linear `IROperation` entries with targets, controls, and source code ranges.
5. **Circuit Model**: Emits SVG-renderable `CircuitModel`.
6. **Diagnostics**: Returns structured `Diagnostic` items for pinpoint error reporting in Monaco.

The shared IR is intentionally small. It represents linear quantum operations, targets, controls, and source ranges, but does not yet preserve classical-register destinations or support classical control flow. Measurement operations collapse the simulated state and record per-run outcomes; repeated shot counts are generated from independent simulator runs.
