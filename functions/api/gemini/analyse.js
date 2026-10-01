const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json"
};

function stringifyErrorDetail(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(stringifyErrorDetail).filter(Boolean).join("; ");
  }
  if (typeof value === "object") {
    if (value.loc && value.msg) return `${value.loc.join(".")}: ${value.msg}`;
    if (value.message) return stringifyErrorDetail(value.message);
    if (value.msg) return stringifyErrorDetail(value.msg);
    if (value.error) return stringifyErrorDetail(value.error);
    return JSON.stringify(value);
  }
  return String(value);
}

function requireSimulationAccess(request, env) {
  const expectedCode = String(env.SIMULATION_ACCESS_CODE || "").trim();
  if (!expectedCode) return null;
  const providedCode = String(request.headers.get("x-simulation-access-code") || "").trim();
  if (providedCode === expectedCode) return null;
  return Response.json({ ok: false, error: "Simulation access code is required before using voice or AI analysis credits." }, { status: 401, headers: jsonHeaders });
}

function buildPrompt(body, env) {
  const transcript = String(body.transcript || "").trim();
  const profileName = String(body.profileName || "Unknown simulation").trim();
  const stageFramework = env.GEMINI_STAGE_FRAMEWORK || "engagement_exploration_insight_action_consolidation";

  return `
You are an occupational therapy supervision assistant reviewing a psychiatric simulation transcript.

Simulation profile: ${profileName}
Stage framework: ${stageFramework}

Analyse only from the transcript. Use concise educational language. Include short verbatim quotes exactly as they appear in the transcript.

Return strict JSON with keys: summary, therapeutic_modes, interpersonal_events, event_mode_matching, patient_emotional_state, stage_progression.

Each therapeutic_modes item: mode, student_verbatim, interpretation, quality.
Each interpersonal_events item: event, patient_verbatim, interpretation, intensity.
Each event_mode_matching item: patient_event, patient_verbatim, student_response, mode_used, fit, recommended_mode, rationale.
patient_emotional_state: primary_state, secondary_states, evidence, clinical_reading.
stage_progression: current_stage, movement, evidence, next_student_move.

Transcript:
${transcript}
`.trim();
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  }
}

export async function onRequestPost({ request, env }) {
  const accessError = requireSimulationAccess(request, env);
  if (accessError) return accessError;

  if (String(env.GEMINI_ANALYSIS_ENABLED || "false").toLowerCase() !== "true") {
    return Response.json({ ok: false, error: "Gemini analysis is disabled." }, { status: 400, headers: jsonHeaders });
  }

  if (!env.GEMINI_API_KEY) {
    return Response.json({ ok: false, error: "Gemini API key is missing." }, { status: 400, headers: jsonHeaders });
  }

  const body = await request.json().catch(() => null);
  if (!body || !String(body.transcript || "").trim()) {
    return Response.json({ ok: false, error: "Transcript is required for Gemini analysis." }, { status: 400, headers: jsonHeaders });
  }

  if (String(body.transcript || "").length > 30_000) {
    return Response.json({ ok: false, error: "Transcript is too long for one Gemini analysis request." }, { status: 413, headers: jsonHeaders });
  }

  const model = env.GEMINI_ANALYSIS_MODEL || "gemini-2.5-flash-lite";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(body, env) }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        response_mime_type: "application/json"
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const analysis = extractJson(text);

  if (!response.ok || !analysis) {
    return Response.json({
      ok: false,
      error: stringifyErrorDetail(data.error) || "Gemini did not return a valid analysis.",
      upstream: data
    }, { status: response.status, headers: jsonHeaders });
  }

  return Response.json({ ok: true, analysis, model }, { headers: jsonHeaders });
}
