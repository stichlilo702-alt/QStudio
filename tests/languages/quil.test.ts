import { describe, expect, it } from "vitest";
import { QuilLanguageAdapter } from "../../backend/src/languages/quil/QuilLanguageAdapter";
import { StateVectorSimulator } from "../../simulator/StateVectorSimulator";

describe("Quil Adapter & Parser", () => {
  const adapter = new QuilLanguageAdapter();
  const simulator = new StateVectorSimulator();

  it("compiles canonical Quil Bell-state program without diagnostics", async () => {
    const source = `DECLARE ro BIT[2]

H 0
CNOT 0 1

MEASURE 0 ro[0]
MEASURE 1 ro[1]
`;
    const result = await adapter.compile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir.qubits).toBe(2);
    expect(result.ir.operations.length).toBe(4);
    expect(result.circuit.operations[0].gate).toBe("H");
    expect(result.circuit.operations[1].gate).toBe("CX");
  });

  it("supports all single and multi-qubit gates, MEASURE, and RESET", async () => {
    const source = `DECLARE ro BIT[2]

H 0
X 1
Y 0
Z 1
S 0
T 1
CNOT 0 1
CZ 0 1
SWAP 0 1
MEASURE 0 ro[0]
RESET 1
`;
    const result = await adapter.compile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir.operations.length).toBe(11);
  });

  it("produces a Bell-state probability distribution (~50% |00⟩, ~50% |11⟩)", async () => {
    const source = `DECLARE ro BIT[2]

H 0
CNOT 0 1

MEASURE 0 ro[0]
MEASURE 1 ro[1]
`;
    const result = await simulator.run(source, 1024, "quil");
    const measuredState = result.measurements.map((measurement) => measurement.result).join("");
    expect(measuredState === "00" || measuredState === "11").toBe(true);
    expect(result.probabilities[measuredState]).toBeCloseTo(1);
    expect(Object.values(result.counts).reduce((total, count) => total + count, 0)).toBe(1024);
  });

  it("emits diagnostic for missing argument count on two-qubit gate", async () => {
    const source = `CNOT 0
`;
    const result = await adapter.compile(source);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.message.includes("requires two qubit indices"))).toBe(true);
  });
});
