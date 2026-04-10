import type { HabitRegistry, HabitLog } from "@/lib/types";

interface Props {
  habits: HabitRegistry[];
  logs: HabitLog[];
  dates: string[]; // last 7 days, ascending
}

export default function HabitHistory({ habits, logs, dates }: Props) {
  const logMap = new Map(logs.map((l) => [`${l.habit_id}:${l.date}`, l.completed]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left text-neutral-500 font-normal pb-2 pr-4 w-32">Habit</th>
            {dates.map((d) => (
              <th key={d} className="text-neutral-500 font-normal pb-2 px-1 text-center">
                {new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => (
            <tr key={h.id}>
              <td className="text-neutral-400 py-1.5 pr-4 truncate max-w-[8rem]">
                {h.emoji} {h.name}
              </td>
              {dates.map((d) => {
                const done = logMap.get(`${h.id}:${d}`);
                return (
                  <td key={d} className="py-1.5 px-1 text-center">
                    <span
                      className={`inline-block w-4 h-4 rounded-full ${
                        done === true
                          ? "bg-neutral-100"
                          : done === false
                          ? "bg-neutral-800 border border-neutral-700"
                          : "bg-neutral-850 border border-neutral-800 opacity-40"
                      }`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
