export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { todayString } from "@/lib/timezone";
import { JobsView } from "@/components/jobs/JobsView";
import {
  daysBefore,
  FILTERED_STAGES,
  JOB_COLUMNS,
  parseFilters,
  STALE_DAYS,
  type JobRow,
} from "@/lib/jobs/jobs";

export const metadata: Metadata = {
  title: "Jobs",
  description: "Job Scout's daily report, the application tracker, and every role it filtered out.",
};

const FILTERED_LIMIT = 200;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilters(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? "";
  const today = todayString();
  const staleCutoff = daysBefore(today, STALE_DAYS);

  const [reportDates, tracker, scoutSummary] = await Promise.all([
    supabase
      .from("job_scout_reports")
      .select("date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(60),
    supabase
      .from("jobs")
      .select(JOB_COLUMNS)
      .eq("user_id", userId)
      .not("status", "is", null)
      .order("updated_at", { ascending: false })
      .range(0, 4999),
    // Small columns only, for the scout counts and the company filter.
    supabase
      .from("jobs")
      .select("stage, company, last_seen")
      .eq("user_id", userId)
      .not("stage", "is", null)
      .is("status", null)
      .range(0, 9999),
  ]);

  const dates = (reportDates.data ?? []).map((r) => r.date as string);
  const reportDate = f.report && dates.includes(f.report) ? f.report : (dates[0] ?? null);
  const report = reportDate
    ? (
        await supabase
          .from("job_scout_reports")
          .select("date, markdown")
          .eq("user_id", userId)
          .eq("date", reportDate)
          .maybeSingle()
      ).data
    : null;

  let q = supabase
    .from("jobs")
    .select(JOB_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .is("status", null)
    .in("stage", f.stage ? [f.stage] : FILTERED_STAGES);
  if (f.company) q = q.eq("company", f.company);
  if (f.q) q = q.ilike("title", `%${f.q.replace(/[%_]/g, "")}%`);
  if (!f.showStale) q = q.gte("last_seen", staleCutoff);
  if (f.feedbackOnly) q = q.not("feedback", "is", null);
  const { data: filtered, count } = await q
    .order("first_seen", { ascending: false })
    .order("company")
    .limit(FILTERED_LIMIT);

  const scoutRows = scoutSummary.data ?? [];
  const byStage = scoutRows.reduce<Record<string, number>>((m, r) => {
    if (r.stage) m[r.stage] = (m[r.stage] ?? 0) + 1;
    return m;
  }, {});

  return (
    <JobsView
      today={today}
      loadError={(tracker.error ?? scoutSummary.error ?? reportDates.error)?.message ?? null}
      tracker={(tracker.data ?? []) as JobRow[]}
      reportDates={dates}
      report={report ? { date: report.date as string, markdown: report.markdown as string } : null}
      filtered={(filtered ?? []) as JobRow[]}
      filteredCount={count ?? 0}
      filteredLimit={FILTERED_LIMIT}
      filters={f}
      byStage={byStage}
      companies={[...new Set(scoutRows.map((r) => r.company as string))].sort((a, b) =>
        a.localeCompare(b),
      )}
      lastCollect={scoutRows.reduce(
        (m, r) => (r.last_seen && r.last_seen > m ? (r.last_seen as string) : m),
        "",
      )}
    />
  );
}
