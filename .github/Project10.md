- [x] Verify that the copilot-instructions.md file in the .github directory is created.
- [x] Clarify Project Requirements
- [x] Scaffold the Project
- [x] Customize the Project
- [x] Install Required Extensions (No extensions needed)
- [x] Compile the Project
- [x] Create and Run Task
- [ ] Launch the Project
- [x] Ensure Documentation is Complete

Prompt: Scaffold Project 10 — Research Digest Agent
I am starting a brand new project from scratch called Research Digest Agent. Nothing exists yet.
I have a copilot-instructions.md file in my .github folder that describes the folder structure and tech stack I want to use.

Goal
Set up the empty project structure for both the frontend and backend of an AI agent that will autonomously search arXiv, decide when it has gathered enough evidence, and stream a structured research digest to the browser in real time.
I don't want any feature code yet — just the scaffolding and config.

For the backend (Python + FastAPI)
Create the folder structure described in copilot-instructions.md
Create a main entry point file for the FastAPI app, with CORS configured and a placeholder router for the agent endpoint
Create a config file that reads settings from a .env file (using pydantic-settings)
Create empty placeholder modules for:
the arXiv search tool (external API client)
the agent loop / planner (decides when enough evidence is collected)
the streaming endpoint (Server-Sent Events or WebSocket) that will emit structured digest chunks
schemas for the structured digest output (paper metadata, summary, citations, final synthesis)
Create a requirements.txt with all the libraries I'll need for the full project, including:
fastapi, uvicorn[standard], pydantic, pydantic-settings
httpx (for arXiv API calls)
arxiv (Python client)
langchain, langgraph (for the agent loop)
litellm or openai (LLM gateway)
sse-starlette (for streaming responses)
python-dotenv
Create a .env.example file that lists all the environment variables I'll need, with the values left blank:
APP_NAME, APP_ENV, DEBUG, API_V1_PREFIX
LITELLM_PROXY_URL, LITELLM_API_KEY, DEFAULT_LLM_MODEL
ARXIV_MAX_RESULTS, ARXIV_BASE_URL
AGENT_MAX_ITERATIONS, AGENT_EVIDENCE_THRESHOLD
CORS_ORIGINS
For the frontend (React + TypeScript + Tailwind CSS)
Set up a new React project using Vite
Configure Tailwind CSS with postcss.config.js and tailwind.config.js
Create a file for making API calls to the backend (src/lib/api.ts)
Create a helper for consuming the streaming endpoint (e.g., src/lib/stream.ts) — empty stub for now
Create a file for shared TypeScript types (src/types/index.ts) — empty for now, but reserved for Paper, DigestChunk, AgentEvent types
Create empty placeholder folders under src/components/ for:
agent/ (live agent thought stream UI)
digest/ (rendered structured digest)
search/ (query input form)
Rules
No feature code — structure and config files only
API keys and secrets must never be written directly in code files, only loaded from environment variables
The frontend should be configured to talk to the backend on localhost (Vite proxy to http://localhost:8000)
The streaming endpoint contract must be defined (placeholder route + schema), even though logic is empty
Output
The full folder structure with empty or minimal files in place, ready for feature development of the autonomous arXiv research agent to begin.