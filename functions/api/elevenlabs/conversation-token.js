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

export async function onRequestGet({ request, env }) {
  const accessError = requireSimulationAccess(request, env);
  if (accessError) return accessError;

  const apiKey = env.ELEVENLABS_API_KEY || "";
  if (!apiKey) {
    return Response.json({ ok: false, error: "ElevenLabs API key is missing. Set ELEVENLABS_API_KEY in the server environment." }, { status: 400, headers: jsonHeaders });
  }

  const url = new URL(request.url);
  const agentId = String(url.searchParams.get("agent_id") || "").trim();
  if (!agentId) {
    return Response.json({ ok: false, error: "ElevenLabs agent ID is required." }, { status: 400, headers: jsonHeaders });
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`, {
    method: "GET",
    headers: {
      "xi-api-key": apiKey
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return Response.json({
      ok: false,
      error: stringifyErrorDetail(data.detail) || stringifyErrorDetail(data.error) || `ElevenLabs returned ${response.status}.`,
      upstream: data
    }, { status: response.status, headers: jsonHeaders });
  }

  return Response.json({ ok: true, token: data.token }, { headers: jsonHeaders });
}
