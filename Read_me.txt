# Role: Senior Frontend Developer & UX Designer
# Project: OT Clinical Simulation App (Phase 1)

Context: 
I am building a web application for Occupational Therapy students to practice initial interviews. 
The goal is "Psychological Safety"—the UI must be clean, calming, and supportive. 
It should not feel like an exam; it should feel like a safe sandbox.

Technical Requirements:
- Framework: Vanilla HTML5 and Tailwind CSS (CDN link).
- Structure: A single-page application (SPA) layout.
- Database: Integration-ready for Cloudflare D1 via a fetch API.

UI/UX Instructions:
1. Theme: Use a 'Soft Clinical' palette (Slate-50 background, Indigo-600 accents, Emerald-500 for success states).
2. Layout: 
   - A header with the title "OT Interview Lab" and a small "Help/Tour" button.
   - A central "Interaction Card" that contains the ElevenLabs Conversational AI widget.
   - A persistent "Safety Bar" at the bottom with the text: "This is a safe practice zone. Focus on your therapeutic modes."
3. Functionality:
   - Include a "Start Interview" button that reveals the AI widget and starts a timer.
   - Include an "End Interview" button that triggers a confirmation modal ("Are you sure you're ready to wrap up?").
   - Upon confirmation, hide the widget and show a "Reflection Loading" state.
   - A 'Stuck?' floating action button (FAB) that displays 3 sample OT questions when clicked.

Code Output:
Please generate a single `index.html` file containing the CSS, HTML structure, and the JavaScript logic to handle the UI state changes (showing/hiding sections) and the API call to log the session to Cloudflare.