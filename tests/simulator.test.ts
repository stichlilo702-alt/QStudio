import { describe, expect, it, vi } from "vitest";
import { QuantumDebugger } from "../simulator/QuantumDebugger";
import { StateVectorSimulator } from "../simulator/StateVectorSimulator";

describe("StateVectorSimulator", () => {
  const simulator = new StateVectorSimulator();

  it("produces a Bell-state probability distribution", async () => {
    const source = "fn bell() {\n let q = new Qubit[2];\n H(q[0]);\n X(q[1]).controlled(q[0]);\n}";
    const result = await simulator.run(source, 100);
    expect(result.probabilities["00"]).toBeCloseTo(0.5);
    expect(result.probabilities["11"]).toBeCloseTo(0.5);
  });

  it("evaluates ground state |0⟩", async () => {
    const source = "fn main() { let q = new Qubit[1]; }";
    const result = await simulator.run(source);
    expect(result.probabilities["0"]).toBeCloseTo(1.0);
  });

  it("evaluates Pauli X |0⟩ -> |1⟩", async () => {
    const source = "fn main() { let q = new Qubit[1]; X(q[0]); }";
    const result = await simulator.run(source);
    expect(result.probabilities["1"]).toBeCloseTo(1.0);
  });

  it("evaluates Hadamard superposition H|0⟩", async () => {
    const source = "fn main() { let q = new Qubit[1]; H(q[0]); }";
    const result = await simulator.run(source);
    expect(result.probabilities["0"]).toBeCloseTo(0.5);
    expect(result.probabilities["1"]).toBeCloseTo(0.5);
  });

  it("evaluates H -> S phase shift", async () => {
    const source = "fn main() { let q = new Qubit[1]; H(q[0]); S(q[0]); }";
    const result = await simulator.run(source);
    expect(result.registers[0].bloch.y).toBeCloseTo(1.0);
  });

  it("evaluates H -> T phase shift", async () => {
    const source = "fn main() { let q = new Qubit[1]; H(q[0]); T(q[0]); }";
    const result = await simulator.run(source);
    expect(result.registers[0].bloch.x).toBeCloseTo(Math.SQRT1_2, 2);
    expect(result.registers[0].bloch.y).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it("evaluates SWAP operation", async () => {
    const source = "fn main() { let q = new Qubit[2]; X(q[0]); SWAP(q[0], q[1]); }";
    const result = await simulator.run(source);
    expect(result.probabilities["10"]).toBeCloseTo(1.0);
  });

  it("evaluates Reset operation back to ground state", async () => {
    const source = "fn main() { let q = new Qubit[1]; X(q[0]); reset(q[0]); }";
    const result = await simulator.run(source);
    expect(result.probabilities["0"]).toBeCloseTo(1.0);
  });

  it("verifies state vector normalization sum = 1.0", async () => {
    const source = "fn main() { let q = new Qubit[3]; H(q[0]); H(q[1]); H(q[2]); }";
    const result = await simulator.run(source);
    const sum = Object.values(result.probabilities).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });

  it("measures |0⟩ and records the outcome", async () => {
    const source = "fn main() { let q = new Qubit[1]; measure(q[0]); }";
    const result = await simulator.run(source, 8);

    expect(result.measurements).toEqual([{ qubit: 0, result: 0 }]);
    expect(result.probabilities).toEqual({ "0": 1 });
    expect(result.counts).toEqual({ "0": 8 });
  });

  it("measures |1⟩ and collapses to |1⟩", async () => {
    const source = "fn main() { let q = new Qubit[1]; X(q[0]); measure(q[0]); }";
    const result = await simulator.run(source, 8);

    expect(result.measurements).toEqual([{ qubit: 0, result: 1 }]);
    expect(result.probabilities).toEqual({ "1": 1 });
    expect(result.counts).toEqual({ "1": 8 });
  });

  it("measures |+⟩ and leaves the state in the sampled basis state", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const source = "fn main() { let q = new Qubit[1]; H(q[0]); measure(q[0]); }";

    try {
      const result = await simulator.run(source, 4);
      expect(result.measurements).toEqual([{ qubit: 0, result: 1 }]);
      expect(result.probabilities).toEqual({ "1": 1 });
      expect(result.counts).toEqual({ "1": 4 });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("measures |−⟩ with the same computational-basis probabilities", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.75);
    const source = "fn main() { let q = new Qubit[1]; X(q[0]); H(q[0]); measure(q[0]); }";

    try {
      const result = await simulator.run(source, 1);
      expect(result.measurements).toEqual([{ qubit: 0, result: 0 }]);
      expect(result.probabilities["0"]).toBeCloseTo(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("collapses a Bell state and aggregates independent shot results", async () => {
    const source = `fn bell() {
      let q = new Qubit[2];
      H(q[0]);
      X(q[1]).controlled(q[0]);
      measure(q[0]);
      measure(q[1]);
    }`;
    const result = await simulator.run(source, 128);
    const measuredState = result.measurements.map((measurement) => measurement.result).join("");
    const countTotal = Object.values(result.counts).reduce((total, count) => total + count, 0);

    expect(measuredState === "00" || measuredState === "11").toBe(true);
    expect(Object.keys(result.probabilities)).toEqual([measuredState]);
    expect(countTotal).toBe(128);
    expect(Object.keys(result.counts).every((state) => state === "00" || state === "11")).toBe(true);
  });

  it("keeps repeated measurements of a qubit consistent after collapse", async () => {
    const source = "fn main() { let q = new Qubit[1]; H(q[0]); measure(q[0]); measure(q[0]); }";
    const result = await simulator.run(source, 1);

    expect(result.measurements).toHaveLength(2);
    expect(result.measurements[1].result).toBe(result.measurements[0].result);
    expect(Object.values(result.probabilities)[0]).toBeCloseTo(1);
  });

  it("records measurements for arbitrary qubit indices", async () => {
    const source = "fn main() { let q = new Qubit[3]; X(q[2]); measure(q[2]); measure(q[0]); }";
    const result = await simulator.run(source, 1);

    expect(result.measurements).toEqual([
      { qubit: 2, result: 1 },
      { qubit: 0, result: 0 },
    ]);
    expect(result.probabilities).toEqual({ "100": 1 });
  });

  it("preserves normalization after measurement", async () => {
    const source = "fn main() { let q = new Qubit[3]; H(q[0]); H(q[1]); measure(q[1]); }";
    const result = await simulator.run(source, 1);
    const sum = Object.values(result.probabilities).reduce((total, probability) => total + probability, 0);

    expect(sum).toBeCloseTo(1.0);
  });

  it("resets a measured qubit to |0⟩", async () => {
    const source = "fn main() { let q = new Qubit[1]; X(q[0]); measure(q[0]); reset(q[0]); }";
    const result = await simulator.run(source, 1);

    expect(result.measurements).toEqual([{ qubit: 0, result: 1 }]);
    expect(result.probabilities).toEqual({ "0": 1 });
  });

  it("rejects invalid measured qubit references", async () => {
    const source = "fn main() { let q = new Qubit[1]; measure(q[1]); }";

    await expect(simulator.run(source, 1)).rejects.toThrow("Invalid qubit index 1");
  });

  it("reflects measurement collapse in debugger snapshots", async () => {
    const debuggerInstance = new QuantumDebugger({
      qubits: 1,
      operations: [
        { opcode: "h", targets: [0], controls: [], source: { start: 0, end: 1, line: 1, column: 1 } },
        { opcode: "measure", targets: [0], controls: [], source: { start: 1, end: 2, line: 1, column: 2 } },
      ],
    });

    await debuggerInstance.stepForward();
    const snapshot = await debuggerInstance.stepForward();

    expect(snapshot.operation?.opcode).toBe("measure");
    expect(Object.values(snapshot.state.probabilities)[0]).toBeCloseTo(1);
    expect(snapshot.state.measurements).toHaveLength(1);
  });

  describe("Performance Benchmarks (1, 2, 4, 8, 12 qubits)", () => {
    const sizes = [1, 2, 4, 8, 12];
    for (const numQubits of sizes) {
      it(`simulates ${numQubits} qubit(s) circuit within timing threshold`, async () => {
        let gatesCode = "";
        for (let i = 0; i < numQubits; i++) {
          gatesCode += `H(q[${i}]);\n`;
        }
        const source = `fn benchmark() { let q = new Qubit[${numQubits}]; ${gatesCode} }`;
        const start = performance.now();
        const result = await simulator.run(source, 1024);
        const duration = performance.now() - start;

        expect(result.registers.length).toBe(numQubits);
        expect(duration).toBeLessThan(1500); // 12-qubit state vector simulation takes well under 1.5s
      });
    }
  });
});
