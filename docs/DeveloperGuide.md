# Developer Guide

## Environment & Build

- **Node.js**: v20+
- **Package Manager**: `pnpm` 9+

### Commands

- `pnpm start`: Launches the built Electron application.
- `pnpm lint`: Runs ESLint 9 with the flat configuration in `eslint.config.mjs` and fails on warnings.
- `pnpm exec tsc -p tsconfig.json --noEmit`: Runs the strict typecheck for Electron, backend, simulator, AI, and extension code.
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: Runs the strict renderer/shared typecheck.
- `pnpm test:watch`: Runs Vitest in watch mode.
- `pnpm test:e2e`: Builds and runs the Playwright Electron smoke test; Electron must be able to launch a desktop window.
- `pnpm build`: Compiles the production renderer and Electron-side bundle.
- `pnpm format`: Formats repository files with Prettier.

## Security Architecture

1. **Electron Sandboxing**: Renderer windows run with `contextIsolation: true` and `sandbox: true`.
2. **Path Restrictions**: Main process IPC handlers validate that file access targets paths within active open workspace roots (`assertWorkspace`).
3. **Terminal Sandbox**: Integrated terminal spawning only permits explicit binaries (`git`, `node`, `pnpm`, `python`, `python3`) with `shell: false` and length-restricted string arguments.
4. **Local-First & Offline Support**: AI credentials remain in main process environment variables (`SILQ_AI_BASE_URL`, `SILQ_AI_API_KEY`, `SILQ_AI_MODEL`). All quantum compilation, visualization, simulation, debugging, and example features execute 100% locally without AI credentials.

The project is currently a private desktop application package (`private: true`) and does not define a packaging or release command. No license file is included yet.
