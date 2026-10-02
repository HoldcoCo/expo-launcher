import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Receipt,
  Calculator,
  Building2,
  HardHat,
  Wrench,
  DoorOpen,
  Store,
  ShoppingBag,
  Users,
  Globe,
  Bot,
  Boxes,
  Package,
  Truck,
  Warehouse,
  ClipboardCheck,
  FileText,
  Briefcase,
  Landmark,
  ShieldCheck,
  MessagesSquare,
  Smartphone,
  ChartLine,
} from "lucide-react";

/** Kebab-case keys accepted on the app `icon` field. */
export const ICON_KEYS = [
  "layout-dashboard",
  "receipt",
  "calculator",
  "building-2",
  "hard-hat",
  "wrench",
  "door-open",
  "store",
  "shopping-bag",
  "users",
  "globe",
  "bot",
  "boxes",
  "package",
  "truck",
  "warehouse",
  "clipboard-check",
  "file-text",
  "briefcase",
  "landmark",
  "shield-check",
  "messages-square",
  "smartphone",
  "chart-line",
] as const;

export type IconKey = (typeof ICON_KEYS)[number];

export const ICON_REGISTRY: Record<IconKey, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  receipt: Receipt,
  calculator: Calculator,
  "building-2": Building2,
  "hard-hat": HardHat,
  wrench: Wrench,
  "door-open": DoorOpen,
  store: Store,
  "shopping-bag": ShoppingBag,
  users: Users,
  globe: Globe,
  bot: Bot,
  boxes: Boxes,
  package: Package,
  truck: Truck,
  warehouse: Warehouse,
  "clipboard-check": ClipboardCheck,
  "file-text": FileText,
  briefcase: Briefcase,
  landmark: Landmark,
  "shield-check": ShieldCheck,
  "messages-square": MessagesSquare,
  smartphone: Smartphone,
  "chart-line": ChartLine,
};

/** Human-readable name for aria-labels (e.g. "layout-dashboard" → "layout dashboard"). */
export function iconLabel(key: IconKey): string {
  return key.replace(/-/g, " ");
}

export function isIconKey(value: string): value is IconKey {
  return (ICON_KEYS as readonly string[]).includes(value);
}

/**
 * Automatic icon when `icon` is null: first case-insensitive name match wins.
 */
export function automaticIconKey(name: string): IconKey | null {
  const n = name.toLowerCase();
  if (n.includes("client portal") || n.includes("portal")) return "door-open";
  if (n.includes("team app")) return "hard-hat";
  if (n.includes("fm")) return "building-2";
  if (n.includes("pos")) return "store";
  if (n.includes("commerce")) return "shopping-bag";
  if (n.includes("community")) return "users";
  if (n.includes("express")) return "receipt";
  if (n.includes("erp")) return "layout-dashboard";
  return null;
}

/** Initials for the monogram chip: one letter, or first two word initials. */
export function monogramLetters(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const letter = words[0].charAt(0);
    return letter ? letter.toUpperCase() : "?";
  }
  const a = words[0].charAt(0);
  const b = words[1].charAt(0);
  return `${a}${b}`.toUpperCase();
}

export type ResolvedIcon =
  | { kind: "icon"; key: IconKey; Icon: LucideIcon }
  | { kind: "monogram"; letters: string };

/** Resolve stored icon key (or null/automatic) to a renderable icon or monogram. */
export function resolveAppIcon(name: string, icon: string | null | undefined): ResolvedIcon {
  if (icon && isIconKey(icon)) {
    return { kind: "icon", key: icon, Icon: ICON_REGISTRY[icon] };
  }
  const auto = automaticIconKey(name);
  if (auto) return { kind: "icon", key: auto, Icon: ICON_REGISTRY[auto] };
  return { kind: "monogram", letters: monogramLetters(name) };
}
