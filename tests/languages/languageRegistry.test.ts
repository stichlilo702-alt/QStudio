import { describe, expect, it } from "vitest";
import {
  createDefaultLanguageRegistry,
  LanguageRegistry,
  SilqLanguageAdapter,
} from "../../backend/src/languages";

describe("LanguageRegistry", () => {
  it("registers and lists all 5 supported quantum language adapters", () => {
    const registry = createDefaultLanguageRegistry();
    const list = registry.list();
    expect(list.length).toBe(5);

    const ids = list.map((a) => a.id);
    expect(ids).toContain("silq");
    expect(ids).toContain("openqasm3");
    expect(ids).toContain("qsharp");
    expect(ids).toContain("quil");
    expect(ids).toContain("openqasm2");
  });

  it("retrieves adapters by language ID", () => {
    const registry = createDefaultLanguageRegistry();
    expect(registry.get("silq")?.id).toBe("silq");
    expect(registry.get("openqasm3")?.id).toBe("openqasm3");
    expect(registry.get("qsharp")?.id).toBe("qsharp");
    expect(registry.get("quil")?.id).toBe("quil");
    expect(registry.get("openqasm2")?.id).toBe("openqasm2");
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("prevents duplicate registration of the same language adapter", () => {
    const registry = new LanguageRegistry();
    registry.register(new SilqLanguageAdapter());
    expect(() => registry.register(new SilqLanguageAdapter())).toThrow(
      "Quantum language adapter 'silq' is already registered."
    );
  });

  it("detects language by file extension", () => {
    const registry = createDefaultLanguageRegistry();
    expect(registry.detectByExtension("circuit.silq")?.id).toBe("silq");
    expect(registry.detectByExtension("algorithm.qasm")?.id).toBe("openqasm3");
    expect(registry.detectByExtension("program.qasm3")?.id).toBe("openqasm3");
    expect(registry.detectByExtension("program.qasm2")?.id).toBe("openqasm2");
    expect(registry.detectByExtension("operation.qs")?.id).toBe("qsharp");
    expect(registry.detectByExtension("code.quil")?.id).toBe("quil");
    expect(registry.detectByExtension("file.unknown")).toBeUndefined();
  });

  it("detects language by source code content", () => {
    const registry = createDefaultLanguageRegistry();

    const oq3 = 'OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] q;';
    expect(registry.detectByContent(oq3)?.id).toBe("openqasm3");

    const oq2 = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];';
    expect(registry.detectByContent(oq2)?.id).toBe("openqasm2");

    const qs = "namespace Demo {\n  operation Bell() : Result[] {\n    use q = Qubit[2];\n  }\n}";
    expect(registry.detectByContent(qs)?.id).toBe("qsharp");

    const quil = "DECLARE ro BIT[2]\nH 0\nCNOT 0 1";
    expect(registry.detectByContent(quil)?.id).toBe("quil");

    const silq = "fn bell() {\n  let q = new Qubit[2];\n  H(q[0]);\n}";
    expect(registry.detectByContent(silq)?.id).toBe("silq");
  });

  it("detect fallback returns default adapter", () => {
    const registry = createDefaultLanguageRegistry();
    const fallback = registry.detect();
    expect(fallback.id).toBe("silq");
  });
});
