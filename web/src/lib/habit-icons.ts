import {
  Ban,
  BookOpen,
  Brain,
  Code2,
  Droplet,
  Dumbbell,
  Footprints,
  GraduationCap,
  HeartPulse,
  Moon,
  NotebookPen,
  Smile,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { HabitRegistry } from "@/lib/types";

export interface HabitIconOption {
  key: string;
  icon: LucideIcon;
  label: string;
}

export const HABIT_ICON_OPTIONS: readonly HabitIconOption[] = [
  { key: "target", icon: Target, label: "Target" },
  { key: "dumbbell", icon: Dumbbell, label: "Workout" },
  { key: "heart-pulse", icon: HeartPulse, label: "Health" },
  { key: "moon", icon: Moon, label: "Sleep" },
  { key: "droplet", icon: Droplet, label: "Water" },
  { key: "footprints", icon: Footprints, label: "Walk" },
  { key: "book-open", icon: BookOpen, label: "Reading" },
  { key: "code-2", icon: Code2, label: "Code" },
  { key: "graduation-cap", icon: GraduationCap, label: "Study" },
  { key: "brain", icon: Brain, label: "Mindset" },
  { key: "notebook-pen", icon: NotebookPen, label: "Journal" },
  { key: "sparkles", icon: Sparkles, label: "Hygiene" },
  { key: "smile", icon: Smile, label: "Smile" },
  { key: "ban", icon: Ban, label: "Avoid" },
] as const;

const ICON_BY_KEY: Record<string, LucideIcon> = Object.fromEntries(
  HABIT_ICON_OPTIONS.map((o) => [o.key, o.icon]),
);

export function isValidIconKey(key: string | null | undefined): boolean {
  return !!key && key in ICON_BY_KEY;
}

const CATEGORY_MAP: Record<string, LucideIcon> = {
  fitness: Dumbbell,
  health: HeartPulse,
  hygiene: Sparkles,
  learning: GraduationCap,
  recovery: Moon,
  mindset: Brain,
};

const NAME_KEYWORDS: Array<[RegExp, LucideIcon]> = [
  [/sleep/, Moon],
  [/water|hydrat/, Droplet],
  [/read|book/, BookOpen],
  [/code|coding|programming/, Code2],
  [/japanese|study|learn|language/, GraduationCap],
  [/step|walk/, Footprints],
  [/workout|gym|lift|exercise/, Dumbbell],
  [/floss|teeth/, Smile],
  [/journal|write/, NotebookPen],
  [/alcohol|^no /, Ban],
  [/meditat|mindful/, Brain],
  [/lotion|shower|hygien/, Sparkles],
];

export function getHabitIcon(
  habit: Pick<HabitRegistry, "name" | "category"> & { icon_key?: string | null },
): LucideIcon {
  if (habit.icon_key && ICON_BY_KEY[habit.icon_key]) {
    return ICON_BY_KEY[habit.icon_key];
  }

  const cat = habit.category?.trim().toLowerCase();
  if (cat && CATEGORY_MAP[cat]) return CATEGORY_MAP[cat];

  const name = habit.name.toLowerCase();
  for (const [pattern, icon] of NAME_KEYWORDS) {
    if (pattern.test(name)) return icon;
  }
  return Target;
}
