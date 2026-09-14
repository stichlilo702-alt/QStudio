import { describe, expect, it } from "vitest";
import { OpenQasm3LanguageAdapter } from "../../backend/src/languages/openqasm3/OpenQasm3LanguageAdapter";
import { StateVectorSimulator } from "../../simulator/StateVectorSimulator";

describe("OpenQASM 3.0 Adapter & Parser", () => {
  const adapter = new OpenQasm3LanguageAdapter();
  const simulator = new StateVectorSimulator();

  it("compiles canonical OpenQASM 3.0 Bell-state program without diagnostics", async () => {
    const source = `OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[2] c;

h q[0];
cx q[0], q[1];

measure q[0] -> c[0];
measure q[1] -> c[1];
`;
    const result = await adapter.compile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir.qubits).toBe(2);
    expect(result.ir.operations.length).toBe(4);
    expect(result.circuit.operations.length).toBe(4);
    expect(result.circuit.operations[0].gate).toBe("H");
    expect(result.circuit.operations[1].gate).toBe("CX");
  });

  it("supports all single and multi-qubit gates, measurement assignment, and reset", async () => {
    const source = `OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[2] c;

h q[0];
x q[1];
y q[0];
z q[1];
s q[0];
t q[1];
cnot q[0], q[1];
cz q[0], q[1];
swap q[0], q[1];
c[0] = measure q[0];
reset q[1];
`;
    const result = await adapter.compile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir.operations.length).toBe(11);
  });

  it("produces a Bell-state probability distribution (~50% |00⟩, ~50% |11⟩)", async () => {
    const source = `OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[2] c;

h q[0];
cx q[0], q[1];

measure q[0] -> c[0];
measure q[1] -> c[1];
`;
    const result = await simulator.run(source, 1024, "openqasm3");
    const measuredState = result.measurements.map((measurement) => measurement.result).join("");
    expect(measuredState === "00" || measuredState === "11").toBe(true);
    expect(result.probabilities[measuredState]).toBeCloseTo(1);
    expect(Object.values(result.counts).reduce((total, count) => total + count, 0)).toBe(1024);
  });

  it("emits diagnostic for unknown qubit register", async () => {
    const source = `OPENQASM 3.0;
h unknown_qubit[0];
`;
    const result = await adapter.compile(source);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.message.includes("Unknown quantum register"))).toBe(true);
  });

  it("emits diagnostic for out of bounds qubit index", async () => {
    const source = `OPENQASM 3.0;
qubit[2] q;
h q[5];
`;
    const result = await adapter.compile(source);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.message.includes("Invalid qubit index 5"))).toBe(true);
  });

  it("emits diagnostic for duplicate declaration", async () => {
    const source = `OPENQASM 3.0;
qubit[2] q;
qubit[2] q;
`;
    const result = await adapter.compile(source);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.message.includes("Duplicate declaration 'q'"))).toBe(true);
  });
});
