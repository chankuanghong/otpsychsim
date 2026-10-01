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

function requireAdmin() {
  return true;
}

export async function onRequestPut({ request, env, params }) {
  if (!requireAdmin(request, env)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: jsonHeaders });
  }

  const body = await request.json().catch(() => null);
  const id = String(params.id || "").trim();
  const name = String(body?.name || "").trim();
  const agentId = String(body?.agentId || "").trim();
  const description = String(body?.description || "").trim();
  const casePrompt = String(body?.casePrompt || body?.personaPrompt || "").trim();
  const voiceId = String(body?.voiceId || "").trim();
  const voiceLabel = String(body?.voiceLabel || "").trim();
  const fileName = String(body?.fileName || "").trim();

  if (!id || !name || !agentId) {
    return Response.json({ ok: false, error: "Name and ElevenLabs agent ID are required." }, { status: 400, headers: jsonHeaders });
  }

  if (!env.DB) {
    return Response.json({ ok: false, error: "Profiles database is not configured." }, { status: 500, headers: jsonHeaders });
  }

  await ensureProfilesTable(env.DB);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE profiles
    SET name = ?, description = ?, persona_prompt = ?, agent_id = ?, voice_id = ?, voice_label = ?, file_name = ?, updated_at = ?
    WHERE id = ?
  `).bind(name, description, casePrompt, agentId, voiceId, voiceLabel, fileName, now, id).run();

  return Response.json({ ok: true, profile: { id, name, description, casePrompt, agentId, voiceId, voiceLabel, fileName } }, { headers: jsonHeaders });
}

export async function onRequestDelete({ request, env, params }) {
  if (!requireAdmin(request, env)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: jsonHeaders });
  }

  const id = String(params.id || "").trim();
  if (!id) {
    return Response.json({ ok: false, error: "Profile ID is required." }, { status: 400, headers: jsonHeaders });
  }

  if (!env.DB) {
    return Response.json({ ok: false, error: "Profiles database is not configured." }, { status: 500, headers: jsonHeaders });
  }

  await ensureProfilesTable(env.DB);
  await env.DB.prepare("DELETE FROM profiles WHERE id = ?").bind(id).run();

  return Response.json({ ok: true }, { headers: jsonHeaders });
}
