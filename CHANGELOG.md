# Changelog

All notable changes to QStudio are documented here.

## [0.1.0] - Early development

This repository currently represents an early-development desktop prototype. No packaged release artifact or public release date is declared yet.

### Added

- Electron and React desktop workspace with Monaco Editor integration.
- Silq-inspired QStudio language compiler pipeline with diagnostics, AST output, shared `QuantumIR`, OpenQASM generation, and circuit generation.
- Documented-subset adapters for OpenQASM 3, OpenQASM 2, Microsoft Q#, and Quil.
- Interactive SVG circuit visualization and AST Explorer.
- Local 1–12 qubit state-vector simulation with gate execution, projective measurement, reset, probabilities, amplitudes, shot counts, and Bloch coordinates.
- Quantum debugger with stepwise IR replay, breakpoints, and state inspection.
- Optional OpenAI-compatible assistant integration, extension host API foundation, project indexer foundation, and sandboxed Electron IPC.
- Compiler, simulator, language-adapter, debugger, and Electron smoke tests.

### Limitations

- Language adapters support documented subsets and are not official implementations of their respective languages.
- The shared IR does not yet model classical-register destinations or classical control flow.
- QStudio does not execute programs on physical quantum hardware.
- The repository does not yet include a license file, packaging command, or published release artifact.