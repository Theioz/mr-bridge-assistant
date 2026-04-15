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
  [/alcohol|no /, Ban],
  [/meditat|mindful/, Brain],
  [/lotion|shower|hygien/, Sparkles],
];

export function getHabitIcon(
  habit: Pick<HabitRegistry, "name" | "category">
): LucideIcon {
  const cat = habit.category?.trim().toLowerCase();
  if (cat && CATEGORY_MAP[cat]) return CATEGORY_MAP[cat];

  const name = habit.name.toLowerCase();
  for (const [pattern, icon] of NAME_KEYWORDS) {
    if (pattern.test(name)) return icon;
  }
  return Target;
}
