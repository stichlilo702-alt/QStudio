import { useState, useEffect } from "react";
import { useIDEStore } from "../store/ideStore";
import type { CompilationResult } from "../../../backend/src/compiler/types";
import { QuantumDebugger, type DebugSnapshot } from "../../../simulator/QuantumDebugger";
import { defaultLanguageRegistry } from "../../../backend/src/languages";

const labels = [
  ["console", "Console"],
  ["problems", "Problems"],
  ["simulation", "Simulation Output"],
  ["debugger", "Quantum Debugger"],
  ["terminal", "Terminal"],
] as const;

export function OutputPanel(): JSX.Element {
  const {
    panel,
    setPanel,
    console,
    simulationOutput,
    projectRoot,
    diagnostics,
    setSelectedDiagnostic,
    tabs,
    activeTab,
  } = useIDEStore();

  const tab = tabs.find((item) => item.id === activeTab);
  const source = tab?.content ?? "";

  const adapter = tab
    ? tab.language
      ? defaultLanguageRegistry.get(tab.language) ?? defaultLanguageRegistry.detect(tab.path ?? tab.title, source)
      : defaultLanguageRegistry.detect(tab.path ?? tab.title, source)
    : defaultLanguageRegistry.get("silq")!;

  // Terminal state
  const [command, setCommand] = useState("git status");
  const [terminal, setTerminal] = useState("Open a workspace, then run git, node, pnpm, python, or python3.");

  // Debugger state
  const [debuggerInstance, setDebuggerInstance] = useState<QuantumDebugger | null>(null);
  const [currentSnapshot, setCurrentSnapshot] = useState<DebugSnapshot | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);

  // Initialize or update Debugger session when panel or source changes
  useEffect(() => {
    if (panel === "debugger" && source.trim()) {
      void adapter.compile(source).then((res: CompilationResult) => {
        if (res.diagnostics.length > 0) {
          setDebugError("Cannot start debugger with compilation errors.");
          setDebuggerInstance(null);
          setCurrentSnapshot(null);
        } else {
          setDebugError(null);
          const dbg = new QuantumDebugger(res.ir);
          setDebuggerInstance(dbg);
          void dbg.stepForward().then(setCurrentSnapshot);
        }
      });
    }
  }, [panel, source, adapter]);

  const runTerminal = async () => {
    if (!projectRoot) return setTerminal("Open a workspace before running commands.");
    const [binary, ...args] = command.trim().split(/\s+/);
    try {
      const result = await window.silq?.runTerminal(binary, args, projectRoot);
      setTerminal(`$ ${command}\n${result?.output ?? ""}\nProcess exited with ${result?.code ?? 1}`);
    } catch (error) {
      setTerminal(`$ ${command}\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const stepForward = async () => {
    if (!debuggerInstance) return;
    const snap = await debuggerInstance.stepForward();
    setCurrentSnapshot({ ...snap });
  };

  const stepBack = async () => {
    if (!debuggerInstance) return;
    const snap = await debuggerInstance.stepBack();
    setCurrentSnapshot({ ...snap });
  };

  const stepContinue = async () => {
    if (!debuggerInstance) return;
    const snap = await debuggerInstance.continue();
    setCurrentSnapshot({ ...snap });
  };

  const debugReset = async () => {
    if (!debuggerInstance) return;
    debuggerInstance.reset();
    const snap = await debuggerInstance.stepForward();
    setCurrentSnapshot({ ...snap });
  };

  return (
    <section className="output">
      <div className="output-tabs">
        {labels.map(([id, label]) => (
          <button
            key={id}
            className={`tab-btn ${panel === id ? "selected" : ""}`}
            onClick={() => setPanel(id)}
          >
            {label}
            {id === "problems" && diagnostics.length > 0 && (
              <span className="badge-error">{diagnostics.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="output-body">
        {/* Console Tab */}
        {panel === "console" && (
          <div className="console-view">
            {console.map((line, index) => (
              <div key={index} className="log-line">
                <span className="prompt-sym">›</span> {line}
              </div>
            ))}
          </div>
        )}

        {/* Problems Tab */}
        {panel === "problems" && (
          <div className="problems-view">
            {diagnostics.length === 0 ? (
              <div className="empty-msg">✓ No compiler errors or warnings detected.</div>
            ) : (
              <div className="diagnostics-list">
                {diagnostics.map((diag, index) => (
                  <div
                    key={index}
                    className={`diagnostic-item ${diag.severity}`}
                    onClick={() => setSelectedDiagnostic(diag)}
                    title="Click to locate error in editor"
                  >
                    <span className="diag-icon">
                      {diag.severity === "error" ? "✖" : "⚠"}
                    </span>
                    <span className="diag-msg">{diag.message}</span>
                    <span className="diag-pos">
                      Line {diag.line}, Col {diag.column}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Terminal Tab */}
        {panel === "terminal" && (
          <div className="terminal-view">
            <pre className="terminal-out">{terminal}</pre>
            <div className="terminal-prompt">
              <span className="prompt-label">$</span>
              <input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void runTerminal()}
                aria-label="Terminal command"
                placeholder="Enter command (e.g. git status)..."
              />
              <button onClick={() => void runTerminal()}>Run</button>
            </div>
          </div>
        )}

        {/* Simulation Output Tab */}
        {panel === "simulation" && <SimulationView rawOutput={simulationOutput} />}

        {/* Debugger Tab */}
        {panel === "debugger" && (
          <DebuggerView
            error={debugError}
            debuggerInstance={debuggerInstance}
            snapshot={currentSnapshot}
            onStepForward={() => void stepForward()}
            onStepBack={() => void stepBack()}
            onContinue={() => void stepContinue()}
            onReset={() => void debugReset()}
          />
        )}
      </div>
    </section>
  );
}

function SimulationView({ rawOutput }: { rawOutput: string }): JSX.Element {
  if (!rawOutput || rawOutput.startsWith("Run a circuit")) {
    return <div className="empty-msg">{rawOutput || "Run a circuit to inspect simulation results."}</div>;
  }

  let data: {
    elapsedMs: number;
    shots: number;
    probabilities: Record<string, number>;
    stateVector: string[];
    counts: Record<string, number>;
    registers: Array<{ qubit: number; zero: number; one: number; bloch: { x: number; y: number; z: number } }>;
  } | null = null;

  try {
    data = JSON.parse(rawOutput);
  } catch {
    return <pre className="raw-output">{rawOutput}</pre>;
  }

  if (!data) return <div className="empty-msg">No simulation data available.</div>;

  return (
    <div className="simulation-dashboard">
      <div className="sim-summary">
        <div className="summary-card">
          <span className="lbl">Status</span>
          <span className="val success">Completed</span>
        </div>
        <div className="summary-card">
          <span className="lbl">Execution Time</span>
          <span className="val">{data.elapsedMs} ms</span>
        </div>
        <div className="summary-card">
          <span className="lbl">Shots</span>
          <span className="val">{data.shots}</span>
        </div>
      </div>

      <div className="sim-sections-grid">
        <div className="sim-section">
          <h4>Probability Distribution</h4>
          <div className="prob-bars">
            {Object.entries(data.probabilities).map(([state, prob]) => {
              const pct = (prob * 100).toFixed(2);
              return (
                <div key={state} className="prob-row">
                  <span className="state-lbl">|{state}⟩</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="pct-lbl">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sim-section">
          <h4>Measurement Sampling ({data.shots} Shots)</h4>
          <div className="counts-list">
            {Object.entries(data.counts).map(([state, count]) => {
              const pct = ((count / data.shots) * 100).toFixed(1);
              return (
                <div key={state} className="count-row">
                  <span className="state-lbl">|{state}⟩</span>
                  <span className="count-val">{count} counts ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sim-section">
          <h4>State Vector Amplitudes</h4>
          <ul className="vector-list">
            {data.stateVector.map((amp, idx) => (
              <li key={idx} className="vector-item">
                {amp}
              </li>
            ))}
          </ul>
        </div>

        <div className="sim-section">
          <h4>Bloch Vector Coordinates</h4>
          <div className="bloch-grid">
            {data.registers.map((reg) => (
              <div key={reg.qubit} className="bloch-card">
                <div className="bloch-title">Qubit {reg.qubit}</div>
                <div className="bloch-coords">
                  <span>x: {reg.bloch.x.toFixed(3)}</span>
                  <span>y: {reg.bloch.y.toFixed(3)}</span>
                  <span>z: {reg.bloch.z.toFixed(3)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DebuggerView({
  error,
  debuggerInstance,
  snapshot,
  onStepForward,
  onStepBack,
  onContinue,
  onReset,
}: {
  error: string | null;
  debuggerInstance: QuantumDebugger | null;
  snapshot: DebugSnapshot | null;
  onStepForward(): void;
  onStepBack(): void;
  onContinue(): void;
  onReset(): void;
}): JSX.Element {
  if (error) {
    return <div className="empty-msg error-msg">⚠ {error}</div>;
  }

  if (!debuggerInstance || !snapshot) {
    return <div className="empty-msg">Initializing Quantum Debugger...</div>;
  }

  const op = snapshot.operation;
  const currentStep = debuggerInstance.currentStep;
  const totalSteps = debuggerInstance.totalSteps;

  return (
    <div className="debugger-dashboard">
      <div className="disclaimer-banner">
        <span>ℹ Local State-Vector Simulator Debugger</span>
        <small>Simulates ideal state vector step-by-step. Does not query physical hardware.</small>
      </div>

      <div className="debugger-controls-bar">
        <button onClick={onReset} title="Reset Debugger">⏮ Reset</button>
        <button onClick={onStepBack} disabled={currentStep <= 1} title="Step Back">◀ Step Back</button>
        <button className="primary-btn" onClick={onStepForward} disabled={currentStep >= totalSteps} title="Step Forward">
          Step Forward ▶
        </button>
        <button onClick={onContinue} disabled={currentStep >= totalSteps} title="Continue Execution">⏩ Continue</button>

        <span className="step-counter">
          Step <strong>{currentStep}</strong> / {totalSteps}
        </span>
      </div>

      <div className="debugger-details">
        <div className="debug-card">
          <h4>Current Operation</h4>
          {op ? (
            <div className="op-info">
              <span className="op-gate">{op.opcode.toUpperCase()}</span>
              <span className="op-targets">Targets: q[{op.targets.join(", ")}]</span>
              {op.controls.length > 0 && <span className="op-controls">Controls: q[{op.controls.join(", ")}]</span>}
              <span className="op-line">Source Line: {op.source.line}</span>
            </div>
          ) : (
            <div className="muted">Initial Register State (|0...0⟩)</div>
          )}
        </div>

        <div className="debug-card">
          <h4>Current Probabilities</h4>
          <div className="prob-bars">
            {Object.entries(snapshot.state.probabilities).map(([state, prob]: [string, number]) => (
              <div key={state} className="prob-row">
                <span className="state-lbl">|{state}⟩</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(prob * 100).toFixed(1)}%` }} />
                </div>
                <span className="pct-lbl">{(prob * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
