/**
 * Pure giveaway draw helpers: parse survey sheets, fair crypto RNG, and reel layout.
 * No React and no SheetJS — unit-testable in Node.
 */

export type Entry = { name: string; code: string };

export type Draw = {
  round: 1 | 2 | 3;
  name: string;
  code: string;
  status: "winner" | "absent";
  at: string;
};

export type ParseResult = {
  entries: Entry[];
  skippedMissing: number;
  duplicates: number;
  suspicious: number;
};

/** RNG fill function; defaults to crypto.getRandomValues. */
export type RandomSource = (buf: Uint32Array) => Uint32Array;

const NAME_HEADERS = new Set(["full name", "fullname", "name"]);
const CODE_HEADERS = new Set(["code"]);
const SCI_NOTATION = /^\d+(\.\d+)?e[+-]?\d+$/i;
const MISSING_COLUMNS = "The sheet needs two columns: Full name and Code.";

/**
 * Coerce a cell to a trimmed string.
 */
function cellString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * True when a code looks damaged by Excel (scientific notation or trailing .0).
 */
function isSuspicious(code: string): boolean {
  return SCI_NOTATION.test(code) || code.endsWith(".0");
}

/**
 * Parse a 2D sheet into unique entries with skip/duplicate/suspicious counts.
 */
export function parseEntries(rows: unknown[][]): ParseResult {
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (row.some((cell) => cellString(cell) !== "")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex < 0) {
    throw new Error(MISSING_COLUMNS);
  }

  const headerRow = rows[headerIndex] ?? [];
  let nameCol = -1;
  let codeCol = -1;
  for (let c = 0; c < headerRow.length; c++) {
    const key = cellString(headerRow[c]).toLowerCase();
    if (nameCol < 0 && NAME_HEADERS.has(key)) nameCol = c;
    if (codeCol < 0 && CODE_HEADERS.has(key)) codeCol = c;
  }

  if (nameCol < 0 || codeCol < 0) {
    throw new Error(MISSING_COLUMNS);
  }

  const entries: Entry[] = [];
  const seenCodes = new Set<string>();
  let skippedMissing = 0;
  let duplicates = 0;
  let suspicious = 0;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const name = cellString(row[nameCol]);
    const code = cellString(row[codeCol]);
    const fullyEmpty = row.every((cell) => cellString(cell) === "");
    if (fullyEmpty) continue;

    if (!name || !code) {
      skippedMissing++;
      continue;
    }

    if (seenCodes.has(code)) {
      duplicates++;
      continue;
    }

    seenCodes.add(code);
    if (isSuspicious(code)) suspicious++;
    entries.push({ name, code });
  }

  return { entries, skippedMissing, duplicates, suspicious };
}

/**
 * Uniform integer in [0, max) via rejection sampling over crypto random 32-bit values.
 */
export function randomInt(max: number, source?: RandomSource): number {
  if (max < 1) {
    throw new Error("randomInt max must be at least 1");
  }
  if (max === 1) return 0;

  const fill: RandomSource =
    source ??
    ((buf) => {
      crypto.getRandomValues(buf);
      return buf;
    });

  const buf = new Uint32Array(1);
  // Largest multiple of max that fits in 2^32, so remainders stay uniform.
  const limit = Math.floor(0x100000000 / max) * max;

  for (;;) {
    fill(buf);
    const value = buf[0] ?? 0;
    if (value < limit) return value % max;
  }
}

/**
 * Fisher–Yates shuffle returning a new array.
 */
export function shuffle<T>(items: T[], source?: RandomSource): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, source);
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * Entries whose code has not appeared in any draw (winner or absent).
 */
export function eligible(entries: Entry[], draws: Draw[]): Entry[] {
  const used = new Set(draws.map((d) => d.code));
  return entries.filter((e) => !used.has(e.code));
}

/**
 * Pick one random eligible entry, or null when none remain.
 */
export function pickWinner(
  entries: Entry[],
  draws: Draw[],
  source?: RandomSource,
): Entry | null {
  const pool = eligible(entries, draws);
  if (pool.length === 0) return null;
  const index = randomInt(pool.length, source);
  return pool[index] ?? null;
}

/**
 * Build a spinning reel list with the winner at targetIndex and two trailing codes.
 */
export function buildReel(
  entries: Entry[],
  draws: Draw[],
  winner: Entry,
  source?: RandomSource,
): { codes: string[]; targetIndex: number } {
  const pool = eligible(entries, draws);
  if (pool.length === 0) {
    throw new Error("No eligible entries for the reel");
  }

  const codes: string[] = [];
  // Repeat shuffled eligible codes until the prefix is long enough.
  while (codes.length < 60) {
    const batch = shuffle(
      pool.map((e) => e.code),
      source,
    );
    for (const code of batch) {
      codes.push(code);
      if (codes.length >= 60) break;
    }
  }

  // Ensure the three codes just before the winner are not the winner's code.
  for (let i = Math.max(0, codes.length - 3); i < codes.length; i++) {
    if (codes[i] === winner.code) {
      const replacement = pool.find((e) => e.code !== winner.code);
      codes[i] = replacement?.code ?? codes[i] ?? winner.code;
    }
  }

  const targetIndex = codes.length;
  codes.push(winner.code);

  // Two trailing codes so the row below the winner is never empty.
  const trailingPool = shuffle(
    pool.map((e) => e.code),
    source,
  );
  let t = 0;
  while (codes.length < targetIndex + 1 + 2) {
    const next = trailingPool[t % trailingPool.length];
    t++;
    if (next === undefined) {
      codes.push(winner.code);
    } else {
      codes.push(next);
    }
  }

  return { codes, targetIndex };
}
