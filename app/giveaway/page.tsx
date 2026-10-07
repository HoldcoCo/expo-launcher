"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  LayoutGrid,
  Maximize,
  Minimize,
  Shuffle,
  Upload,
} from "lucide-react";
import * as XLSX from "xlsx";
import { HoldcoLogo } from "@/components/HoldcoLogo";
import { Toast, type ToastMessage } from "@/components/Toast";
import {
  buildReel,
  eligible,
  parseEntries,
  pickWinner,
  type Draw,
  type Entry,
} from "@/lib/giveaway";
import {
  applyCodeTypeStyles,
  drumRowOpacity,
} from "@/app/giveaway/code-style";

const STORAGE_KEY = "expo-giveaway-v1";
const ACCEPT = ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";
const SPIN_MS = 6500;
const SETTLE_MS = 300;
const ANGLE_DEG = 34;
const CONFETTI_COLORS = ["var(--color-ink)", "var(--color-violet)", "var(--color-magenta)"] as const;

type StoredState = {
  fileName: string;
  importedAt: string;
  entries: Entry[];
  draws: Draw[];
};

type ImportSummary = {
  skippedMissing: number;
  duplicates: number;
  suspicious: number;
};

type ConfettiPiece = {
  id: number;
  left: number;
  color: string;
  delay: number;
  rot0: number;
  rot1: number;
  dx: number;
};

type ReelMode = "idle" | "spinning" | "landed";

/**
 * Ease-out quintic for the main spin curve.
 */
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

/**
 * Measure a code string at a given font size using a hidden off-screen span
 * that matches the reel's Lexend 600 / letter-spacing / tabular-nums face.
 */
function measureCodeWidth(code: string, sizePx: number): number {
  if (typeof document === "undefined") return 0;
  const span = document.createElement("span");
  span.setAttribute("data-testid", "giveaway-measure-span");
  span.style.position = "absolute";
  span.style.left = "-99999px";
  span.style.top = "0";
  span.style.visibility = "hidden";
  applyCodeTypeStyles(span);
  span.style.fontSize = `${sizePx}px`;
  span.textContent = code;
  document.body.appendChild(span);
  const width = span.getBoundingClientRect().width;
  document.body.removeChild(span);
  return width;
}

/**
 * Fit code font size to the highlight frame: min(68px, 100 × available / measuredAt100).
 * Available = frame inner width minus 32px (16px padding each side).
 */
function fitCodeFontSize(measuredAt100: number, frameInnerWidth: number): number {
  const available = frameInnerWidth - 32;
  if (measuredAt100 <= 0 || available <= 0) return 32;
  return Math.min(68, (100 * available) / measuredAt100);
}

/**
 * Longest code string among entries (by character length).
 */
function longestEntryCode(entries: Entry[]): string {
  let longest = "";
  for (const entry of entries) {
    if (entry.code.length > longest.length) longest = entry.code;
  }
  return longest;
}

/**
 * Format a Date as HH:MM for toast / meta copy.
 */
function formatHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Persist draw state on this device; swallow quota / private-mode errors.
 */
function saveStored(state: StoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/**
 * Restore persisted draw state, or null when missing / invalid.
 */
function loadStored(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.fileName !== "string" || typeof obj.importedAt !== "string") return null;
    if (!Array.isArray(obj.entries) || !Array.isArray(obj.draws)) return null;
    return {
      fileName: obj.fileName,
      importedAt: obj.importedAt,
      entries: obj.entries as Entry[],
      draws: obj.draws as Draw[],
    };
  } catch {
    return null;
  }
}

/**
 * Build and trigger a CSV download of all draws.
 */
function downloadResultsCsv(draws: Draw[]): void {
  const header = ["Round", "Full name", "Code", "Status", "Drawn at"];
  const lines = [
    header.join(","),
    ...draws.map((d) =>
      [String(d.round), csvEscape(d.name), csvEscape(d.code), d.status, d.at].join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "texpo-2026-giveaway-results.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Escape a CSV field when it contains commas, quotes, or newlines.
 */
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, "\"\"")}"`;
  return value;
}

/**
 * True when the user prefers reduced motion.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Apply 3D drum transforms for visible codes around float position p.
 */
function paintReel(
  rowEls: Array<HTMLElement | null>,
  codes: string[],
  p: number,
  rowH: number,
  blur: boolean,
  centreLabel?: string,
  codeFontPx?: number,
): void {
  const rad = (ANGLE_DEG * Math.PI) / 180;
  const R = rowH / rad;
  for (let i = 0; i < rowEls.length; i++) {
    const el = rowEls[i];
    if (!el) continue;
    const codeIndex = Math.round(p) + (i - 2);
    const d = codeIndex - p;
    if (Math.abs(d) > 2.01 || codeIndex < 0 || codeIndex >= codes.length) {
      el.style.visibility = "hidden";
      el.style.opacity = "0";
      continue;
    }
    const angle = d * rad;
    const y = R * Math.sin(angle);
    const z = R * Math.cos(angle) - R;
    el.style.visibility = "visible";
    el.style.transform = `translate3d(0, ${y}px, ${z}px) rotateX(${-ANGLE_DEG * d}deg)`;
    el.style.opacity = String(drumRowOpacity(Math.abs(d)));
    el.style.filter = blur ? "blur(1px)" : "none";
    const isCentre = Math.abs(d) < 0.01;
    if (centreLabel !== undefined && isCentre) {
      el.textContent = centreLabel;
      el.style.fontFamily = "Figtree, ui-sans-serif, system-ui, sans-serif";
      el.style.fontWeight = "700";
      el.style.letterSpacing = "-0.02em";
      el.style.fontSize = "clamp(48px, 6vw, 80px)";
      el.style.color = "var(--color-ink-deep)";
    } else {
      el.textContent = codes[codeIndex] ?? "";
      applyCodeTypeStyles(el);
      if (codeFontPx !== undefined) el.style.fontSize = `${codeFontPx}px`;
    }
  }
}

export default function GiveawayPage() {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const reelWindowRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([null, null, null, null, null]);
  const rafRef = useRef<number>(0);
  const positionRef = useRef(0);
  const codeSizeRef = useRef(32);
  /** Last spun reel sequence; kept after landing so Ready does not replace the winner. */
  const lastReelCodesRef = useRef<string[] | null>(null);
  const lastTargetIndexRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [importedAt, setImportedAt] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [forceSuspicious, setForceSuspicious] = useState(false);
  const [showImport, setShowImport] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reelMode, setReelMode] = useState<ReelMode>("idle");
  const [codeSizePx, setCodeSizePx] = useState(32);
  const [latestWinnerAt, setLatestWinnerAt] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fullscreenOn, setFullscreenOn] = useState(false);
  const [fullscreenOk, setFullscreenOk] = useState(false);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const winners = draws.filter((d) => d.status === "winner").sort((a, b) => a.round - b.round);
  const absents = draws.filter((d) => d.status === "absent");
  const currentRound = (Math.min(winners.length + 1, 3) as 1 | 2 | 3);
  const pool = eligible(entries, draws);
  const drawComplete = winners.length >= 3 || (entries.length > 0 && pool.length === 0);
  const suspiciousBlocked =
    summary !== null && summary.suspicious > 0 && !forceSuspicious;

  const persist = useCallback(
    (next: { fileName: string; importedAt: string; entries: Entry[]; draws: Draw[] }) => {
      saveStored(next);
    },
    [],
  );

  /** Log out the booth session the same way as the launcher. */
  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  /**
   * Measure the longest loaded code against the highlight frame and set the reel font size.
   */
  const recomputeCodeSize = useCallback(() => {
    const frame = highlightRef.current;
    if (!frame || entries.length === 0) return;
    const longest = longestEntryCode(entries);
    if (!longest) return;
    const measuredAt100 = measureCodeWidth(longest, 100);
    const next = fitCodeFontSize(measuredAt100, frame.clientWidth);
    codeSizeRef.current = next;
    setCodeSizePx(next);
  }, [entries]);

  /** Clear the last landed reel so the next idle paint shows Ready again. */
  function clearLastReel(): void {
    lastReelCodesRef.current = null;
    lastTargetIndexRef.current = null;
  }

  /** Paint the idle reel: three eligible codes with centre label "Ready". */
  const paintIdle = useCallback(() => {
    const poolCodes = eligible(entries, draws).map((e) => e.code);
    const sample =
      poolCodes.length === 0
        ? ["—", "—", "—"]
        : [
            poolCodes[0] ?? "—",
            poolCodes[1] ?? poolCodes[0] ?? "—",
            poolCodes[2] ?? poolCodes[0] ?? "—",
          ];
    // Synthetic indices 0,1,2 with p=1 so centre is index 1 ("Ready").
    positionRef.current = 1;
    const H = 1.7 * codeSizeRef.current;
    requestAnimationFrame(() => {
      paintReel(rowRefs.current, sample, 1, H, false, "Ready", codeSizeRef.current);
    });
  }, [entries, draws]);

  /** Re-paint the last landed reel at targetIndex (winner centred with real neighbours). */
  const paintLanded = useCallback(() => {
    const codes = lastReelCodesRef.current;
    const target = lastTargetIndexRef.current;
    if (!codes || target === null) return;
    positionRef.current = target;
    const H = 1.7 * codeSizeRef.current;
    requestAnimationFrame(() => {
      paintReel(rowRefs.current, codes, target, H, false, undefined, codeSizeRef.current);
      const centre = rowRefs.current[2];
      if (centre) centre.style.color = "var(--color-ink)";
    });
  }, []);

  useEffect(() => {
    const stored = loadStored();
    if (stored && stored.entries.length > 0) {
      setFileName(stored.fileName);
      setImportedAt(stored.importedAt);
      setEntries(stored.entries);
      setDraws(stored.draws);
      setShowImport(false);
      setSummary(null);
      const winCount = stored.draws.filter((d) => d.status === "winner").length;
      if (winCount > 0) {
        setToast({
          text: `Restored the draw from ${formatHm(stored.importedAt)} (${winCount} of 3 winners).`,
          tone: "info",
        });
      }
    }
    setHydrated(true);
    setFullscreenOk(typeof document !== "undefined" && Boolean(document.fullscreenEnabled));
  }, []);

  useEffect(() => {
    if (!hydrated || entries.length === 0) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled) recomputeCodeSize();
    };
    // Double rAF so reel max-width has applied after entering/leaving full screen.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    const fonts = document.fonts;
    if (fonts) {
      void fonts.ready.then(run);
    }
    const reel = reelWindowRef.current;
    if (!reel || typeof ResizeObserver === "undefined") {
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
    }
    const ro = new ResizeObserver(run);
    ro.observe(reel);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [hydrated, entries, recomputeCodeSize, showImport, fullscreenOn]);

  useEffect(() => {
    if (!hydrated) return;
    if (entries.length === 0 || reelMode === "spinning") return;
    if (reelMode === "landed") {
      paintLanded();
      return;
    }
    paintIdle();
  }, [hydrated, entries, draws, reelMode, paintIdle, paintLanded, codeSizePx]);

  useEffect(() => {
    function onFs() {
      setFullscreenOn(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /**
   * Parse an ArrayBuffer workbook / CSV into entries and update state.
   */
  async function importBuffer(buffer: ArrayBuffer, name: string): Promise<void> {
    setImportError(null);
    try {
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("The sheet needs two columns: Full name and Code.");
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) throw new Error("The sheet needs two columns: Full name and Code.");
      const rows = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null | undefined)[]>(
        sheet,
        { header: 1, raw: false, defval: "" },
      );
      const parsed = parseEntries(rows);
      const at = new Date().toISOString();
      setFileName(name);
      setImportedAt(at);
      setEntries(parsed.entries);
      setDraws([]);
      setSummary({
        skippedMissing: parsed.skippedMissing,
        duplicates: parsed.duplicates,
        suspicious: parsed.suspicious,
      });
      setForceSuspicious(false);
      setShowImport(false);
      setLatestWinnerAt(null);
      clearLastReel();
      setReelMode("idle");
      persist({ fileName: name, importedAt: at, entries: parsed.entries, draws: [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't read that file.";
      setImportError(message);
    }
  }

  async function onFileChosen(file: File): Promise<void> {
    if (draws.length > 0) {
      const ok = window.confirm("Importing a new sheet clears the current draw. Continue?");
      if (!ok) return;
    }
    const buffer = await file.arrayBuffer();
    await importBuffer(buffer, file.name);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void onFileChosen(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void onFileChosen(file);
  }

  /**
   * Burst 28 token-coloured rectangles from the top of the stage.
   */
  function fireConfetti() {
    if (prefersReducedMotion()) return;
    const pieces: ConfettiPiece[] = Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? CONFETTI_COLORS[0],
      delay: Math.random() * 300,
      rot0: Math.random() * 360,
      rot1: 180 + Math.random() * 360,
      dx: (Math.random() - 0.5) * 120,
    }));
    setConfetti(pieces);
    window.setTimeout(() => setConfetti([]), 1700);
  }

  /**
   * Animate the drum from the current position to targetIndex, then settle.
   */
  function runSpin(
    codes: string[],
    targetIndex: number,
    onDone: () => void,
  ): void {
    const H = 1.7 * codeSizeRef.current;
    const start = positionRef.current;
    const reduced = prefersReducedMotion();

    if (reduced) {
      const t0 = performance.now();
      const fade = (now: number) => {
        const t = Math.min(1, (now - t0) / 400);
        positionRef.current = targetIndex;
        paintReel(rowRefs.current, codes, targetIndex, H, false, undefined, codeSizeRef.current);
        const centre = rowRefs.current[2];
        if (centre) centre.style.opacity = String(t);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(fade);
        } else {
          onDone();
        }
      };
      rafRef.current = requestAnimationFrame(fade);
      return;
    }

    const distance = targetIndex - start;
    const t0 = performance.now();
    let lastP = start;
    let lastT = t0;

    const frame = (now: number) => {
      const elapsed = now - t0;
      let p: number;
      let blur = false;

      if (elapsed < SPIN_MS) {
        const t = easeOutQuint(elapsed / SPIN_MS);
        p = start + distance * t;
        const dt = Math.max(0.001, (now - lastT) / 1000);
        const speed = Math.abs(p - lastP) / dt;
        blur = speed > 8;
      } else if (elapsed < SPIN_MS + SETTLE_MS) {
        const u = (elapsed - SPIN_MS) / SETTLE_MS;
        // Overshoot +0.12 then settle back to targetIndex.
        if (u < 0.5) {
          p = targetIndex + 0.12 * (u / 0.5);
        } else {
          p = targetIndex + 0.12 * (1 - (u - 0.5) / 0.5);
        }
      } else {
        p = targetIndex;
        positionRef.current = p;
        paintReel(rowRefs.current, codes, p, H, false, undefined, codeSizeRef.current);
        onDone();
        return;
      }

      lastP = p;
      lastT = now;
      positionRef.current = p;
      paintReel(rowRefs.current, codes, p, H, blur, undefined, codeSizeRef.current);
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
  }

  function spin() {
    if (busy || drawComplete || suspiciousBlocked || entries.length === 0) return;
    const winner = pickWinner(entries, draws);
    if (!winner) {
      setToast({ text: "No eligible entries left.", tone: "error" });
      return;
    }
    const reel = buildReel(entries, draws, winner);
    clearLastReel();
    setBusy(true);
    setReelMode("spinning");
    setAnnounce(`Spinning for winner ${currentRound}`);
    setLatestWinnerAt(null);

    // Start near the beginning of the padded reel so the spin travels a long way.
    positionRef.current = Math.min(positionRef.current, 2);
    const H = 1.7 * codeSizeRef.current;
    paintReel(rowRefs.current, reel.codes, positionRef.current, H, false, undefined, codeSizeRef.current);

    runSpin(reel.codes, reel.targetIndex, () => {
      lastReelCodesRef.current = reel.codes;
      lastTargetIndexRef.current = reel.targetIndex;
      positionRef.current = reel.targetIndex;
      paintReel(
        rowRefs.current,
        reel.codes,
        reel.targetIndex,
        H,
        false,
        undefined,
        codeSizeRef.current,
      );
      const centre = rowRefs.current[2];
      if (centre) centre.style.color = "var(--color-ink)";

      const at = new Date().toISOString();
      const draw: Draw = {
        round: currentRound,
        name: winner.name,
        code: winner.code,
        status: "winner",
        at,
      };
      const nextDraws = [...draws, draw];
      setDraws(nextDraws);
      persist({ fileName, importedAt, entries, draws: nextDraws });
      setLatestWinnerAt(at);
      setReelMode("landed");
      setBusy(false);
      setAnnounce(`Winner ${currentRound}: ${winner.name}, code ${winner.code}`);
      fireConfetti();
    });
  }

  function markAbsent() {
    const last = [...winners].sort((a, b) => a.round - b.round).at(-1);
    if (!last || busy) return;
    const ok = window.confirm(
      `Mark ${last.name} as absent and draw again for winner ${last.round}?`,
    );
    if (!ok) return;
    const at = new Date().toISOString();
    const withoutWinner = draws.filter(
      (d) => !(d.status === "winner" && d.code === last.code && d.round === last.round),
    );
    const nextDraws: Draw[] = [
      ...withoutWinner,
      { round: last.round, name: last.name, code: last.code, status: "absent", at },
    ];
    setDraws(nextDraws);
    persist({ fileName, importedAt, entries, draws: nextDraws });
    setLatestWinnerAt(null);
    clearLastReel();
    setReelMode("idle");
  }

  function resetDraw() {
    const ok = window.confirm(
      "Clear all winners and start over? The imported sheet stays loaded.",
    );
    if (!ok) return;
    setDraws([]);
    persist({ fileName, importedAt, entries, draws: [] });
    setLatestWinnerAt(null);
    clearLastReel();
    setReelMode("idle");
  }

  async function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stage.requestFullscreen();
      }
    } catch {
      /* ignore */
    }
  }

  const latestWinner = winners.at(-1) ?? null;
  const showWinnerCard =
    reelMode === "landed" && latestWinner !== null && latestWinnerAt === latestWinner.at;

  const Hpx = 1.7 * codeSizePx;
  const reelMaxWidth = fullscreenOn ? "min(1100px, 88vw)" : "720px";
  const controlsMaxWidth = fullscreenOn ? "min(1100px, 88vw)" : "720px";

  const navBtnClass =
    "rounded-[8px] px-[14px] py-[10px] text-[16px] font-medium text-muted hover:bg-[#F1F3F6] disabled:opacity-50";
  const spinBtnClass =
    "inline-flex min-h-14 w-full max-w-full items-center justify-center gap-2 rounded-[12px] bg-ink px-10 py-5 font-sans text-[20px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(12,72,129,0.6)] hover:bg-ink-hover disabled:opacity-55";
  const operatorBtnClass =
    "rounded-[8px] px-[14px] py-2 text-[16px] font-medium text-muted hover:bg-[#ECEFF3] disabled:text-[#A3ACB7]";

  /**
   * Three winner slots — stacked in the side panel, or a row under the reel in full screen.
   */
  function winnerSlots(layout: "stack" | "row") {
    const listClass =
      layout === "row"
        ? "grid w-full max-w-[1100px] grid-cols-3 gap-4"
        : "flex flex-col gap-3";
    return (
      <ol className={listClass}>
        {([1, 2, 3] as const).map((round) => {
          const slot = winners.find((w) => w.round === round);
          const justRevealed =
            slot !== undefined &&
            latestWinnerAt === slot.at &&
            reelMode === "landed";
          if (!slot) {
            const isCurrent = round === currentRound && !drawComplete;
            return (
              <li
                key={round}
                data-testid={`giveaway-slot-${round}`}
                className={[
                  "rounded-[14px] border border-dashed px-[20px] py-[18px]",
                  isCurrent ? "border-ink bg-white" : "border-[#CDD3DB] bg-transparent",
                ].join(" ")}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={[
                      "flex size-10 shrink-0 items-center justify-center rounded-full text-[17px] font-semibold",
                      isCurrent ? "border-[1.5px] border-dashed border-ink bg-white text-ink" : "border-[1.5px] border-dashed border-[#CDD3DB] text-muted",
                    ].join(" ")}
                    style={{ fontFamily: "Lexend, sans-serif" }}
                  >
                    {round}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-muted">Winner {round}</p>
                    <p className="mt-0.5 text-[15px] font-medium text-muted">
                      {isCurrent
                        ? reelMode === "spinning"
                          ? "Drawing now…"
                          : "Up next"
                        : "Not drawn yet"}
                    </p>
                  </div>
                </div>
              </li>
            );
          }
          return (
            <li
              key={round}
              data-testid={`giveaway-slot-${round}`}
              className={[
                "rounded-[14px] border border-line bg-white px-[20px] py-[18px]",
                justRevealed ? "giveaway-reveal-in" : "",
              ].join(" ")}
              style={{
                boxShadow: "0 1px 2px rgba(15,42,68,.05)",
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-[17px] font-semibold text-white"
                  style={{ fontFamily: "Lexend, sans-serif" }}
                >
                  {round}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-muted">Winner {round}</p>
                      <p className="truncate text-[17px] font-semibold text-text">{slot.name}</p>
                      <p
                        className="mt-0.5 text-[18px] font-medium tracking-[0.03em] text-ink"
                        style={{
                          fontFamily: "Lexend, sans-serif",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {slot.code}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-[13px] font-medium text-muted">
                      {formatHm(slot.at)}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  if (!hydrated) {
    return <div className="min-h-dvh bg-canvas" />;
  }

  return (
    <div className="min-h-dvh bg-canvas">
      {!fullscreenOn && (
        <div className="flex h-[6px]" aria-hidden="true">
          <div className="w-1/4 bg-brand-red" />
          <div className="w-3/4 bg-ink" />
        </div>
      )}

      {!fullscreenOn && (
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-10 py-[18px]">
            <div className="mr-auto flex min-w-0 items-center">
              <HoldcoLogo height={44} />
              <span aria-hidden="true" className="mx-6 h-11 w-px shrink-0 bg-line" />
              <div className="min-w-0">
                <h1 className="font-sans text-[30px] font-extrabold tracking-[-0.02em] text-ink">
                  Giveaway draw
                </h1>
                <p className="mt-1 text-[15px] font-medium text-muted">
                  TEXPO 2026: three winners each get one year of AXIOM Express
                </p>
              </div>
            </div>

            <Link href="/" className={`inline-flex items-center gap-2 ${navBtnClass}`}>
              <LayoutGrid size={18} strokeWidth={1.75} aria-hidden="true" />
              Back to apps
            </Link>

            {fullscreenOk && (
              <button
                type="button"
                onClick={toggleFullscreen}
                disabled={busy}
                className={`inline-flex items-center gap-2 ${navBtnClass}`}
              >
                {fullscreenOn ? (
                  <Minimize size={18} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Maximize size={18} strokeWidth={1.75} aria-hidden="true" />
                )}
                Full screen
              </button>
            )}

            <button
              type="button"
              onClick={logout}
              disabled={busy}
              className={navBtnClass}
            >
              Log out
            </button>
          </div>
        </header>
      )}

      <main className={fullscreenOn ? "" : "mx-auto max-w-[1400px] px-10 py-10"}>
        <div
          className={
            fullscreenOn
              ? "grid grid-cols-1"
              : "flex flex-col gap-10 lg:flex-row"
          }
        >
          <div
            className={
              fullscreenOn
                ? ""
                : "flex min-w-0 flex-[1_1_600px] flex-col gap-6"
            }
          >
            <div
              ref={stageRef}
              className={[
                "relative flex flex-col bg-canvas",
                fullscreenOn
                  ? "h-full min-h-full gap-0 overflow-hidden"
                  : "gap-6",
              ].join(" ")}
              style={fullscreenOn ? { backgroundColor: "var(--color-canvas)" } : undefined}
            >
              {fullscreenOn && (
                <div className="flex h-[6px] shrink-0" aria-hidden="true">
                  <div className="w-1/4 bg-brand-red" />
                  <div className="w-3/4 bg-ink" />
                </div>
              )}

              {fullscreenOn && (
                <div className="flex shrink-0 items-center justify-between gap-6 p-8">
                  <HoldcoLogo height={44} />
                  <p
                    className="text-right font-semibold text-ink-deep"
                    style={{
                      fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif",
                      fontWeight: 600,
                      fontSize: "clamp(1rem, 1.6vw, 1.5rem)",
                    }}
                  >
                    Three winners each get one year of AXIOM Express
                  </p>
                </div>
              )}

              {confetti.map((piece) => {
                const pieceStyle: CSSProperties & Record<"--gx" | "--gr0" | "--gr1", string> = {
                  left: `${piece.left}%`,
                  background: piece.color,
                  animationDelay: `${piece.delay}ms`,
                  "--gx": `${piece.dx}px`,
                  "--gr0": `${piece.rot0}deg`,
                  "--gr1": `${piece.rot1}deg`,
                };
                return (
                  <span
                    key={piece.id}
                    className="giveaway-confetti-piece"
                    style={pieceStyle}
                  />
                );
              })}

              {(showImport || entries.length === 0) && !fullscreenOn && (
                <div className="flex flex-col gap-3">
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={[
                      "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed px-6 py-12 text-center",
                      dragOver ? "border-ink bg-surface" : "border-line-strong bg-surface",
                    ].join(" ")}
                  >
                    <FileSpreadsheet size={28} strokeWidth={1.75} className="text-ink" aria-hidden="true" />
                    <p className="text-base font-semibold text-text">
                      Drop the survey sheet here, or choose a file
                    </p>
                    <p className="text-[0.8125rem] font-medium text-muted">
                      Excel or CSV with two columns: Full name and Code.
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT}
                    className="sr-only"
                    onChange={onInputChange}
                  />
                  {importError && (
                    <p role="alert" className="text-base font-semibold text-bad">
                      {importError}
                    </p>
                  )}
                </div>
              )}

              {/* Keep file input mounted when import UI is hidden in full screen. */}
              {fullscreenOn && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  onChange={onInputChange}
                />
              )}

              {entries.length > 0 && !showImport && (
                <>
                  {!fullscreenOn && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <p
                        aria-label={`${entries.length} entries in the draw`}
                        className="text-[22px] font-semibold text-text"
                        style={{ fontFamily: "Lexend, sans-serif" }}
                      >
                        {`${entries.length} entries in the draw`}
                      </p>
                      {summary && summary.skippedMissing > 0 && (
                        <p className="text-[0.8125rem] font-medium text-muted">
                          {summary.skippedMissing} rows skipped (missing name or code)
                        </p>
                      )}
                      {summary && summary.duplicates > 0 && (
                        <p className="text-[0.8125rem] font-medium text-muted">
                          {summary.duplicates} duplicate codes removed
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setShowImport(true)}
                        className="inline-flex min-h-0 items-center gap-1.5 rounded-[8px] border border-[#D9DEE4] bg-white px-3 py-[7px] text-[15px] font-medium text-text hover:border-ink hover:text-ink disabled:opacity-50"
                      >
                        <Upload size={14} strokeWidth={1.75} aria-hidden="true" />
                        Replace sheet
                      </button>
                    </div>
                  )}

                  {!fullscreenOn && summary && summary.suspicious > 0 && (
                    <div
                      role="alert"
                      className="rounded-[12px] border border-line bg-bad-bg px-4 py-3 text-base text-bad"
                    >
                      <p className="font-semibold">
                        {summary.suspicious} codes look damaged by Excel. Format the Code column
                        as Text, re-export and import again.
                      </p>
                      <label className="mt-3 flex min-h-12 items-center gap-2 text-[0.9375rem] font-semibold text-text">
                        <input
                          type="checkbox"
                          checked={forceSuspicious}
                          disabled={busy}
                          onChange={(e) => setForceSuspicious(e.target.checked)}
                          className="size-4 accent-[var(--color-ink)]"
                        />
                        Use these codes anyway
                      </label>
                    </div>
                  )}

                  {/* Reel centrepiece */}
                  <div
                    className={[
                      "flex flex-col items-center gap-6",
                      fullscreenOn ? "min-h-0 flex-1 justify-center px-8" : "",
                    ].join(" ")}
                  >
                    <div
                      className={
                        fullscreenOn
                          ? "flex w-full flex-col items-center gap-6"
                          : "w-full rounded-[20px] border border-line bg-surface px-8 py-9"
                      }
                      style={
                        fullscreenOn
                          ? undefined
                          : {
                              boxShadow:
                                "0 1px 2px rgba(15,42,68,.04), 0 12px 32px -16px rgba(15,42,68,.12)",
                            }
                      }
                    >
                      <div
                        ref={reelWindowRef}
                        aria-hidden={reelMode === "spinning" ? true : undefined}
                        className="relative mx-auto w-full overflow-hidden"
                        style={{
                          maxWidth: reelMaxWidth,
                          height: `${Hpx * 3}px`,
                          perspective: "900px",
                        }}
                      >
                        {/* Frame fill — below the code rows so landed #F2F6FB never covers the winner. */}
                        <div
                          ref={highlightRef}
                          data-testid="giveaway-highlight"
                          data-layer="frame-bg"
                          className="pointer-events-none absolute z-0 rounded-[14px]"
                          style={{
                            top: "50%",
                            left: 24,
                            right: 24,
                            height: Hpx,
                            transform: "translateY(-50%)",
                            background: showWinnerCard ? "#F2F6FB" : "#FFFFFF",
                            transition: "background 250ms",
                          }}
                        />
                        <div
                          className="absolute inset-0 z-[1]"
                          data-layer="reel-rows"
                          style={{ transformStyle: "preserve-3d" }}
                        >
                          {[0, 1, 2, 3, 4].map((slot) => (
                            <div
                              key={slot}
                              ref={(el) => {
                                rowRefs.current[slot] = el;
                              }}
                              data-testid="giveaway-reel-row"
                              className="absolute inset-x-0 flex items-center justify-center font-semibold"
                              style={{
                                height: Hpx,
                                top: "50%",
                                marginTop: `-${Hpx / 2}px`,
                                fontSize: `${codeSizePx}px`,
                                fontFamily: "Lexend, sans-serif",
                                letterSpacing: "0.04em",
                                fontVariantNumeric: "tabular-nums",
                                whiteSpace: "nowrap",
                                color: "#0F2A44",
                                backfaceVisibility: "hidden",
                                willChange: "transform, opacity",
                              }}
                            />
                          ))}
                        </div>
                        {/* Frame border — above the rows; transparent fill, uniform 2px ink. */}
                        <div
                          data-testid="giveaway-highlight-border"
                          data-layer="frame-border"
                          className="pointer-events-none absolute z-[2] rounded-[14px] border-2 border-ink"
                          style={{
                            top: "50%",
                            left: 24,
                            right: 24,
                            height: Hpx,
                            transform: "translateY(-50%)",
                            background: "transparent",
                          }}
                        >
                          {showWinnerCard && latestWinner && (
                            <span
                              data-testid="giveaway-winner-label"
                              className="absolute left-1/2 -translate-x-1/2 px-2 text-[14px] font-bold uppercase tracking-[0.14em] text-brand-red"
                              style={{
                                position: "absolute",
                                top: "-0.65em",
                                fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif",
                                fontWeight: 700,
                                background: "#FFFFFF",
                              }}
                            >
                              Winner {latestWinner.round}
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className="mx-auto mt-6 flex w-full flex-col items-center gap-3"
                        style={{ maxWidth: controlsMaxWidth }}
                      >
                        {drawComplete ? (
                          <button type="button" disabled className={spinBtnClass}>
                            All winners drawn
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={spin}
                            disabled={busy || suspiciousBlocked || pool.length === 0}
                            className={spinBtnClass}
                          >
                            <Shuffle size={22} strokeWidth={1.75} aria-hidden="true" />
                            {busy ? "Spinning…" : `Spin for winner ${currentRound}`}
                          </button>
                        )}

                        {!fullscreenOn && (
                          <div className="flex flex-wrap justify-center gap-2">
                            <button
                              type="button"
                              disabled={busy || draws.length === 0}
                              onClick={() => downloadResultsCsv(draws)}
                              className={operatorBtnClass}
                            >
                              Download results (CSV)
                            </button>
                            <button
                              type="button"
                              disabled={busy || draws.length === 0}
                              onClick={resetDraw}
                              className={operatorBtnClass}
                            >
                              Reset draw
                            </button>
                          </div>
                        )}
                      </div>

                      {showWinnerCard && latestWinner && (
                        <div
                          className="giveaway-reveal-in mx-auto mt-6 w-full rounded-[16px] border border-line bg-white p-6 text-center"
                          style={{ maxWidth: controlsMaxWidth }}
                        >
                          <p
                            className="text-[14px] font-bold uppercase tracking-[0.14em] text-brand-red"
                            style={{
                              fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif",
                              fontWeight: 700,
                            }}
                          >
                            Winner {latestWinner.round} of 3
                          </p>
                          <p
                            className="mt-2 font-extrabold leading-none text-ink-deep"
                            style={{
                              fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif",
                              fontWeight: 800,
                              fontSize: "clamp(2rem, 4vw, 3.5rem)",
                            }}
                          >
                            {latestWinner.name}
                          </p>
                          <p
                            className="mt-2 text-base font-medium text-muted"
                            style={{
                              fontFamily: "Lexend, sans-serif",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {latestWinner.code}
                          </p>
                          <p className="mt-2 text-base font-semibold text-text">
                            Wins one year of AXIOM Express
                          </p>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={markAbsent}
                            className={`mt-4 ${operatorBtnClass}`}
                          >
                            Not here? Redraw
                          </button>
                        </div>
                      )}
                    </div>

                    {fullscreenOn && (
                      <div className="w-full max-w-[1100px] shrink-0 pb-8">
                        {winnerSlots("row")}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Winners panel — hidden in full screen (slots move under the reel). */}
          {!fullscreenOn && (
            <aside className="flex w-full flex-[1_1_340px] flex-col gap-6 lg:max-w-[440px]">
              <div className="rounded-[16px] border border-line bg-surface p-6">
                {/* Brief requires a plain <img>; next/image is intentionally not used here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/axiom-express.png"
                  alt="AXIOM Express"
                  height={52}
                  style={{ height: 52, width: "auto" }}
                />
                <div className="my-4 h-px bg-[#EEF0F3]" />
                <p
                  className="text-[13px] font-bold uppercase tracking-[0.12em] text-brand-red"
                  style={{
                    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif",
                    fontWeight: 700,
                  }}
                >
                  The prize
                </p>
                <p className="mt-1 text-[18px] font-semibold text-text">
                  One year of AXIOM Express for each winner
                </p>
              </div>

              <div className="flex items-baseline gap-3">
                <h2 className="text-[20px] font-bold text-text">Winners</h2>
                <span className="text-[15px] font-medium text-muted">
                  {winners.length} of 3
                </span>
              </div>

              {winnerSlots("stack")}

              {absents.length > 0 && (
                <div>
                  <p className="text-[0.8125rem] font-medium text-muted">Redrawn (not present)</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {absents.map((a) => (
                      <li
                        key={`${a.code}-${a.at}`}
                        className="text-[0.8125rem] font-medium text-muted"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {a.name}, {a.code}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {entries.length > 0 && (
                <p className="text-[0.8125rem] font-medium text-muted">
                  {pool.length} eligible entries left
                </p>
              )}
            </aside>
          )}
        </div>
      </main>

      {!fullscreenOn && (
        <footer className="mx-auto flex max-w-[1400px] justify-between border-t border-line px-10 pb-7 pt-5 text-[14px] text-muted">
          <p>TEXPO 2026 · Drawn live at the Holdco Corp stand</p>
          <p>Winners are picked at random from eligible entries</p>
        </footer>
      )}

      <span className="sr-only" aria-live="polite">
        {announce}
      </span>

      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  );
}
