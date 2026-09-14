import { describe, expect, it } from "vitest";
import { QSharpLanguageAdapter } from "../../backend/src/languages/qsharp/QSharpLanguageAdapter";
import { StateVectorSimulator } from "../../simulator/StateVectorSimulator";

describe("Microsoft Q# Adapter & Parser", () => {
  const adapter = new QSharpLanguageAdapter();
  const simulator = new StateVectorSimulator();

  it("compiles canonical Microsoft Q# BellState operation without diagnostics", async () => {
    const source = `namespace QStudio.Examples {
    open Microsoft.Quantum.Intrinsic;

    operation BellState() : Result[] {
        use q = Qubit[2];

        H(q[0]);
        CNOT(q[0], q[1]);

        let results = [M(q[0]), M(q[1])];

        ResetAll(q);
        return results;
    }
}
`;
    const result = await adapter.compile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir.qubits).toBe(2);
    expect(result.circuit.operations[0].gate).toBe("H");
    expect(result.circuit.operations[1].gate).toBe("CX");
  });

  it("supports all single and multi-qubit gates, measurements, and resets", async () => {
    const source = `namespace Test {
    operation AllGates() : Unit {
        use q = Qubit[2];
        H(q[0]);
        X(q[1]);
        Y(q[0]);
        Z(q[1]);
        S(q[0]);
        T(q[1]);
        CNOT(q[0], q[1]);
        CZ(q[0], q[1]);
        SWAP(q[0], q[1]);
        M(q[0]);
        Reset(q[1]);
    }
}
`;
    const result = await adapter.compile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir.operations.length).toBe(11);
  });

  it("produces a Bell-state probability distribution (~50% |00⟩, ~50% |11⟩)", async () => {
    const source = `namespace QStudio.Examples {
    open Microsoft.Quantum.Intrinsic;

    operation BellState() : Result[] {
        use q = Qubit[2];

        H(q[0]);
        CNOT(q[0], q[1]);

        let results = [M(q[0]), M(q[1])];

        return results;
    }
}
`;
    const result = await simulator.run(source, 1024, "qsharp");
    const measuredState = result.measurements.map((measurement) => measurement.result).join("");
    expect(measuredState === "00" || measuredState === "11").toBe(true);
    expect(result.probabilities[measuredState]).toBeCloseTo(1);
    expect(Object.values(result.counts).reduce((total, count) => total + count, 0)).toBe(1024);
  });

  it("emits diagnostic for unknown qubit register", async () => {
    const source = `namespace Test {
    operation Main() : Unit {
        H(nonexistent[0]);
    }
}
`;
    const result = await adapter.compile(source);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.message.includes("Unknown quantum register"))).toBe(true);
  });

  it("emits diagnostic for out of bounds qubit index", async () => {
    const source = `namespace Test {
    operation Main() : Unit {
        use q = Qubit[2];
        H(q[5]);
    }
}
`;
    const result = await adapter.compile(source);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.message.includes("Invalid qubit index 5"))).toBe(true);
  });
});
