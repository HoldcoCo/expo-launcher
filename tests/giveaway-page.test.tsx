/** @vitest-environment jsdom */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { Draw, Entry } from "@/lib/giveaway";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const sheetToJson = vi.fn();
const xlsxRead = vi.fn();

vi.mock("xlsx", () => ({
  read: (...args: unknown[]) => xlsxRead(...args),
  utils: {
    sheet_to_json: (...args: unknown[]) => sheetToJson(...args),
  },
}));

import GiveawayPage from "@/app/giveaway/page";

/**
 * Mirror the page's off-screen measure so the fit assertion uses the same path.
 */
function measureCodeWidth(code: string, sizePx: number): number {
  const span = document.createElement("span");
  span.style.position = "absolute";
  span.style.left = "-99999px";
  span.style.top = "0";
  span.style.visibility = "hidden";
  span.style.whiteSpace = "nowrap";
  span.style.fontFamily = "Lexend, ui-sans-serif, system-ui, sans-serif";
  span.style.fontWeight = "600";
  span.style.letterSpacing = "0.04em";
  span.style.fontVariantNumeric = "tabular-nums";
  span.style.fontSize = `${sizePx}px`;
  span.textContent = code;
  document.body.appendChild(span);
  const width = span.getBoundingClientRect().width;
  document.body.removeChild(span);
  return width;
}

const STORAGE_KEY = "expo-giveaway-v1";

/**
 * Stub matchMedia for prefers-reduced-motion.
 */
function stubReducedMotion(reduced: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

/**
 * Seed localStorage with a persisted draw.
 */
function seedStorage(partial: {
  fileName?: string;
  importedAt?: string;
  entries: Entry[];
  draws: Draw[];
}): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      fileName: partial.fileName ?? "survey.xlsx",
      importedAt: partial.importedAt ?? "2026-10-07T10:00:00.000Z",
      entries: partial.entries,
      draws: partial.draws,
    }),
  );
}

/**
 * Deterministic crypto.getRandomValues: always writes 0 into each slot.
 */
function stubCryptoZero(): void {
  vi.stubGlobal("crypto", {
    getRandomValues: <T extends ArrayBufferView>(buf: T): T => {
      const view = new Uint32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
      view.fill(0);
      return buf;
    },
  });
}

beforeEach(() => {
  replace.mockReset();
  localStorage.clear();
  sheetToJson.mockReset();
  xlsxRead.mockReset();
  xlsxRead.mockReturnValue({
    SheetNames: ["Sheet1"],
    Sheets: { Sheet1: {} },
  });
  stubReducedMotion(false);
  stubCryptoZero();
  // Stay ahead of performance.now() so reduced-motion fades (which use t0 = performance.now()) complete.
  let rafTime = performance.now();
  const rafTimers = new Map<number, ReturnType<typeof setTimeout>>();
  let rafId = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback): number => {
      rafTime = Math.max(rafTime, performance.now()) + 500;
      rafId += 1;
      const id = rafId;
      rafTimers.set(
        id,
        setTimeout(() => {
          rafTimers.delete(id);
          cb(rafTime);
        }, 0),
      );
      return id;
    },
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    const timer = rafTimers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    rafTimers.delete(id);
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(): void {
        this.callback([], this);
      }
      unobserve(): void {
        /* no-op */
      }
      disconnect(): void {
        /* no-op */
      }
    },
  );
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  // Drop any fullscreenElement stub left by the full-screen test.
  try {
    Reflect.deleteProperty(document, "fullscreenElement");
  } catch {
    /* ignore */
  }
});

describe("GiveawayPage", () => {
  test("importing a parsed sheet shows the summary line", async () => {
    sheetToJson.mockReturnValue([
      ["Full name", "Code"],
      ["Ada Lovelace", "AX-001"],
      ["Grace Hopper", "AX-002"],
      ["", ""],
      ["Missing", ""],
    ]);

    render(<GiveawayPage />);
    expect(
      await screen.findByText("Drop the survey sheet here, or choose a file"),
    ).toBeVisible();

    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    if (!(input instanceof HTMLInputElement)) throw new Error("missing file input");

    const file = new File([new Uint8Array([1, 2, 3])], "texpo-survey.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await userEvent.upload(input, file);

    expect(await screen.findByText("2 entries in the draw")).toBeVisible();
    expect(screen.queryByText(/texpo-survey\.xlsx/)).toBeNull();
    expect(screen.getByText("1 rows skipped (missing name or code)")).toBeVisible();
  });

  test("fitted font size keeps a 16-digit code within the 320px frame", async () => {
    const code = "1234567890123456";
    const CHAR_FACTOR = 0.6;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(
      this: HTMLElement,
    ): DOMRect {
      const fontSize = Number.parseFloat(this.style.fontSize || "16");
      const text = this.textContent ?? "";
      const width = text.length * fontSize * CHAR_FACTOR;
      return {
        x: 0,
        y: 0,
        width,
        height: fontSize,
        top: 0,
        left: 0,
        bottom: fontSize,
        right: width,
        toJSON: () => ({}),
      };
    };

    const clientWidthDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement): number {
        if (this.getAttribute("data-testid") === "giveaway-highlight") return 320;
        return 0;
      },
    });

    try {
      seedStorage({
        entries: [
          { name: "Long code", code },
          { name: "Short", code: "AB" },
        ],
        draws: [],
      });

      render(<GiveawayPage />);

      await waitFor(() => {
        expect(screen.getByText("2 entries in the draw")).toBeVisible();
      });

      const row = await waitFor(() => {
        const el = document.querySelector('[data-testid="giveaway-reel-row"]');
        if (!(el instanceof HTMLElement)) throw new Error("missing reel row");
        expect(el.style.fontSize).not.toBe("32px");
        return el;
      });

      const fontSize = Number.parseFloat(row.style.fontSize);
      const measuredAt100 = measureCodeWidth(code, 100);
      const available = 320 - 32;
      const expected = Math.min(68, (100 * available) / measuredAt100);
      expect(fontSize).toBeCloseTo(expected, 5);

      const measuredAtFit = measureCodeWidth(code, fontSize);
      expect(measuredAtFit).toBeLessThanOrEqual(288);
      expect(screen.queryByText(/survey\.xlsx/)).toBeNull();
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
      if (clientWidthDesc) {
        Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDesc);
      }
    }
  });

  test("full screen hides Replace sheet and Reset draw", async () => {
    seedStorage({
      entries: [
        { name: "Ada", code: "A1" },
        { name: "Grace", code: "G1" },
        { name: "Alan", code: "T1" },
      ],
      draws: [
        {
          round: 1,
          name: "Ada",
          code: "A1",
          status: "winner",
          at: "2026-10-07T10:01:00.000Z",
        },
      ],
    });

    render(<GiveawayPage />);
    expect(await screen.findByRole("button", { name: "Replace sheet" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reset draw" })).toBeVisible();

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    document.dispatchEvent(new Event("fullscreenchange"));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Replace sheet" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Reset draw" })).toBeNull();
    });

    expect(screen.getByRole("button", { name: "Spin for winner 2" })).toBeVisible();
    expect(
      screen.getByText("Three winners each get one year of AXIOM Express"),
    ).toBeVisible();
  });

  test("with 3 winners in localStorage, shows filled slots and All winners drawn", async () => {
    const entries: Entry[] = [
      { name: "A", code: "A1" },
      { name: "B", code: "B1" },
      { name: "C", code: "C1" },
      { name: "D", code: "D1" },
    ];
    const draws: Draw[] = [
      { round: 1, name: "A", code: "A1", status: "winner", at: "2026-10-07T10:01:00.000Z" },
      { round: 2, name: "B", code: "B1", status: "winner", at: "2026-10-07T10:02:00.000Z" },
      { round: 3, name: "C", code: "C1", status: "winner", at: "2026-10-07T10:03:00.000Z" },
    ];
    seedStorage({ entries, draws });

    render(<GiveawayPage />);

    expect(await screen.findByRole("button", { name: "All winners drawn" })).toBeDisabled();
    expect(screen.getByText("3 of 3")).toBeVisible();
    expect(screen.getByText("A")).toBeVisible();
    expect(screen.getByText("B")).toBeVisible();
    expect(screen.getByText("C")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Spin for winner/ })).toBeNull();
  });

  test("Not here? Redraw moves winner to absent and re-enables spin for the same round", async () => {
    const entries: Entry[] = [
      { name: "Ada", code: "A1" },
      { name: "Grace", code: "G1" },
      { name: "Alan", code: "T1" },
    ];
    const draws: Draw[] = [
      {
        round: 1,
        name: "Ada",
        code: "A1",
        status: "winner",
        at: "2026-10-07T10:01:00.000Z",
      },
    ];
    seedStorage({ entries, draws });

    // Landed state is only after a spin; seed one winner then spin is for round 2.
    // To exercise Redraw we need showWinnerCard — set landed via a spin with reduced motion.
    stubReducedMotion(true);
    render(<GiveawayPage />);

    // After restore with 1 winner, spin for winner 2, then redraw that winner.
    const spinBtn = await screen.findByRole("button", { name: "Spin for winner 2" });
    await userEvent.click(spinBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Not here? Redraw" })).toBeVisible();
    });

    vi.stubGlobal(
      "confirm",
      vi.fn().mockReturnValue(true),
    );

    await userEvent.click(screen.getByRole("button", { name: "Not here? Redraw" }));

    expect(await screen.findByText("Redrawn (not present)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Spin for winner 2" })).toBeEnabled();
  });

  test("reduced-motion spin reveals a winner not among previous draws", async () => {
    stubReducedMotion(true);
    const entries: Entry[] = [
      { name: "Ada", code: "A1" },
      { name: "Grace", code: "G1" },
      { name: "Alan", code: "T1" },
    ];
    const draws: Draw[] = [
      {
        round: 1,
        name: "Ada",
        code: "A1",
        status: "winner",
        at: "2026-10-07T10:01:00.000Z",
      },
    ];
    seedStorage({ entries, draws });

    render(<GiveawayPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Spin for winner 2" }));

    await waitFor(() => {
      expect(screen.getByText("Winner 2 of 3")).toBeVisible();
    });

    // crypto stub always returns 0 → first eligible is Grace (Ada already drawn).
    const card = screen.getByText("Winner 2 of 3").closest("div");
    expect(card).toBeTruthy();
    if (!card) throw new Error("missing winner card");
    expect(within(card).getByText("Grace")).toBeVisible();
    expect(within(card).queryByText("Ada")).toBeNull();
  });

  test("after a spin lands, Winner N label is absolute and frame height is unchanged", async () => {
    stubReducedMotion(true);
    seedStorage({
      entries: [
        { name: "Ada", code: "A1" },
        { name: "Grace", code: "G1" },
        { name: "Alan", code: "T1" },
      ],
      draws: [],
    });

    render(<GiveawayPage />);
    const frame = await waitFor(() => {
      const el = document.querySelector('[data-testid="giveaway-highlight"]');
      if (!(el instanceof HTMLElement)) throw new Error("missing highlight");
      return el;
    });
    const heightBefore = frame.getBoundingClientRect().height || frame.clientHeight || Number.parseFloat(frame.style.height);

    await userEvent.click(await screen.findByRole("button", { name: "Spin for winner 1" }));

    const label = await screen.findByTestId("giveaway-winner-label");
    expect(label).toBeVisible();
    expect(label.textContent).toMatch(/Winner 1/i);
    expect(getComputedStyle(label).position).toBe("absolute");

    const heightAfter = frame.getBoundingClientRect().height || frame.clientHeight || Number.parseFloat(frame.style.height);
    expect(heightAfter).toBe(heightBefore);
  });

  test("a drawn slot renders the name and the code", async () => {
    seedStorage({
      entries: [
        { name: "Ada Lovelace", code: "AX-001" },
        { name: "Grace", code: "G1" },
      ],
      draws: [
        {
          round: 1,
          name: "Ada Lovelace",
          code: "AX-001",
          status: "winner",
          at: "2026-10-07T10:01:00.000Z",
        },
      ],
    });

    render(<GiveawayPage />);
    const slot = await screen.findByTestId("giveaway-slot-1");
    expect(within(slot).getByText("Ada Lovelace")).toBeVisible();
    expect(within(slot).getByText("AX-001")).toBeVisible();
  });

  test("after a spin lands, the centre row keeps the winner code and Ready is gone", async () => {
    stubReducedMotion(true);
    seedStorage({
      entries: [
        { name: "Ada", code: "A1" },
        { name: "Grace", code: "G1" },
        { name: "Alan", code: "T1" },
      ],
      draws: [],
    });

    render(<GiveawayPage />);
    await screen.findByRole("button", { name: "Spin for winner 1" });
    // Idle Ready is visible before the spin.
    await waitFor(() => {
      expect(screen.getByText("Ready")).toBeVisible();
    });

    await userEvent.click(screen.getByRole("button", { name: "Spin for winner 1" }));

    await waitFor(() => {
      expect(screen.getByTestId("giveaway-winner-label")).toBeVisible();
    });

    expect(screen.queryByText("Ready")).toBeNull();
    // crypto stub → first eligible entry Ada / A1.
    const rows = screen.getAllByTestId("giveaway-reel-row");
    const centre = rows[2];
    expect(centre?.textContent).toBe("A1");
  });

  test("after Not here? Redraw, Ready shows again", async () => {
    stubReducedMotion(true);
    seedStorage({
      entries: [
        { name: "Ada", code: "A1" },
        { name: "Grace", code: "G1" },
        { name: "Alan", code: "T1" },
      ],
      draws: [],
    });

    render(<GiveawayPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Spin for winner 1" }));
    await screen.findByRole("button", { name: "Not here? Redraw" });

    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    await userEvent.click(screen.getByRole("button", { name: "Not here? Redraw" }));

    expect(await screen.findByText("Ready")).toBeVisible();
  });

  test("frame background is below rows and border is above with transparent fill", async () => {
    seedStorage({
      entries: [
        { name: "Ada", code: "A1" },
        { name: "Grace", code: "G1" },
      ],
      draws: [],
    });

    render(<GiveawayPage />);
    await screen.findByText("2 entries in the draw");

    const bg = document.querySelector('[data-layer="frame-bg"]');
    const rows = document.querySelector('[data-layer="reel-rows"]');
    const border = document.querySelector('[data-layer="frame-border"]');
    expect(bg).toBeTruthy();
    expect(rows).toBeTruthy();
    expect(border).toBeTruthy();
    if (!(bg instanceof HTMLElement) || !(rows instanceof HTMLElement) || !(border instanceof HTMLElement)) {
      throw new Error("missing frame layers");
    }

    const parent = bg.parentElement;
    expect(parent).toBe(rows.parentElement);
    expect(parent).toBe(border.parentElement);
    const children = [...(parent?.children ?? [])];
    expect(children.indexOf(bg)).toBeLessThan(children.indexOf(rows));
    expect(children.indexOf(rows)).toBeLessThan(children.indexOf(border));
    expect(border.style.background).toBe("transparent");
  });

  test("fit-to-frame measuring span uses Lexend with letter-spacing 0.04em", async () => {
    const seen: Array<{ fontFamily: string; letterSpacing: string }> = [];
    const origAppend = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation((node: Node) => {
      if (node instanceof HTMLElement && node.getAttribute("data-testid") === "giveaway-measure-span") {
        seen.push({
          fontFamily: node.style.fontFamily,
          letterSpacing: node.style.letterSpacing,
        });
      }
      return origAppend(node);
    });

    seedStorage({
      entries: [
        { name: "Long", code: "1234567890123456" },
        { name: "Short", code: "AB" },
      ],
      draws: [],
    });

    render(<GiveawayPage />);
    await screen.findByText("2 entries in the draw");

    await waitFor(() => {
      expect(seen.length).toBeGreaterThan(0);
    });

    const last = seen[seen.length - 1];
    if (!last) throw new Error("no measure span captured");
    expect(last.fontFamily.toLowerCase()).toContain("lexend");
    expect(last.letterSpacing).toBe("0.04em");
  });
});
