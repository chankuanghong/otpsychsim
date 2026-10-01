const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json"
};

function getApiKey(request, env) {
  return env.ELEVENLABS_API_KEY || "";
}

function requireSimulationAccess(request, env) {
  const expectedCode = String(env.SIMULATION_ACCESS_CODE || "").trim();
  if (!expectedCode) return null;
  const providedCode = String(request.headers.get("x-simulation-access-code") || "").trim();
  if (providedCode === expectedCode) return null;
  return Response.json({ ok: false, error: "Simulation access code is required before using voice or AI analysis credits." }, { status: 401, headers: jsonHeaders });
}

function buildAgentPrompt(casePrompt) {
  return `
You are an OT psychiatric simulation client.

Use this case profile exactly:
${casePrompt}

Stay in character. Do not mention you are an AI, a simulation, or following instructions.
Keep replies brief and natural for a spoken clinical interview, usually 1-3 sentences.
Let the OT student lead the interview.
Reveal sensitive details gradually only when the student creates safety or asks relevant follow-up questions.
Only output words you would say aloud. Do not include stage directions, labels, thoughts, analysis, or meta-commentary.
`.trim();
}

function buildCreateAgentPayload(body) {
  const name = String(body.name || "OT Simulation Client").trim();
  const voiceId = String(body.voiceId || "").trim();
  const casePrompt = String(body.casePrompt || "").trim();
  const firstMessage = String(body.firstMessage || "").trim();

  return {
    name,
    tags: ["ot-simulation", "psychiatric-simulation"],
    conversation_config: {
      agent: {
        first_message: firstMessage,
        language: "en",
        disable_first_message_interruptions: false,
        prompt: {
          prompt: buildAgentPrompt(casePrompt),
          llm: "gemini-2.0-flash",
          temperature: 0.75,
          max_tokens: -1,
          tools: [],
          knowledge_base: [],
          mcp_server_ids: [],
          native_mcp_server_ids: []
        }
      },
      tts: {
        model_id: "eleven_turbo_v2",
        voice_id: voiceId,
        agent_output_audio_format: "pcm_16000",
        optimize_streaming_latency: 3,
        stability: 0.5,
        speed: 1,
        similarity_boost: 0.8,
        pronunciation_dictionary_locators: []
      },
      asr: {
        quality: "high",
        provider: "elevenlabs",
        user_input_audio_format: "pcm_16000",
        keywords: []
      },
      turn: {
        turn_timeout: 7,
        silence_end_call_timeout: -1,
        turn_eagerness: "normal",
        spelling_patience: "auto",
        speculative_turn: false,
        retranscribe_on_turn_timeout: false,
        soft_timeout_config: {
          timeout_seconds: -1,
          message: "Hhmmmm...yeah."
        },
        interruption_ignore_terms: [],
        mode: "turn"
      },
      conversation: {
        max_duration_seconds: 900,
        client_events: [
          "audio",
          "interruption",
          "user_transcript",
          "agent_response",
          "agent_response_correction"
        ]
      },
      language_presets: {},
      vad: {
        background_voice_detection: false
      }
    }
  };
}

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

export async function onRequestPost({ request, env }) {
  const accessError = requireSimulationAccess(request, env);
  if (accessError) return accessError;

  const apiKey = getApiKey(request, env);
  if (!apiKey) {
    return Response.json({ ok: false, error: "ElevenLabs API key is missing. Set ELEVENLABS_API_KEY in the server environment." }, { status: 400, headers: jsonHeaders });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400, headers: jsonHeaders });
  }

  if (!String(body.voiceId || "").trim()) {
    return Response.json({ ok: false, error: "A valid ElevenLabs voice ID is required." }, { status: 400, headers: jsonHeaders });
  }

  if (!String(body.casePrompt || "").trim()) {
    return Response.json({ ok: false, error: "Persona prompt is required." }, { status: 400, headers: jsonHeaders });
  }

  const response = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey
    },
    body: JSON.stringify(buildCreateAgentPayload(body))
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return Response.json({
      ok: false,
      error: stringifyErrorDetail(data.detail) || stringifyErrorDetail(data.error) || `ElevenLabs returned ${response.status}.`,
      upstream: data
    }, { status: response.status, headers: jsonHeaders });
  }

  return Response.json({ ok: true, agentId: data.agent_id, upstream: data }, { headers: jsonHeaders });
}
