# AI Clinical Simulation Agent Guide

This file extends the shared rules in the workspace-root `AGENTS.md`. Its clinical purpose, simulation boundaries, and local structure take priority for this application.

## Purpose

AI Clinical Simulation is an occupational therapy interview simulation app. It supports psychological safety, role-play with simulated mental health clients, therapeutic communication practice, reflection, and clinical reasoning development.

Treat this as a training and supervision aid, not a diagnostic tool, risk assessment tool, or replacement for clinical supervision.

## Read First

1. `Read_me.txt` for original product and UX intent.
2. `irm_cheatsheet.md` before changing therapeutic communication guidance.
3. `Reference/mentease-elevenlabs-personas.md` before changing voice-agent personas.
4. `Profiles/` before changing local patient/client persona content.
5. `functions/api/elevenlabs/` before changing conversation or agent setup.
6. `functions/api/gemini/analyse.js` before changing reflection or analysis behavior.
7. `functions/api/sessions.js` before changing session logging.
8. `.env.example` before changing required environment variables.

## Knowledge To Product Translation

Clinical knowledge should be translated into simulation assets and reflection structure:

- Diagnostic presentation becomes persona behavior, not a label-only prompt.
- Therapeutic use of self becomes interview cues, stuck prompts, and reflection criteria.
- Psychological safety becomes supportive UI, non-punitive feedback, and clear practice framing.
- Student performance becomes reflective prompts and supervision notes, not automated pass/fail judgement.

When adding a persona, define:

1. Learning objective.
2. Diagnosis/current presentation.
3. Occupational context.
4. Interview task.
5. What information should be revealed gradually.
6. Boundaries for crisis, risk, or unsafe content.
7. Reflection questions for the student.

## Current Structure

- `index.html`: main single-page training interface.
- `local-server.js`: local development server and API support.
- `functions/api/`: Cloudflare Functions API.
- `functions/api/elevenlabs/`: ElevenLabs conversation and agent endpoints.
- `functions/api/gemini/`: reflection/analysis endpoint.
- `functions/api/profiles/`: profile/persona endpoints.
- `Profiles/`: local persona/profile content.
- `Reference/`: source and reference materials only.
- `session-history.json`: local session artifact; do not treat as production database.

## Boundaries

- Keep persona source material separate from runtime session logs.
- Keep API keys and voice/LLM provider secrets in environment variables.
- Keep training content and reflective analysis clinically conservative.
- Do not hardcode real API keys, real patient details, or real student records.
- Do not let AI analysis block the core simulation flow.

## Safety And Privacy Rules

- Use fictional or de-identified personas only.
- Do not include real patient stories unless they are fully de-identified and approved for training use.
- Do not generate definitive diagnosis, risk, capacity, discharge, or treatment decisions.
- Include support-seeking pathways in scenarios involving suicidality, aggression, self-neglect, or severe distress.
- Maintain clear framing that the client is simulated.
- Keep psychological safety central: feedback should be specific, reflective, and non-shaming.

## Production Readiness Checks

Before calling a change production-ready:

- The app works without exposing provider secrets in browser code.
- ElevenLabs and Gemini failures degrade gracefully.
- Persona prompts follow the simulation boundary and do not reveal hidden content too early.
- Session logging excludes identifiable data.
- Admin/profile endpoints have an access-control plan.
- Reflection output is framed as educational guidance, not clinical judgement.

## Preferred Next Documentation

Add these when preparing for showcase or pilot:

- `README.md`
- `ARCHITECTURE.md`
- `docs/product-brief.md`
- `docs/persona-template.md`
- `docs/safety-privacy.md`
- `docs/simulation-governance.md`
- `docs/demo-script.md`
