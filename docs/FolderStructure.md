# Folder structure

- `app/` Electron main process and preload bridge.
- `renderer/` React application, Monaco integration, UI components, store, and styles.
- `backend/src/compiler/` Silq-inspired compiler pipeline and shared compiler types.
- `backend/src/languages/` language registry and documented-subset adapters for Silq, OpenQASM 2/3, Q#, and Quil.
- `backend/src/contracts.ts` shared diagnostics, circuit, simulator, AI, and hardware contracts.
- `backend/src/ProjectIndexer.ts` workspace symbol and text indexer foundation.
- `simulator/` state-vector simulator and quantum debugger.
- `ai/` optional OpenAI-compatible provider and assistant service.
- `extensions/` in-memory extension host API foundation.
- `examples/` sample Silq programs.
- `docs/` architecture, compiler, simulator, API, extension, and developer documentation.
- `tests/` compiler, language, simulator, debugger, and Electron smoke tests.

Generated output such as `dist/`, `node_modules/`, and Playwright reports is ignored and is not part of the source tree.
