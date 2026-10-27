"""Job Scout — pure logic (stdlib only, so tests/ runs it on a bare interpreter).

Job Scout is split by what each host is allowed to do (no LLM on the self-host, nothing on the
homelab reachable from the internet):

  homelab cron   scripts/job_scout.py collect  — fetch every public job board, record EVERY role
                 it saw in `jobs` with the reason it was or wasn't kept, and write an inbox
                 of the roles that are new today (plus Jason's feedback) for the ranking agent.
  cloud agent    reads the inbox from a git branch, judges fit, writes decisions back.
  homelab cron   scripts/job_scout.py ingest   — applies those decisions to `jobs` and stores the report.

This module holds the parts with no I/O to Supabase: the job-board fetchers (stdlib urllib, public
endpoints only), the keep/drop verdict, the automatic reason for a role the agent never looked at,
and the plans that collect/ingest turn into database writes. The fetchers were proven against all
66 configured companies before being moved here; keep their request shapes as they are.
"""
from __future__ import annotations

import concurrent.futures as cf
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130 Safari/537.36 job-scout/3.0"
DESC_LIMIT = 6000

# Stages a role can be in. `pending` = kept by the title/location rules, waiting for the agent.
STAGES = ("prefilter", "pending", "title_triage", "scored", "pay", "recommended")
DROP_STAGES = ("scored", "pay", "title_triage")
FEEDBACK = ("want", "not_for_me", "wrong_reason")

INFRA = re.compile(r"infra|compute|gpu|accelerat|data ?cent|capacity|cloud|platform|storage|network|fleet|reliab|"
                   r"hardware|silicon|supply|cost|finops|cluster|inference|power|energy|deploy|sre|systems", re.I)
DOMAINS = [("security / privacy / compliance", r"secur|privacy|compliance|grc|risk|trust|safety|audit|regulat"),
           ("consumer / product feature", r"consumer|app\b|growth|ads|commerce|shopping|youth|marketplace|creator|music|video|prime|alexa|grocery"),
           ("finance / business ops", r"financ|billing|payroll|account|procure|business|operations finance|monetiz"),
           ("research / ML science", r"research|science|model|rl\b|evals?\b"),
           ("customer / support / sales", r"customer|support|partner|sales|field|solutions"),
           ("hardware product / devices", r"device|antenna|satellite|payload|vehicle|robot|autopilot|actuator|perception"),
           ("manufacturing / logistics", r"manufactur|logistic|fulfil|delivery|last mile|warehouse")]


# ---------------------------------------------------------------- verdict + reasons

class Rules:
    """The title/location rules from config.json, compiled once."""

    def __init__(self, cfg: dict):
        self.role = re.compile(cfg["title_role_regex"], re.I)
        self.exclude = re.compile(cfg["title_exclude_regex"], re.I)
        self.loc = re.compile(cfg["location_regex"], re.I)
        self.allow_remote = cfg.get("allow_us_remote", True)

    def verdict(self, title: str, loc: str, remote_us: bool = False) -> str | None:
        """None = keep. Otherwise the reason it was dropped. 'not a PM/TPM title' is never logged."""
        if not self.role.search(title or ""):
            return "not a PM/TPM title"
        m = self.exclude.search(title)
        if m:
            return f"title excluded ('{m.group(0).strip()}')"
        if self.loc.search(loc or "") or (remote_us and self.allow_remote):
            return None
        return f"location not in target list ({(loc or 'unknown')[:80]})"

    def is_candidate_title(self, title: str) -> bool:
        return bool(self.role.search(title or "")) and not self.exclude.search(title or "")


def auto_reason(title: str) -> str:
    """Why a kept role was not shortlisted, when the agent gives no specific reason."""
    if INFRA.search(title or ""):
        return "not shortlisted - infra-adjacent title but ranked below the day's top ~35 (overrule if interested)"
    for name, rx in DOMAINS:
        if re.search(rx, title or "", re.I):
            return f"not shortlisted - {name} focus, not infrastructure"
    return "not shortlisted - title not infrastructure-focused"


def norm_url(u: str | None) -> str:
    return (u or "").strip().rstrip("/")


# ---------------------------------------------------------------- fetchers

def _get(url, body=None, raw=False, retries=3):
    data = json.dumps(body).encode() if body is not None else None
    hdr = {"User-Agent": UA, "Accept": "application/json, text/html"}
    if data:
        hdr["Content-Type"] = "application/json"
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=hdr), timeout=40) as r:
                b = r.read()
                return b.decode("utf8", "ignore") if raw else json.loads(b)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                time.sleep(20 * (attempt + 1))
                continue
            raise


def _text(h):
    h = re.sub(r"<(br|/p|/li|/h\d)[^>]*>", "\n", html.unescape(h or ""))
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"<[^>]+>", "", h)).strip()


class Sink:
    def __init__(self, company: str, rules: Rules):
        self.company, self.rules, self.kept, self.dropped = company, rules, [], []

    def offer(self, title, loc, url, remote_us=False, fetch=None):
        """fetch: zero-arg callable -> (description, pay, updated); called only for kept roles."""
        title = (title or "").strip()
        if not title:
            return  # a posting with no title (seen from Workday 2026-10-27) can't be judged
        why = self.rules.verdict(title, loc, remote_us)
        if why == "not a PM/TPM title":
            return
        if why:
            self.dropped.append(dict(company=self.company, title=title, location=loc or "", url=norm_url(url), reason=why))
            return
        desc, pay, updated = fetch() if fetch else ("", "", "")
        self.kept.append(dict(company=self.company, title=title, location=loc or "", url=norm_url(url),
                              pay=pay or "", updated=str(updated or ""), description=(desc or "")[:DESC_LIMIT]))


def _greenhouse(c, s, cfg):
    for j in _get(f"https://boards-api.greenhouse.io/v1/boards/{c['slug']}/jobs").get("jobs", []):
        loc = (j.get("location") or {}).get("name", "")

        def fetch(j=j):
            d = _get(f"https://boards-api.greenhouse.io/v1/boards/{c['slug']}/jobs/{j['id']}?pay_transparency=true")
            pay = "; ".join(f"{p.get('title','')}: {p.get('min_cents',0)//100:,}-{p.get('max_cents',0)//100:,} {p.get('currency_type','')}"
                            for p in d.get("pay_input_ranges") or [])
            return _text(d.get("content")), pay, j.get("updated_at")
        s.offer(j.get("title"), loc, j.get("absolute_url"),
                "remote" in loc.lower() and bool(re.search(r"US|United States|North America", loc)), fetch)


def _ashby(c, s, cfg):
    for j in _get(f"https://api.ashbyhq.com/posting-api/job-board/{c['slug']}?includeCompensation=true").get("jobs", []):
        loc = " | ".join(l for l in [j.get("location", "")] + [x.get("location", "") for x in j.get("secondaryLocations") or []] if l)
        s.offer(j.get("title"), loc, j.get("jobUrl"),
                bool(j.get("isRemote") and re.search(r"US|United States|North America|Remote", loc)),
                lambda j=j: (j.get("descriptionPlain") or _text(j.get("descriptionHtml")),
                             (j.get("compensation") or {}).get("compensationTierSummary"), j.get("publishedAt")))


def _lever(c, s, cfg):
    for j in _get(f"https://api.lever.co/v0/postings/{c['slug']}?mode=json"):
        cats = j.get("categories") or {}
        loc = " | ".join(cats.get("allLocations") or [cats.get("location", "")])

        def fetch(j=j):
            sr = j.get("salaryRange") or {}
            pay = f"{sr.get('min',''):,}-{sr.get('max',''):,} {sr.get('currency','')}" if sr else ""
            lists = "\n".join(f"{l.get('text','')}\n{_text(l.get('content'))}" for l in j.get("lists") or [])
            return (j.get("descriptionPlain") or "") + "\n" + lists, pay, j.get("createdAt")
        s.offer(j.get("text"), loc, j.get("hostedUrl"), j.get("workplaceType") == "remote", fetch)


def _smartrecruiters(c, s, cfg):
    off = 0
    while True:
        page = _get(f"https://api.smartrecruiters.com/v1/companies/{c['slug']}/postings?limit=100&offset={off}")
        for j in page.get("content", []):
            l = j.get("location") or {}
            loc = ", ".join(x for x in [l.get("city"), l.get("region"), l.get("country")] if x)

            def fetch(j=j):
                d = _get(f"https://api.smartrecruiters.com/v1/companies/{c['slug']}/postings/{j['id']}")
                sec = (d.get("jobAd") or {}).get("sections") or {}
                return "\n\n".join(_text((sec.get(k) or {}).get("text")) for k in ("jobDescription", "qualifications")), "", j.get("releasedDate")
            s.offer(j.get("name"), loc, f"https://jobs.smartrecruiters.com/{c['slug']}/{j['id']}",
                    bool(l.get("remote") and l.get("country") == "us"), fetch)
        off += 100
        if off >= page.get("totalFound", 0):
            break


def _amazon(c, s, cfg):
    seen = set()
    for q in cfg.get("big_company_searches", []):
        for country in ("USA", "AUS"):
            for off in (0, 100):
                d = _get("https://www.amazon.jobs/en/search.json?" + urllib.parse.urlencode(
                    {"base_query": q, "result_limit": 100, "offset": off, "sort": "recent", "normalized_country_code[]": country}))
                for j in d.get("jobs", []):
                    if j["id"] in seen:
                        continue
                    seen.add(j["id"])
                    s.offer(j.get("title"), j.get("normalized_location", ""), "https://www.amazon.jobs" + j.get("job_path", ""),
                            fetch=lambda j=j: ("\n\n".join(_text(j.get(k)) for k in ("description", "basic_qualifications", "preferred_qualifications")),
                                               "", j.get("posted_date")))
                if len(d.get("jobs", [])) < 100:
                    break


def _workday(c, s, cfg):
    base = f"https://{c['host']}/wday/cxs/{c['tenant']}/{c['site']}"
    seen = set()
    for q in cfg.get("big_company_searches", []):
        for off in range(0, 200, 20):
            d = _get(base + "/jobs", {"appliedFacets": {}, "limit": 20, "offset": off, "searchText": q})
            posts = d.get("jobPostings", [])
            for j in posts:
                path = j.get("externalPath")
                title = j.get("title") or ""
                if path in seen:
                    continue
                seen.add(path)

                def detail(path=path):
                    return _get(base + path).get("jobPostingInfo", {})
                info = None
                loc = j.get("locationsText", "")
                if re.match(r"\d+ Locations", loc) and s.rules.is_candidate_title(title):
                    info = detail()
                    loc = " | ".join([info.get("location", "")] + (info.get("additionalLocations") or []))
                s.offer(title, loc, f"https://{c['host']}/{c['site']}{path}",
                        fetch=lambda info=info, detail=detail: (lambda i: (_text(i.get("jobDescription")), "", i.get("startDate")))(info or detail()))
            if len(posts) < 20:
                break


def _google(c, s, cfg):
    seen = set()
    for q in cfg.get("big_company_searches", []):
        for where in ("United States", "Sydney NSW, Australia"):
            for page in (1, 2, 3):
                t = _get("https://www.google.com/about/careers/applications/jobs/results?" + urllib.parse.urlencode(
                    {"q": f'"{q}"', "location": where, "page": page}), raw=True)
                m = re.search(r"AF_initDataCallback\(\{key: 'ds:1'.*?data:(.*?), sideChannel: \{\}\}\);", t, re.S)
                jobs = (json.loads(m.group(1))[0] or []) if m else []
                for j in jobs:
                    gtitle = (j[1] if len(j) > 1 else None) or ""
                    if j[0] in seen:
                        continue
                    seen.add(j[0])
                    loc = " | ".join(x[0] for x in ((j[9] if len(j) > 9 else None) or []))
                    slug = re.sub(r"[^a-z0-9]+", "-", gtitle.lower()).strip("-")
                    s.offer(gtitle, loc, f"https://www.google.com/about/careers/applications/jobs/results/{j[0]}-{slug}",
                            fetch=lambda j=j: (_text((j[3] or [None, ""])[1]) + "\n\n" + _text((j[4] or [None, ""])[1]), "", ""))
                if len(jobs) < 20:
                    break


def _microsoft(c, s, cfg):
    """Best effort: Microsoft rate-limits hard, so one slow pass and descriptions only when allowed."""
    seen = set()
    for q in cfg.get("big_company_searches", [])[:2]:
        d = _get("https://apply.careers.microsoft.com/api/pcsx/search?" + urllib.parse.urlencode(
            {"domain": "microsoft.com", "query": q, "location": "United States", "start": 0}))
        for j in (d.get("data") or {}).get("positions", []):
            if j["id"] in seen:
                continue
            seen.add(j["id"])
            loc = " | ".join(j.get("locations") or [])

            def fetch(j=j):
                time.sleep(3)
                try:
                    dd = _get("https://apply.careers.microsoft.com/api/pcsx/position_details?" + urllib.parse.urlencode(
                        {"position_id": j["id"], "domain": "microsoft.com", "hl": "en"}), retries=2).get("data") or {}
                    return _text(dd.get("jobDescription") or dd.get("description") or ""), "", str(j.get("postedTs", ""))
                except Exception:
                    return "(description unavailable - Microsoft rate limit; judge from title)", "", str(j.get("postedTs", ""))
            s.offer(j.get("name"), loc, f"https://apply.careers.microsoft.com/careers/job/{j['id']}",
                    "Multiple Locations" in loc and "United States" in loc, fetch)
        time.sleep(5)


def _atlassian(c, s, cfg):
    for j in _get("https://www.atlassian.com/endpoint/careers/listings"):
        loc = " | ".join(j.get("locations") or [])
        s.offer(j.get("title", ""), loc, (j.get("portalJobPost") or {}).get("portalUrl") or j.get("applyUrl"),
                bool(re.search(r"Remote.{0,6}(United States|USA|US\b)", loc)),
                lambda j=j: ("\n\n".join(_text(j.get(k)) for k in ("overview", "responsibilities", "qualifications")), "", ""))


FETCHERS = dict(greenhouse=_greenhouse, ashby=_ashby, lever=_lever, smartrecruiters=_smartrecruiters,
                amazon=_amazon, workday=_workday, google=_google, microsoft=_microsoft, atlassian=_atlassian)


def fetch_all(cfg: dict, workers: int = 10) -> dict:
    """Fetch every configured company. Returns {kept, prefiltered, errors}. One company failing
    never stops the rest: its error is recorded and the run continues."""
    rules = Rules(cfg)
    kept, dropped, errors = [], [], []

    def run(c):
        s = Sink(c["name"], rules)
        try:
            FETCHERS[c["ats"]](c, s, cfg)
        except Exception as e:  # noqa: BLE001 - every failure is reported, none is fatal
            errors.append(f"{c['name']} ({c['ats']}): {type(e).__name__}: {e}"[:300])
        return s

    with cf.ThreadPoolExecutor(workers) as ex:
        for s in ex.map(run, cfg["companies"]):
            kept += s.kept
            dropped += s.dropped
    return {"kept": dedupe(kept), "prefiltered": dedupe(dropped), "errors": errors}


def dedupe(rows: list[dict]) -> list[dict]:
    """One row per url (a board can list the same posting twice). First wins."""
    out, seen = [], set()
    for r in rows:
        u = norm_url(r.get("url"))
        if not u or u in seen:
            continue
        seen.add(u)
        out.append({**r, "url": u})
    return out


# ---------------------------------------------------------------- collect / ingest plans

def plan_collect(kept: list[dict], prefiltered: list[dict], existing_urls: set[str], day: str) -> dict:
    """Split a fetch into what is new (to insert) and what is already known (to bump last_seen).

    A url already in the table is NEVER re-inserted or re-staged: the agent's decision and Jason's
    feedback on it are kept. Only last_seen moves, which is how the page hides closed postings.
    """
    existing = {norm_url(u) for u in existing_urls}
    inserts, seen_again, new_roles = [], [], []
    for r in prefiltered:
        if r["url"] in existing:
            seen_again.append(r["url"])
            continue
        inserts.append({"url": r["url"], "company": r["company"], "title": r["title"], "location": r.get("location") or "",
                        "pay": r.get("pay") or "", "source": "job_scout", "stage": "prefilter", "reason": r["reason"],
                        "first_seen": day, "last_seen": day})
    for r in kept:
        if r["url"] in existing:
            seen_again.append(r["url"])
            continue
        reason = auto_reason(r["title"])
        inserts.append({"url": r["url"], "company": r["company"], "title": r["title"], "location": r.get("location") or "",
                        "pay": r.get("pay") or "", "source": "job_scout", "stage": "pending", "reason": reason,
                        "first_seen": day, "last_seen": day})
        new_roles.append({"url": r["url"], "company": r["company"], "title": r["title"], "location": r.get("location") or "",
                          "pay": r.get("pay") or "", "auto_reason": reason,
                          "description": (r.get("description") or "")[:DESC_LIMIT]})
    return {"inserts": inserts, "seen_again": seen_again, "new_roles": new_roles}


def build_inbox(day: str, generated_at: str, fetched: dict, plan: dict, feedback: list[dict],
                preferences: list[dict], companies_checked: int, tracker: list[dict] | None = None) -> dict:
    new_pref = sum(1 for i in plan["inserts"] if i["stage"] == "prefilter")
    return {
        "date": day,
        "generated_at": generated_at,
        "stats": {"companies_checked": companies_checked, "errors": fetched["errors"],
                  "kept_total": len(fetched["kept"]), "prefiltered_total": len(fetched["prefiltered"]),
                  "new_kept": len(plan["new_roles"]), "new_prefiltered": new_pref},
        "new_roles": plan["new_roles"],
        "feedback": feedback,
        "preferences": preferences,
        # Every role in the tracker (status not null): the agent dedupes against this, not Notion.
        "tracker": tracker or [],
    }


class DecisionsError(ValueError):
    pass


def plan_ingest(decisions: dict, now_iso: str) -> dict:
    """Turn a decisions file into database writes. Raises DecisionsError on malformed input, before
    anything is written, so a bad file can never half-apply.

    Returns {"updates": [(url, patch, promote)], "report": {date, markdown, stats} | None}.
    promote=True means: also set status 'to_apply', but ONLY where status is still null, so a role
    Jason has already applied to (or rejected) is never moved back.
    """
    if not isinstance(decisions, dict):
        raise DecisionsError("decisions must be a JSON object")
    for key in ("date", "recommended", "dropped"):
        if key not in decisions:
            raise DecisionsError(f"missing '{key}'")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(decisions["date"])):
        raise DecisionsError("date must be YYYY-MM-DD")
    updates: list[tuple[str, dict, bool]] = []

    def score_of(r, where):
        score = r.get("score")
        if score is not None and (not isinstance(score, int) or isinstance(score, bool) or not 0 <= score <= 10):
            raise DecisionsError(f"{where}.score must be an integer 0-10")
        return score

    for i, r in enumerate(decisions["recommended"]):
        if not isinstance(r, dict) or not r.get("url"):
            raise DecisionsError(f"recommended[{i}] has no url")
        updates.append((norm_url(r["url"]), {"stage": "recommended", "score": score_of(r, f"recommended[{i}]"),
                                             "reason": r.get("why") or None, "decided_at": now_iso}, True))

    for i, r in enumerate(decisions["dropped"]):
        if not isinstance(r, dict) or not r.get("url"):
            raise DecisionsError(f"dropped[{i}] has no url")
        if r.get("stage") not in DROP_STAGES:
            raise DecisionsError(f"dropped[{i}].stage must be one of {DROP_STAGES}, got {r.get('stage')!r}")
        updates.append((norm_url(r["url"]), {"stage": r["stage"], "reason": r.get("reason") or None,
                                             "score": score_of(r, f"dropped[{i}]"), "decided_at": now_iso}, False))

    for i, r in enumerate(decisions.get("feedback_processed") or []):
        if not isinstance(r, dict) or not r.get("url"):
            raise DecisionsError(f"feedback_processed[{i}] has no url")
        action = r.get("action")
        if action not in ("added_to_tracker", "noted"):
            raise DecisionsError(f"feedback_processed[{i}].action must be added_to_tracker or noted")
        updates.append((norm_url(r["url"]), {"processed_at": now_iso}, action == "added_to_tracker"))

    report = None
    md = decisions.get("report_markdown")
    if md is not None:
        if not isinstance(md, str) or not md.strip():
            raise DecisionsError("report_markdown must be non-empty text")
        stats = decisions.get("stats") or {}
        if not isinstance(stats, dict):
            raise DecisionsError("stats must be an object")
        report = {"date": decisions["date"], "markdown": md, "stats": stats}
    return {"updates": updates, "report": report}
