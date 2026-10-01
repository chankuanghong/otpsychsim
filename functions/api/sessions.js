const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json"
};

async function ensureSessionTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS session_logs (
      id TEXT PRIMARY KEY,
      session_type TEXT,
      profile_name TEXT,
      profile_id TEXT,
      transcript_turn_count INTEGER DEFAULT 0,
      irm_generated INTEGER DEFAULT 0,
      moho_generated INTEGER DEFAULT 0,
      moho_contributor_count INTEGER DEFAULT 0,
      occupation_contributor_count INTEGER DEFAULT 0,
      started_at TEXT,
      ended_at TEXT,
      duration_seconds INTEGER DEFAULT 0,
      status TEXT,
      created_at TEXT NOT NULL
    )
  `).run();
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return Response.json({ ok: false, error: "Session database is not configured." }, { status: 500, headers: jsonHeaders });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400, headers: jsonHeaders });
  }

  await ensureSessionTable(env.DB);
  const now = new Date().toISOString();
  const id = `session-log-${Date.now()}-${crypto.randomUUID()}`;

  await env.DB.prepare(`
    INSERT INTO session_logs (
      id,
      session_type,
      profile_name,
      profile_id,
      transcript_turn_count,
      irm_generated,
      moho_generated,
      moho_contributor_count,
      occupation_contributor_count,
      started_at,
      ended_at,
      duration_seconds,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    String(body.sessionType || ""),
    String(body.profileName || ""),
    body.profileId ? String(body.profileId) : null,
    Number(body.transcriptTurnCount || 0),
    body.irmGenerated ? 1 : 0,
    body.mohoGenerated ? 1 : 0,
    Number(body.mohoContributorCount || 0),
    Number(body.occupationContributorCount || 0),
    body.startedAt ? String(body.startedAt) : null,
    body.endedAt ? String(body.endedAt) : null,
    Number(body.durationSeconds || 0),
    String(body.status || ""),
    now
  ).run();

  return Response.json({ ok: true, id }, { headers: jsonHeaders });
}
