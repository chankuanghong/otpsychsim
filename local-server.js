const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;

function loadEnvFile(fileName = ".env") {
  const envPath = path.join(root, fileName);
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) return;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key]) return;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  });
}

loadEnvFile();

const port = Number(process.env.PORT || 8792);
const historyPath = path.join(root, "session-history.json");
const rateLimitBuckets = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function readJson(request, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function getClientKey(request) {
  return request.socket.remoteAddress || "unknown";
}

function isRateLimited(request, bucketName, limit, windowMs) {
  const now = Date.now();
  const key = `${bucketName}:${getClientKey(request)}`;
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return bucket.count > limit;
}

function requireSimulationAccess(request, response) {
  const expectedCode = String(process.env.SIMULATION_ACCESS_CODE || "").trim();
  if (!expectedCode) return true;
  const providedCode = String(request.headers["x-simulation-access-code"] || "").trim();
  if (providedCode === expectedCode) return true;
  sendJson(response, 401, { ok: false, error: "Simulation access code is required before using voice or AI analysis credits." });
  return false;
}

function protectCreditEndpoint(request, response, bucketName, limit, windowMs) {
  if (!requireSimulationAccess(request, response)) return false;
  if (isRateLimited(request, bucketName, limit, windowMs)) {
    sendJson(response, 429, { ok: false, error: "Too many requests. Please wait before trying again." });
    return false;
  }
  return true;
}

function readHistoryFile() {
  if (!fs.existsSync(historyPath)) return [];
  try {
    const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    return Array.isArray(history) ? history : [];
  } catch (error) {
    return [];
  }
}

function writeHistoryFile(history) {
  fs.writeFileSync(historyPath, JSON.stringify(Array.isArray(history) ? history.slice(0, 100) : [], null, 2));
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
  return {
    name: String(body.name || "OT Simulation Client").trim(),
    tags: ["ot-simulation", "psychiatric-simulation"],
    conversation_config: {
      agent: {
        first_message: String(body.firstMessage || "").trim(),
        language: "en",
        disable_first_message_interruptions: false,
        prompt: {
          prompt: buildAgentPrompt(String(body.casePrompt || "").trim()),
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
        voice_id: String(body.voiceId || "").trim(),
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

function buildGeminiAnalysisPrompt(body) {
  const transcript = String(body.transcript || "").trim();
  const profileName = String(body.profileName || "Unknown simulation").trim();
  const stageFramework = process.env.GEMINI_STAGE_FRAMEWORK || "engagement_exploration_insight_action_consolidation";

  return `
You are an occupational therapy supervision assistant reviewing a psychiatric simulation transcript.

Simulation profile: ${profileName}
Stage framework: ${stageFramework}

Analyse only from the transcript. Use concise educational language. Include verbatim quotes exactly as they appear in the transcript, but keep quotes short.

Return strict JSON with this shape:
{
  "summary": "one short paragraph",
  "therapeutic_modes": [
    {
      "mode": "Empathizing | Collaborating | Encouraging | Instructing | Problem-solving | Advocating",
      "student_verbatim": "short quote from Student",
      "interpretation": "why this mode is suggested",
      "quality": "effective | mixed | missed_opportunity"
    }
  ],
  "interpersonal_events": [
    {
      "event": "Strong emotion | Intimate self-disclosure | Power dilemma | Nonverbal cue | Crisis point | Resistance/reluctance | Boundary testing | Empathic break | Emotionally charged task | Limitation of therapy | Contextual inconsistency",
      "patient_verbatim": "short quote from Client",
      "interpretation": "why this event is suggested",
      "intensity": "low | moderate | high"
    }
  ],
  "event_mode_matching": [
    {
      "patient_event": "event name",
      "patient_verbatim": "short Client quote",
      "student_response": "short Student quote",
      "mode_used": "mode name or unclear",
      "fit": "matched | partially_matched | mismatched | missed",
      "recommended_mode": "mode name",
      "rationale": "brief rationale"
    }
  ],
  "patient_emotional_state": {
    "primary_state": "brief label",
    "secondary_states": ["brief labels"],
    "evidence": ["short Client quote"],
    "clinical_reading": "educational formulation, not diagnosis"
  },
  "stage_progression": {
    "current_stage": "engagement | exploration | insight | action | consolidation",
    "movement": "stuck | slight_progress | progressing | regressed",
    "evidence": ["short quote"],
    "next_student_move": "one practical next intervention"
  }
}

Transcript:
${transcript}
`.trim();
}

function extractGeminiJson(text) {
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

async function handleGeminiAnalysis(request, response) {
  try {
    if (!protectCreditEndpoint(request, response, "gemini", 20, 60 * 60 * 1000)) return;
    const apiKey = process.env.GEMINI_API_KEY || "";
    const enabled = String(process.env.GEMINI_ANALYSIS_ENABLED || "false").toLowerCase() === "true";
    if (!enabled) {
      sendJson(response, 400, { ok: false, error: "Gemini analysis is disabled." });
      return;
    }

    if (!apiKey) {
      sendJson(response, 400, { ok: false, error: "Gemini API key is missing." });
      return;
    }

    const body = await readJson(request, 80_000);
    if (!String(body.transcript || "").trim()) {
      sendJson(response, 400, { ok: false, error: "Transcript is required for Gemini analysis." });
      return;
    }

    if (String(body.transcript || "").length > 30_000) {
      sendJson(response, 413, { ok: false, error: "Transcript is too long for one Gemini analysis request." });
      return;
    }

    const model = process.env.GEMINI_ANALYSIS_MODEL || "gemini-2.5-flash-lite";
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildGeminiAnalysisPrompt(body) }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          response_mime_type: "application/json"
        }
      })
    });
    const data = await upstream.json().catch(() => ({}));
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    const analysis = extractGeminiJson(text);

    response.writeHead(upstream.ok && analysis ? 200 : upstream.status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(upstream.ok && analysis
      ? { ok: true, analysis, model }
      : { ok: false, error: stringifyErrorDetail(data.error) || "Gemini did not return a valid analysis.", upstream: data }
    ));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: error.message || "Could not run Gemini analysis." }));
  }
}

async function handleHistoryRequest(request, response) {
  try {
    if (request.method === "GET") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, history: readHistoryFile() }));
      return;
    }

    if (request.method === "PUT") {
      const body = await readJson(request);
      writeHistoryFile(Array.isArray(body.history) ? body.history : []);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.method === "DELETE") {
      writeHistoryFile([]);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(405, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: error.message || "Could not update history." }));
  }
}

async function handleCreateElevenLabsAgent(request, response) {
  try {
    if (!protectCreditEndpoint(request, response, "elevenlabs-agent-create", 10, 60 * 60 * 1000)) return;
    const body = await readJson(request);
    const apiKey = process.env.ELEVENLABS_API_KEY || "";
    if (!apiKey) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "ElevenLabs API key is missing." }));
      return;
    }

    if (!String(body.voiceId || "").trim() || !String(body.casePrompt || "").trim()) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "Voice ID and persona prompt are required." }));
      return;
    }

    const upstream = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey
      },
      body: JSON.stringify(buildCreateAgentPayload(body))
    });
    const data = await upstream.json().catch(() => ({}));

    response.writeHead(upstream.status, { "Content-Type": "application/json" });
    if (!upstream.ok) {
      fs.writeFileSync(path.join(root, "last-elevenlabs-error.json"), JSON.stringify({
        status: upstream.status,
        response: data,
        request: buildCreateAgentPayload(body)
      }, null, 2));
    }
    response.end(JSON.stringify(upstream.ok
      ? { ok: true, agentId: data.agent_id, upstream: data }
      : { ok: false, error: stringifyErrorDetail(data.detail) || stringifyErrorDetail(data.error) || `ElevenLabs returned ${upstream.status}.`, upstream: data }
    ));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: error.message || "Could not create ElevenLabs agent." }));
  }
}

async function handleGetConversationToken(request, response, url) {
  try {
    if (!protectCreditEndpoint(request, response, "elevenlabs-token", 60, 60 * 60 * 1000)) return;
    const apiKey = process.env.ELEVENLABS_API_KEY || "";
    const agentId = String(url.searchParams.get("agent_id") || "").trim();
    if (!apiKey) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "ElevenLabs API key is missing." }));
      return;
    }

    if (!agentId) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "ElevenLabs agent ID is required." }));
      return;
    }

    const upstream = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`, {
      method: "GET",
      headers: {
        "xi-api-key": apiKey
      }
    });
    const data = await upstream.json().catch(() => ({}));

    response.writeHead(upstream.status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(upstream.ok
      ? { ok: true, token: data.token }
      : { ok: false, error: stringifyErrorDetail(data.detail) || stringifyErrorDetail(data.error) || `ElevenLabs returned ${upstream.status}.`, upstream: data }
    ));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: error.message || "Could not create ElevenLabs conversation token." }));
  }
}

async function handleGetConversationDetails(request, response, url) {
  try {
    if (!protectCreditEndpoint(request, response, "elevenlabs-conversation", 120, 60 * 60 * 1000)) return;
    const apiKey = process.env.ELEVENLABS_API_KEY || "";
    const conversationId = String(url.searchParams.get("conversation_id") || "").trim();
    if (!apiKey) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "ElevenLabs API key is missing." }));
      return;
    }

    if (!conversationId) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "ElevenLabs conversation ID is required." }));
      return;
    }

    const upstream = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`, {
      method: "GET",
      headers: {
        "xi-api-key": apiKey
      }
    });
    const data = await upstream.json().catch(() => ({}));

    response.writeHead(upstream.status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(upstream.ok
      ? { ok: true, conversation: data, transcript: Array.isArray(data.transcript) ? data.transcript : [] }
      : { ok: false, error: stringifyErrorDetail(data.detail) || stringifyErrorDetail(data.error) || `ElevenLabs returned ${upstream.status}.`, upstream: data }
    ));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: error.message || "Could not load ElevenLabs conversation details." }));
  }
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const stream = fs.createReadStream(filePath);
  response.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  stream.pipe(response);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (request.method === "POST" && url.pathname === "/api/elevenlabs/agents") {
    handleCreateElevenLabsAgent(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/elevenlabs/conversation-token") {
    handleGetConversationToken(request, response, url);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/elevenlabs/conversation") {
    handleGetConversationDetails(request, response, url);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/gemini/analyse") {
    handleGeminiAnalysis(request, response);
    return;
  }

  if (url.pathname === "/api/history") {
    handleHistoryRequest(request, response);
    return;
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(root, `.${decodeURIComponent(pathname)}`);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    sendFile(response, filePath);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`OT Simulation Lab running at http://127.0.0.1:${port}`);
});
