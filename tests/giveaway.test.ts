import { describe, expect, test } from "vitest";
import {
  buildReel,
  eligible,
  parseEntries,
  pickWinner,
  randomInt,
  shuffle,
  type Draw,
  type Entry,
} from "@/lib/giveaway";

/** Injected RNG source that yields a fixed sequence of Uint32 values. */
function fixedSource(values: number[]): (buf: Uint32Array) => Uint32Array {
  let i = 0;
  return (buf: Uint32Array) => {
    for (let j = 0; j < buf.length; j++) {
      buf[j] = values[i % values.length] ?? 0;
      i++;
    }
    return buf;
  };
}

describe("parseEntries", () => {
  test("matches header variants and trims cells", () => {
    const result = parseEntries([
      ["  Full Name  ", "  CODE  "],
      ["  Ada Lovelace  ", "  AX-001  "],
    ]);
    expect(result.entries).toEqual([{ name: "Ada Lovelace", code: "AX-001" }]);
    expect(result.skippedMissing).toBe(0);
    expect(result.duplicates).toBe(0);
    expect(result.suspicious).toBe(0);
  });

  test.each([
    [["Name", "Code"], "Name"],
    [["fullname", "code"], "fullname"],
    [["FULL NAME", "Code"], "FULL NAME"],
  ])("accepts header %j", (headers) => {
    const result = parseEntries([headers, ["Bob", "B1"]]);
    expect(result.entries).toEqual([{ name: "Bob", code: "B1" }]);
  });

  test("throws when name or code columns are missing", () => {
    expect(() => parseEntries([["Email", "Phone"], ["a", "b"]])).toThrow(
      "The sheet needs two columns: Full name and Code.",
    );
  });

  test("ignores fully empty rows", () => {
    const result = parseEntries([
      ["Full name", "Code"],
      ["", ""],
      ["   ", "  "],
      ["Carol", "C1"],
    ]);
    expect(result.entries).toHaveLength(1);
    expect(result.skippedMissing).toBe(0);
  });

  test("counts rows missing a name or a code", () => {
    const result = parseEntries([
      ["Full name", "Code"],
      ["Dana", ""],
      ["", "E1"],
      ["Fran", "F1"],
    ]);
    expect(result.entries).toEqual([{ name: "Fran", code: "F1" }]);
    expect(result.skippedMissing).toBe(2);
  });

  test("keeps the first duplicate code and counts the rest", () => {
    const result = parseEntries([
      ["Full name", "Code"],
      ["First", "DUP"],
      ["Second", "DUP"],
      ["Third", "OTHER"],
    ]);
    expect(result.entries).toEqual([
      { name: "First", code: "DUP" },
      { name: "Third", code: "OTHER" },
    ]);
    expect(result.duplicates).toBe(1);
  });

  test("counts suspicious scientific-notation and .0 codes", () => {
    const result = parseEntries([
      ["Full name", "Code"],
      ["Sci", "1.23e+15"],
      ["Dot", "12345.0"],
      ["Ok", "12345"],
    ]);
    expect(result.suspicious).toBe(2);
    expect(result.entries).toHaveLength(3);
  });

  test("finds the header as the first non-empty row", () => {
    const result = parseEntries([
      ["", ""],
      ["Full name", "Code"],
      ["Gina", "G1"],
    ]);
    expect(result.entries).toEqual([{ name: "Gina", code: "G1" }]);
  });
});

describe("randomInt", () => {
  test("throws when max < 1", () => {
    expect(() => randomInt(0)).toThrow();
    expect(() => randomInt(-1)).toThrow();
  });

  test("stays in [0, max)", () => {
    const source = fixedSource([0, 1, 2, 3, 4, 5, 6, 7]);
    for (let i = 0; i < 8; i++) {
      const n = randomInt(5, source);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
    }
  });

  test("retries when the drawn value falls in the rejected range", () => {
    // For max=7, limit = floor(2^32/7)*7. Values >= limit are rejected.
    const limit = Math.floor(0x100000000 / 7) * 7;
    const source = fixedSource([limit, limit + 1, 5]);
    expect(randomInt(7, source)).toBe(5);
  });
});

describe("shuffle", () => {
  test("returns a new array of the same length", () => {
    const items = [1, 2, 3, 4];
    const source = fixedSource([0, 0, 0, 0]);
    const out = shuffle(items, source);
    expect(out).not.toBe(items);
    expect(out).toHaveLength(items.length);
    expect(out.sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("eligible / pickWinner", () => {
  const entries: Entry[] = [
    { name: "A", code: "A1" },
    { name: "B", code: "B1" },
    { name: "C", code: "C1" },
  ];

  test("eligible excludes winner and absent codes", () => {
    const draws: Draw[] = [
      { round: 1, name: "A", code: "A1", status: "winner", at: "2026-01-01T00:00:00.000Z" },
      { round: 1, name: "B", code: "B1", status: "absent", at: "2026-01-01T00:01:00.000Z" },
    ];
    expect(eligible(entries, draws)).toEqual([{ name: "C", code: "C1" }]);
  });

  test("pickWinner never returns a drawn entry", () => {
    const draws: Draw[] = [
      { round: 1, name: "A", code: "A1", status: "winner", at: "2026-01-01T00:00:00.000Z" },
    ];
    const source = fixedSource([0]);
    const winner = pickWinner(entries, draws, source);
    expect(winner).toEqual({ name: "B", code: "B1" });
  });

  test("pickWinner returns null when exhausted", () => {
    const draws: Draw[] = entries.map((e, i) => ({
      round: (Math.min(i + 1, 3) as 1 | 2 | 3),
      name: e.name,
      code: e.code,
      status: "winner" as const,
      at: "2026-01-01T00:00:00.000Z",
    }));
    expect(pickWinner(entries, draws, fixedSource([0]))).toBeNull();
  });
});

describe("buildReel", () => {
  const entries: Entry[] = Array.from({ length: 20 }, (_, i) => ({
    name: `Person ${i}`,
    code: `CODE-${String(i).padStart(2, "0")}`,
  }));

  test("puts the winner at targetIndex with 2 trailing codes and length ≥ 63", () => {
    const winner = entries[5];
    if (!winner) throw new Error("missing winner fixture");
    const draws: Draw[] = [
      { round: 1, name: "Person 0", code: "CODE-00", status: "winner", at: "2026-01-01T00:00:00.000Z" },
    ];
    const source = fixedSource([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    const reel = buildReel(entries, draws, winner, source);

    expect(reel.targetIndex).toBeGreaterThanOrEqual(60);
    expect(reel.codes[reel.targetIndex]).toBe(winner.code);
    expect(reel.codes).toHaveLength(reel.targetIndex + 1 + 2);
    expect(reel.codes.length).toBeGreaterThanOrEqual(63);

    const eligibleCodes = new Set(eligible(entries, draws).map((e) => e.code));
    for (const code of reel.codes) {
      expect(eligibleCodes.has(code)).toBe(true);
    }

    const before = reel.codes.slice(Math.max(0, reel.targetIndex - 3), reel.targetIndex);
    expect(before).not.toContain(winner.code);
  });
});
