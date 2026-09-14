# Multi-Language Quantum Architecture

## 1. Architectural Audit

QStudio is a quantum development environment architected with a modular, unidirectional compilation and simulation pipeline. Its primary language is a Silq-inspired QStudio language; additional adapters lower documented subsets of OpenQASM 3, OpenQASM 2, Microsoft Q#, and Quil into the same local tooling pipeline.

### Current Pipeline Overview

1. **Source Code**: User enters quantum source code in the Monaco Editor.
2. **Compiler Boundary (`SilqCompiler`)**:
   - **Lexer**: Produces typed `Token[]` stream with precise character offsets and line/column numbers.
   - **Parser**: Produces an Abstract Syntax Tree (`ProgramNode`).
   - **Semantic Analyzer**: Validates register declarations, qubit count restrictions (1–12 qubits for local state-vector simulation), and symbol references.
   - **IR Generator**: Lowers AST into `QuantumIR` containing linear operations (`IROperation`) and qubit count.
   - **Generators**:
     - `OpenQasmGenerator`: Converts `QuantumIR` to OpenQASM 3.0 representation.
     - `CircuitGenerator`: Converts `QuantumIR` to `CircuitModel` for UI rendering.
3. **Simulation & Debugging**:
   - **`StateVectorSimulator`**: Simulates `QuantumIR` on an exact complex state vector ($2^N$ amplitudes), producing state probabilities, measurement sampling, state-vector amplitudes, and per-qubit Bloch vector expectation values $(x, y, z)$.
   - **`QuantumDebugger`**: Performs step-by-step historic state inspection and breakpoint management over `QuantumIR` operations.
4. **Renderer & Visualization**:
   - **`CircuitSvg`**: Renders `CircuitModel` as an interactive SVG showing wires, gate boxes, control dots, CNOT target crosses, measurements, resets, and SWAP connections.

---

## 2. Multi-Language Adapter Architecture

To support OpenQASM 3, Microsoft Q#, Quil, and OpenQASM 2.0 without rewriting the simulator, debugger, or renderer, QStudio introduces the **Quantum Language Adapter Pattern**:

```
                       ┌────────────────────────────────────────────────────────┐
                       │               Quantum Source Program                   │
                       │   (.silq  |  .qasm (v3/v2)  |  .qs  |  .quil)          │
                       └──────────────────────────┬─────────────────────────────┘
                                                  │
                                                  ▼
                       ┌────────────────────────────────────────────────────────┐
                       │               QuantumLanguageRegistry                  │
                       │  - Detects language from extension or source header    │
                       │  - Dispatches to appropriate QuantumLanguageAdapter    │
                       └──────────────────────────┬─────────────────────────────┘
                                                  │
         ┌───────────────────┬────────────────────┼───────────────────┬───────────────────┐
         │                   │                    │                   │                   │
         ▼                   ▼                    ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Silq Adapter  │ │  OpenQASM 3     │ │   Microsoft Q#  │ │   Quil Adapter  │ │  OpenQASM 2.0   │
│   (Preserved)   │ │  Adapter        │ │   Adapter       │ │                 │ │  Adapter        │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                    │                   │                   │
         └───────────────────┴────────────────────┼───────────────────┴───────────────────┘
                                                  │
                                                  ▼
                                ┌───────────────────────────────────┐
                                │       Unified CompilationResult   │
                                │  - QuantumIR (Common IR)          │
                                │  - CircuitModel (SVG Display)     │
                                │  - Diagnostic[] (Monaco Markers)  │
                                │  - AST & Tokens (AST Explorer)    │
                                └─────────────────┬─────────────────┘
                                                  │
                         ┌────────────────────────┴────────────────────────┐
                         │                                                 │
                         ▼                                                 ▼
        ┌──────────────────────────────────┐             ┌──────────────────────────────────┐
        │       StateVectorSimulator       │             │         QuantumDebugger          │
        │   - Exact 1-12 qubit state vector│             │   - Step forward / step back     │
        │   - Probability distribution     │             │   - Intermediate state snapshots │
        │   - Bloch sphere coordinates     │             │   - Breakpoint management        │
        └──────────────────────────────────┘             └──────────────────────────────────┘
```

---

## 3. Supported Languages & Documented Subsets

| Language                           | Extensions        | Monaco ID   | Header / Declarations                                     | Supported Gate Set & Operations                                                              |
| :--------------------------------- | :---------------- | :---------- | :-------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| **Silq-inspired QStudio language** | `.silq`           | `silq`      | `fn main() { let q = new Qubit[n]; }`                     | `H`, `X`, `Y`, `Z`, `S`, `T`, `CNOT`, `CZ`, `SWAP`, `measure`, `reset`, `.controlled(q)`     |
| **OpenQASM 3**                     | `.qasm`, `.qasm3` | `openqasm3` | `OPENQASM 3.0;`, `qubit[n] q;`, `bit[n] c;`               | `h`, `x`, `y`, `z`, `s`, `t`, `cx`, `cnot`, `cz`, `swap`, `measure`, `reset`                 |
| **Microsoft Q#**                   | `.qs`             | `qsharp`    | `namespace N { operation O() : R { use q = Qubit[n]; } }` | `H`, `X`, `Y`, `Z`, `S`, `T`, `CNOT`, `CZ`, `SWAP`, `M`, `Reset`, `ResetAll`, `let r = M(q)` |
| **Quil**                           | `.quil`           | `quil`      | `DECLARE ro BIT[n]`                                       | `H`, `X`, `Y`, `Z`, `S`, `T`, `CNOT`, `CZ`, `SWAP`, `MEASURE`, `RESET`                       |
| **OpenQASM 2.0**                   | `.qasm`, `.qasm2` | `openqasm2` | `OPENQASM 2.0;`, `qreg q[n];`, `creg c[n];`               | `h`, `x`, `y`, `z`, `s`, `t`, `cx`, `cz`, `swap`, `measure`, `reset`, `barrier`              |

---

## 4. How to Add a New Quantum Language

To add another quantum language in the future:

1. Create parser in `backend/src/languages/<language-name>/`:
   - Implement tokenizer and parser emitting typed AST nodes.
   - Implement semantic checks and lowering to standard `QuantumIR`.
   - Implement diagnostic reporting conforming to `Diagnostic` (`line`, `column`, `endLine`, `endColumn`, `range`).
2. Implement `QuantumLanguageAdapter`:
   - Provide `id`, `name`, `extensions`, `monacoLanguageId`, `capabilities`, `examplePrograms`.
   - Implement `compile(source)` and `diagnostics(source)`.
3. Register the adapter in `backend/src/languages/index.ts` with `defaultLanguageRegistry.register(new MyLanguageAdapter())`.
4. Register syntax highlighting and language definition in `renderer/src/language/QuantumMonacoService.ts`.
5. Add unit tests for syntax parsing, diagnostics, and state-vector simulation.

All adapters implement documented subsets only; QStudio is not an official implementation of Silq, OpenQASM, Q#, or Quil. The shared IR supports linear quantum operations but does not yet model classical-register destinations or classical control flow.
