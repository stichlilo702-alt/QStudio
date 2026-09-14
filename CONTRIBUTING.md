# Contributing to QStudio

QStudio is an early-development quantum development environment. Contributions are welcome in compiler diagnostics, documented language subsets, circuit visualization, state-vector simulation, debugging, tests, and documentation.

## Before Opening a Pull Request

1. Keep the change focused and describe the behavior it changes.
2. Add or update tests for compiler, adapter, simulator, debugger, or UI behavior as appropriate.
3. Run the following checks:

   ```bash
   pnpm lint
   pnpm exec tsc -p tsconfig.json --noEmit
   pnpm exec tsc -p tsconfig.app.json --noEmit
   pnpm exec vitest run
   pnpm build
   ```

4. Update the relevant documentation when public behavior changes.
5. Do not commit generated output such as `dist/`, `node_modules/`, coverage data, or Playwright reports.

## Project Conventions

- Language adapters implement documented subsets and lower source programs into the shared `QuantumIR`.
- The local simulator is a small-circuit state-vector simulator with a practical 1–12 qubit range.
- QStudio is not an official implementation of Silq, OpenQASM, Q#, or Quil.
- Do not add hardware or cloud behavior without documenting its credentials, execution model, and tests.

See the [Developer Guide](docs/DeveloperGuide.md), [Compiler Guide](docs/CompilerGuide.md), and [Simulator Guide](docs/SimulatorGuide.md) for implementation context.
