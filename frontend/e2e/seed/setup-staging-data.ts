/**
 * Idempotent staging data seed script for E2E tests.
 *
 * Creates a "Test Conference Staging 2026" with all data E2E tests need:
 * program days, slots, tracks, sessions, CFP, topics, sponsors, news.
 *
 * Usage:
 *   E2E_API_URL=https://api.staging.sonrisa.ventures \
 *   E2E_ADMIN_EMAIL=jose.diaz@trendig.com \
 *   E2E_ADMIN_PASSWORD=Test1234 \
 *   npx tsx e2e/seed/setup-staging-data.ts
 */

const API = process.env.E2E_API_URL ?? "https://api.staging.sonrisa.ventures";
const BASE = `${API}/api/v1`;
const EMAIL = process.env.E2E_ADMIN_EMAIL!;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD!;

const CONFERENCE_ABBREV = "TestE2E2026";
const CONFERENCE_NAME = "Test Conference Staging 2026";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let token = "";

async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const url = `${BASE}${path}`;
  let res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  // Follow redirects manually to preserve auth header (FastAPI redirect_slashes)
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (location) {
      const redirectUrl = new URL(location, url).toString();
      res = await fetch(redirectUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function apiSafe<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T | null> {
  try {
    return await api<T>(method, path, body);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("409") || msg.includes("already exists") || msg.includes("duplicate")) {
      return null; // idempotent — already exists
    }
    throw e;
  }
}

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required");
  }

  // 1. Login
  log("Logging in...");
  const auth = await api<{ access_token: string }>("POST", "/auth/login", {
    email: EMAIL,
    password: PASSWORD,
  });
  token = auth.access_token;
  log("Authenticated.");

  // 2. Check if conference already exists
  log(`Looking for conference "${CONFERENCE_ABBREV}"...`);
  const conferences = await api<{ items: Array<{ id: string; abbreviation: string }> }>(
    "GET",
    `/conferences?search=${CONFERENCE_ABBREV}`,
  );
  const conf = conferences.items.find((c) => c.abbreviation === CONFERENCE_ABBREV);
  let conferenceId: string;

  if (conf) {
    conferenceId = conf.id;
    log(`Conference exists: ${conferenceId}`);
  } else {
    // 3. Create conference
    log("Creating conference...");
    const created = await api<{ id: string }>("POST", "/conferences", {
      name: CONFERENCE_NAME,
      abbreviation: CONFERENCE_ABBREV,
      description: "Automated test conference for E2E tests. Do not delete.",
      start_date: "2026-06-01",
      end_date: "2026-06-03",
      city: "Berlin",
      country: "Germany",
      timezone: "Europe/Berlin",
      venue_name: "Test Venue",
      venue_type: "onsite",
      locale: "en",
      team_members: [
        {
          first_name: "E2E",
          last_name: "Test Admin",
          email: EMAIL,
          role: "Conference Chair",
          is_manager: true,
        },
      ],
    });
    conferenceId = created.id;
    log(`Created conference: ${conferenceId}`);
  }

  // 4. Ensure program days exist (3 days: Jun 1, 2, 3)
  log("Checking program days...");
  const daysResp = await api<{ items: Array<{ id: string; date: string }>; total: number }>(
    "GET",
    `/conferences/${conferenceId}/program/days`,
  );
  let days = daysResp.items;

  const targetDates = ["2026-06-01", "2026-06-02", "2026-06-03"];
  for (const date of targetDates) {
    if (!days.find((d) => d.date === date)) {
      log(`Creating program day ${date}...`);
      const day = await api<{ id: string }>(
        "POST",
        `/conferences/${conferenceId}/program/days`,
        { date, name: `Day ${targetDates.indexOf(date) + 1}`, sort_order: targetDates.indexOf(date) },
      );
      days.push({ id: day.id, date });
    }
  }
  // Re-fetch to get accurate IDs
  const freshDays = await api<{ items: Array<{ id: string; date: string }> }>(
    "GET",
    `/conferences/${conferenceId}/program/days`,
  );
  days = freshDays.items.sort((a, b) => a.date.localeCompare(b.date));
  log(`Program days: ${days.length} (${days.map((d) => d.date).join(", ")})`);

  // 5. Create time slots for each day (batch: 09:00-17:00, 60min intervals)
  for (const day of days) {
    log(`Creating slots for ${day.date}...`);
    const slotsResp = await api<{ items: Array<{ id: string }>; total: number }>(
      "GET",
      `/conferences/${conferenceId}/program/days/${day.id}/slots`,
    );
    if (slotsResp.total > 0) {
      log(`  Slots already exist (${slotsResp.total}), skipping.`);
      continue;
    }
    await api("POST", `/conferences/${conferenceId}/program/days/${day.id}/slots/batch`, {
      start_time: "09:00",
      end_time: "17:00",
      interval_minutes: 60,
    });
    log(`  Created 8 hourly slots.`);
  }

  // 6. Create tracks for first day (reused in sessions)
  log("Checking tracks...");
  const tracksResp = await api<{ items: Array<{ id: string; name: string }>; total: number }>(
    "GET",
    `/conferences/${conferenceId}/program/tracks`,
  );
  let tracks = tracksResp.items;

  const trackNames = ["Main Stage", "Workshop Room"];
  if (tracks.length === 0) {
    for (const name of trackNames) {
      log(`Creating track "${name}" for day ${days[0].date}...`);
      const track = await apiSafe<{ id: string }>(
        "POST",
        `/conferences/${conferenceId}/program/tracks`,
        { program_day_id: days[0].id, name, sort_order: trackNames.indexOf(name) },
      );
      if (track) tracks.push({ id: track.id, name });
    }
    // Re-fetch
    const fresh = await api<{ items: Array<{ id: string; name: string }> }>(
      "GET",
      `/conferences/${conferenceId}/program/tracks`,
    );
    tracks = fresh.items;
  }
  log(`Tracks: ${tracks.length} (${tracks.map((t) => t.name).join(", ")})`);

  // 7. Create session types
  log("Checking session types...");
  const typesResp = await api<{ items: Array<{ id: string; slug: string }>; total: number }>(
    "GET",
    `/conferences/${conferenceId}/settings/session-types`,
  );
  let sessionTypes = typesResp.items;

  const typesDef = [
    { name: "Talk", slug: "talk", duration_minutes: 30 },
    { name: "Workshop", slug: "workshop", duration_minutes: 90 },
  ];
  for (const typeDef of typesDef) {
    if (!sessionTypes.find((t) => t.slug === typeDef.slug)) {
      log(`Creating session type "${typeDef.name}"...`);
      const st = await apiSafe<{ id: string; slug: string }>(
        "POST",
        `/conferences/${conferenceId}/settings/session-types`,
        typeDef,
      );
      if (st) sessionTypes.push(st);
    }
  }
  // Re-fetch
  const freshTypes = await api<{ items: Array<{ id: string; slug: string }> }>(
    "GET",
    `/conferences/${conferenceId}/settings/session-types`,
  );
  sessionTypes = freshTypes.items;
  log(`Session types: ${sessionTypes.map((t) => t.slug).join(", ")}`);

  // 8. Create sessions (4 sessions across days)
  log("Checking sessions...");
  const sessionsResp = await api<{ items: Array<{ id: string }>; total: number }>(
    "GET",
    `/conferences/${conferenceId}/program/sessions`,
  );
  if (sessionsResp.total === 0) {
    // Get slots for first day to assign sessions
    const day1Slots = await api<{ items: Array<{ id: string; start_time: string }> }>(
      "GET",
      `/conferences/${conferenceId}/program/days/${days[0].id}/slots`,
    );
    const slots = day1Slots.items.sort((a, b) => a.start_time.localeCompare(b.start_time));

    const talkType = sessionTypes.find((t) => t.slug === "talk");
    const workshopType = sessionTypes.find((t) => t.slug === "workshop");
    const mainTrack = tracks.find((t) => t.name === "Main Stage");
    const workshopTrack = tracks.find((t) => t.name === "Workshop Room");

    const sessionsDef = [
      {
        title: "Opening Keynote: The Future of SaaS",
        start_slot_id: slots[0]?.id,
        start_track_id: mainTrack?.id,
        session_type_id: talkType?.id,
        slot_span: 1,
        track_span: 0, // spans all tracks (general event)
        is_general_event: true,
      },
      {
        title: "Building Scalable APIs",
        start_slot_id: slots[1]?.id,
        start_track_id: mainTrack?.id,
        session_type_id: talkType?.id,
        slot_span: 1,
      },
      {
        title: "Hands-on Testing Workshop",
        start_slot_id: slots[2]?.id,
        start_track_id: workshopTrack?.id,
        session_type_id: workshopType?.id,
        slot_span: 2,
      },
      {
        title: "Cloud Native Architecture",
        start_slot_id: slots[1]?.id,
        start_track_id: workshopTrack?.id,
        session_type_id: talkType?.id,
        slot_span: 1,
      },
    ];

    for (const sess of sessionsDef) {
      if (!sess.start_slot_id) {
        log(`  Skipping "${sess.title}" — no slot available.`);
        continue;
      }
      log(`Creating session "${sess.title}"...`);
      await apiSafe("POST", `/conferences/${conferenceId}/program/sessions`, sess);
    }
    log("Sessions created.");
  } else {
    log(`Sessions already exist (${sessionsResp.total}), skipping.`);
  }

  // 9. Create booking option "Full Conference"
  log("Checking booking options...");
  const optionsResp = await api<{ items: Array<{ id: string; name: string }>; total: number }>(
    "GET",
    `/conferences/${conferenceId}/settings/booking-options`,
  );
  if (!optionsResp.items.find((o) => o.name === "Full Conference")) {
    log('Creating "Full Conference" booking option...');
    await apiSafe("POST", `/conferences/${conferenceId}/settings/booking-options`, {
      name: "Full Conference",
      description: "Access to all 3 conference days",
      sort_order: 99,
    });
  } else {
    log("Full Conference booking option exists.");
  }

  // 10. Create CFP
  log("Checking CFP...");
  const cfpResp = await api<{ items: Array<{ id: string }>; total: number }>(
    "GET",
    `/cfp/?conference_id=${conferenceId}`,
  );
  if (cfpResp.total === 0) {
    log("Creating CFP...");
    await api("POST", "/cfp/", {
      conference_id: conferenceId,
      title: "Call for Papers — Test Conference 2026",
      description: "Submit your talk or workshop proposal for Test Conference Staging 2026.",
      guidelines_for_submissions: "<p>Please submit an abstract of 200-500 words.</p>",
      code_of_conduct: "<p>Be respectful and inclusive.</p>",
    });
    log("CFP created.");
  } else {
    log("CFP already exists.");
  }

  // 11. Create topics (tenant-scoped)
  log("Checking topics...");
  const topicsResp = await api<{ items: Array<{ id: string; name: string }>; total: number }>(
    "GET",
    "/cfp/topics",
  );
  const topicNames = ["AI & Machine Learning", "Cloud Native"];
  for (const name of topicNames) {
    if (!topicsResp.items.find((t) => t.name === name)) {
      log(`Creating topic "${name}"...`);
      await apiSafe("POST", "/cfp/topics", { name });
    }
  }
  log("Topics ready.");

  // 12. Create sponsor
  log("Checking sponsors...");
  const sponsorsResp = await api<{ items: Array<{ id: string; company_name: string }>; total: number }>(
    "GET",
    `/conferences/${conferenceId}/sponsors`,
  );
  if (sponsorsResp.total === 0) {
    log("Creating sponsor...");
    await api("POST", `/conferences/${conferenceId}/sponsors`, {
      company_name: "Test Sponsor GmbH",
      website: "https://example.com",
      city: "Berlin",
      country: "Germany",
      is_active: true,
    });
    log("Sponsor created.");
  } else {
    log(`Sponsors already exist (${sponsorsResp.total}).`);
  }

  // 13. Create news article
  log("Checking news...");
  const newsResp = await api<{ items: Array<{ id: string }>; total: number }>(
    "GET",
    `/conferences/${conferenceId}/news`,
  );
  if (newsResp.total === 0) {
    log("Creating news article...");
    await api("POST", `/conferences/${conferenceId}/news`, {
      title: "Welcome to Test Conference Staging 2026",
      body_html:
        "<p>We are excited to announce the Test Conference Staging 2026! " +
        "Join us in Berlin for 3 days of talks, workshops, and networking.</p>",
    });
    log("News article created.");
  } else {
    log(`News articles already exist (${newsResp.total}).`);
  }

  // 14. Create booking periods (Early Bird + Regular)
  log("Checking booking periods...");
  const periodsResp = await api<{ items: Array<{ id: string; name: string }>; total: number }>(
    "GET",
    `/conferences/${conferenceId}/settings/booking-periods`,
  );
  if (periodsResp.total === 0) {
    const periodsDef = [
      { name: "Early Bird", start_date: "2026-01-01", end_date: "2026-03-31", sort_order: 0, is_active: true },
      { name: "Regular", start_date: "2026-04-01", end_date: "2026-05-31", sort_order: 1, is_active: true },
    ];
    for (const p of periodsDef) {
      log(`Creating booking period "${p.name}"...`);
      await apiSafe("POST", `/conferences/${conferenceId}/settings/booking-periods`, p);
    }
    log("Booking periods created.");
  } else {
    log(`Booking periods already exist (${periodsResp.total}).`);
  }

  // 15. Create volunteers (applicants with Volunteer role)
  log("Checking volunteers...");
  const volunteersResp = await api<{ items: Array<{ id: string }>; total: number }>(
    "GET",
    `/conferences/${conferenceId}/volunteer-profiles`,
  );
  if (volunteersResp.total === 0) {
    // Get the Volunteer role ID (system roles are auto-created on first access)
    const rolesResp = await api<{ items: Array<{ id: string; name: string }> }>(
      "GET",
      `/conferences/${conferenceId}/settings/user-roles`,
    );
    const volunteerRole = rolesResp.items.find((r) => r.name === "Volunteer");
    if (!volunteerRole) {
      log("WARNING: Volunteer role not found, skipping volunteer creation.");
    } else {
      const volunteersDef = [
        { email: "volunteer1@test-e2e.example.com", first_name: "Alice", last_name: "Volunteer", password: "Test1234" },
        { email: "volunteer2@test-e2e.example.com", first_name: "Bob", last_name: "Helper", password: "Test1234" },
      ];
      for (const v of volunteersDef) {
        log(`Creating volunteer "${v.first_name} ${v.last_name}"...`);
        const applicant = await apiSafe<{ id: string }>(
          "POST",
          "/cfp/applicants",
          { ...v, role_ids: [volunteerRole.id] },
        );
        if (applicant) {
          log(`  Assigned Volunteer role to ${v.email}`);
        }
      }
      log("Volunteers created.");
    }
  } else {
    log(`Volunteers already exist (${volunteersResp.total}).`);
  }

  // 16. Create CFP applicants and papers
  log("Checking CFP papers...");
  const cfpListResp = await api<{ items: Array<{ id: string }>; total: number }>(
    "GET",
    `/cfp/?conference_id=${conferenceId}`,
  );
  const cfpId = cfpListResp.items[0]?.id;

  if (cfpId) {
    const papersResp = await api<{ items: Array<{ id: string }>; total: number }>(
      "GET",
      `/cfp/papers?cfp_id=${cfpId}`,
    );
    if (papersResp.total === 0) {
      // Create applicants (speakers)
      const applicantsDef = [
        { first_name: "Jane", last_name: "Speaker", email: "jane.speaker@test-e2e.example.com", password: "Test1234", title: "Senior Engineer", company: "TechCorp" },
        { first_name: "John", last_name: "Presenter", email: "john.presenter@test-e2e.example.com", password: "Test1234", title: "CTO", company: "StartupXYZ" },
        { first_name: "Maria", last_name: "Workshop", email: "maria.workshop@test-e2e.example.com", password: "Test1234", title: "Developer Advocate", company: "CloudCo" },
      ];

      const applicantIds: string[] = [];
      for (const a of applicantsDef) {
        log(`Creating applicant "${a.first_name} ${a.last_name}"...`);
        const created = await apiSafe<{ id: string }>("POST", "/cfp/applicants", a);
        if (created) {
          applicantIds.push(created.id);
        } else {
          // Already exists — find by email
          const existing = await api<{ items: Array<{ id: string; email: string }> }>(
            "GET",
            `/cfp/applicants?search=${encodeURIComponent(a.email)}`,
          );
          const found = existing.items.find((e) => e.email === a.email);
          if (found) applicantIds.push(found.id);
        }
      }

      // Re-fetch topics for paper assignment
      const topicsFresh = await api<{ items: Array<{ id: string; name: string }> }>("GET", "/cfp/topics");
      const aiTopic = topicsFresh.items.find((t) => t.name.includes("AI"));
      const cloudTopic = topicsFresh.items.find((t) => t.name.includes("Cloud"));

      const talkType = sessionTypes.find((t) => t.slug === "talk");
      const workshopType = sessionTypes.find((t) => t.slug === "workshop");

      // Create papers
      const papersDef = [
        {
          cfp_id: cfpId,
          main_speaker_id: applicantIds[0],
          title: "AI-Powered Code Review: Lessons from Production",
          abstract_short: "How we integrated AI into our code review pipeline and what we learned.",
          level: "intermediate",
          session_type_id: talkType?.id,
          topic_ids: aiTopic ? [aiTopic.id] : [],
        },
        {
          cfp_id: cfpId,
          main_speaker_id: applicantIds[1],
          title: "Building Event-Driven Microservices at Scale",
          abstract_short: "Patterns and anti-patterns for event-driven architectures in large organizations.",
          level: "advanced",
          session_type_id: talkType?.id,
          topic_ids: cloudTopic ? [cloudTopic.id] : [],
        },
        {
          cfp_id: cfpId,
          main_speaker_id: applicantIds[2],
          title: "Hands-On: Kubernetes for Developers",
          abstract_short: "A practical workshop on deploying and managing applications on Kubernetes.",
          level: "beginner",
          session_type_id: workshopType?.id,
          topic_ids: cloudTopic ? [cloudTopic.id] : [],
        },
      ];

      for (const paper of papersDef) {
        if (!paper.main_speaker_id) {
          log(`  Skipping paper "${paper.title}" — no speaker.`);
          continue;
        }
        log(`Creating paper "${paper.title}"...`);
        await apiSafe("POST", "/cfp/papers", paper);
      }
      log("Papers created.");
    } else {
      log(`Papers already exist (${papersResp.total}).`);
    }
  } else {
    log("No CFP found, skipping paper creation.");
  }

  // 17. Make the E2E portal user a CFP committee member of this conference.
  //
  // After PR #182 the portal sidebar's News/Messages section is gated on
  // ``has_any_role`` — i.e. the user has at least one of: training
  // attendee, conference attendee, paper, committee membership. The
  // ``seed_e2e_portal_user`` Python seed only creates the PortalUser +
  // CFPApplicant pair; without a role the E2E user sees Profile +
  // Privacy and nothing else. Granting them a Program Committee
  // membership here unblocks the E2E News tests (and is realistic —
  // the test user routinely needs to navigate Messages / News in
  // suites that exercise communication flows).
  const e2ePortalEmail = process.env.E2E_PORTAL_EMAIL;
  if (e2ePortalEmail) {
    log(`Granting committee membership to E2E portal user ${e2ePortalEmail}...`);
    const apps = await api<{ items: Array<{ id: string; email: string }> }>(
      "GET",
      `/cfp/applicants?search=${encodeURIComponent(e2ePortalEmail)}`,
    );
    const e2eApplicant = apps.items.find((a) => a.email.toLowerCase() === e2ePortalEmail.toLowerCase());
    if (e2eApplicant) {
      const result = await apiSafe("POST", "/cfp/committee-members", {
        conference_id: conferenceId,
        applicant_id: e2eApplicant.id,
      });
      log(result ? "  Committee membership created." : "  Already a committee member (skipped).");
    } else {
      log(`  Applicant not found for ${e2ePortalEmail} — Python seed may not have run yet.`);
    }
  } else {
    log("No E2E_PORTAL_EMAIL set; skipping committee-membership grant.");
  }

  // ─── Output for CI ─────────────────────────────────────────────────────
  log("=== SEED COMPLETE ===");
  log(`Conference ID: ${conferenceId}`);
  log(`Conference Name: ${CONFERENCE_NAME}`);

  // Write to GITHUB_ENV if running in CI
  if (process.env.GITHUB_ENV) {
    const { appendFileSync } = await import("fs");
    appendFileSync(process.env.GITHUB_ENV, `E2E_CONFERENCE_ID=${conferenceId}\n`);
    appendFileSync(process.env.GITHUB_ENV, `E2E_CONFERENCE_NAME=${CONFERENCE_NAME}\n`);
    log("Written E2E_CONFERENCE_ID and E2E_CONFERENCE_NAME to GITHUB_ENV.");
  }
}

main().catch((err) => {
  console.error("[seed] FATAL:", err);
  process.exit(1);
});
