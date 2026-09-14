import { describe, expect, it } from "vitest";
import { defaultLanguageRegistry } from "../../backend/src/languages";
import { StateVectorSimulator } from "../../simulator/StateVectorSimulator";
import { QuantumDebugger } from "../../simulator/QuantumDebugger";

describe("Multi-Language Circuit Equivalence & Debugger", () => {
  const simulator = new StateVectorSimulator();

  const bellPrograms = {
    silq: `fn bell() {
  let q = new Qubit[2];
  H(q[0]);
  X(q[1]).controlled(q[0]);
  return measure(q);
}`,
    openqasm3: `OPENQASM 3.0;
include "stdgates.inc";
qubit[2] q;
bit[2] c;
h q[0];
cx q[0], q[1];
measure q[0] -> c[0];
measure q[1] -> c[1];`,
    qsharp: `namespace QStudio.Examples {
    open Microsoft.Quantum.Intrinsic;
    operation BellState() : Result[] {
        use q = Qubit[2];
        H(q[0]);
        CNOT(q[0], q[1]);
        let results = [M(q[0]), M(q[1])];
        ResetAll(q);
        return results;
    }
}`,
    quil: `DECLARE ro BIT[2]
H 0
CNOT 0 1
MEASURE 0 ro[0]
MEASURE 1 ro[1]`,
    openqasm2: `OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
cx q[0],q[1];
measure q[0] -> c[0];
measure q[1] -> c[1];`,
  };

  for (const [langId, code] of Object.entries(bellPrograms)) {
    it(`simulates Bell state in ${langId} yielding 50% |00⟩ and 50% |11⟩`, async () => {
      const adapter = defaultLanguageRegistry.get(langId);
      expect(adapter).toBeDefined();

      const compResult = await adapter!.compile(code);
      expect(compResult.diagnostics).toEqual([]);
      expect(compResult.ir.qubits).toBe(2);

      // Verify circuit generation
      const circuit = compResult.circuit;
      expect(circuit.qubits).toBe(2);
      expect(circuit.operations.length).toBeGreaterThanOrEqual(2);

      // Verify state vector simulation
      const simResult = await simulator.runIR(compResult.ir, 1024);
      if (simResult.measurements.length > 0) {
        const measuredState = simResult.measurements.map((measurement) => measurement.result).join("");
        const countTotal = Object.values(simResult.counts).reduce((total, count) => total + count, 0);
        expect(measuredState === "00" || measuredState === "11").toBe(true);
        expect(simResult.probabilities[measuredState]).toBeCloseTo(1);
        expect(countTotal).toBe(1024);
        expect(Object.keys(simResult.counts).every((state) => state === "00" || state === "11")).toBe(true);
      } else {
        expect(simResult.probabilities["00"]).toBeCloseTo(0.5);
        expect(simResult.probabilities["11"]).toBeCloseTo(0.5);
      }

      // Verify quantum debugger stepping
      const dbg = new QuantumDebugger(compResult.ir);
      expect(dbg.totalSteps).toBe(compResult.ir.operations.length);

      const step1 = await dbg.stepForward();
      expect(step1.step).toBe(1);
      expect(step1.operation?.opcode).toBe("h");
      // After H on q[0], state should be superposition on q[0]
      expect(step1.state.probabilities["00"]).toBeCloseTo(0.5);
      expect(step1.state.probabilities["01"]).toBeCloseTo(0.5);

      const step2 = await dbg.stepForward();
      expect(step2.step).toBe(2);
      expect(step2.operation?.opcode).toBe("cx");
      // After CX q[0], q[1], state is entangled |00⟩ and |11⟩
      expect(step2.state.probabilities["00"]).toBeCloseTo(0.5);
      expect(step2.state.probabilities["11"]).toBeCloseTo(0.5);
    });
  }
});
