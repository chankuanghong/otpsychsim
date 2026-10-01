const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json"
};

async function ensureProfilesTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      persona_prompt TEXT DEFAULT '',
      agent_id TEXT NOT NULL,
      voice_id TEXT DEFAULT '',
      voice_label TEXT DEFAULT '',
      file_name TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  const { results } = await db.prepare("PRAGMA table_info(profiles)").all();
  const hasPersonaPrompt = results.some((column) => column.name === "persona_prompt");
  if (!hasPersonaPrompt) {
    await db.prepare("ALTER TABLE profiles ADD COLUMN persona_prompt TEXT DEFAULT ''").run();
  }
  const hasVoiceId = results.some((column) => column.name === "voice_id");
  if (!hasVoiceId) {
    await db.prepare("ALTER TABLE profiles ADD COLUMN voice_id TEXT DEFAULT ''").run();
  }
  const hasVoiceLabel = results.some((column) => column.name === "voice_label");
  if (!hasVoiceLabel) {
    await db.prepare("ALTER TABLE profiles ADD COLUMN voice_label TEXT DEFAULT ''").run();
  }
}

function toClientProfile(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    casePrompt: row.persona_prompt || "",
    agentId: row.agent_id,
    voiceId: row.voice_id || "",
    voiceLabel: row.voice_label || "",
    fileName: row.file_name || ""
  };
}

function requireAdmin() {
  return true;
}

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return Response.json({ ok: false, error: "Profiles database is not configured." }, { status: 500, headers: jsonHeaders });
  }

  await ensureProfilesTable(env.DB);
  const { results } = await env.DB.prepare(`
    SELECT id, name, description, agent_id, file_name, persona_prompt, voice_id, voice_label
    FROM profiles
    ORDER BY created_at ASC
  `).all();

  return Response.json({ ok: true, profiles: results.map(toClientProfile) }, { headers: jsonHeaders });
}

export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: jsonHeaders });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const agentId = String(body?.agentId || "").trim();
  const description = String(body?.description || "").trim();
  const casePrompt = String(body?.casePrompt || body?.personaPrompt || "").trim();
  const voiceId = String(body?.voiceId || "").trim();
  const voiceLabel = String(body?.voiceLabel || "").trim();
  const fileName = String(body?.fileName || "").trim();
  const id = String(body?.id || `profile-${Date.now()}`).trim();

  if (!name || !agentId || !id) {
    return Response.json({ ok: false, error: "Name and ElevenLabs agent ID are required." }, { status: 400, headers: jsonHeaders });
  }

  if (!env.DB) {
    return Response.json({ ok: false, error: "Profiles database is not configured." }, { status: 500, headers: jsonHeaders });
  }

  await ensureProfilesTable(env.DB);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO profiles (id, name, description, persona_prompt, agent_id, voice_id, voice_label, file_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      persona_prompt = excluded.persona_prompt,
      agent_id = excluded.agent_id,
      voice_id = excluded.voice_id,
      voice_label = excluded.voice_label,
      file_name = excluded.file_name,
      updated_at = excluded.updated_at
  `).bind(id, name, description, casePrompt, agentId, voiceId, voiceLabel, fileName, now, now).run();

  return Response.json({ ok: true, profile: { id, name, description, casePrompt, agentId, voiceId, voiceLabel, fileName } }, { headers: jsonHeaders });
}
