# NowChatAI

An AI answer can be useful today and misleading a month from now. NowChatAI helps people revisit the facts behind an answer and see how a change might affect their plans.

Built for the Geek Room Global AI Hackathon's **Stale-Answer Detector for AI Applications** challenge, the prototype combines AI chat, web research, and an opt-in follow-up view.

## The idea

Ask a question and NowChatAI can search the web for relevant sources before answering. When an answer contains a plan worth revisiting, choose to follow it. The app identifies time-sensitive facts and connects them to the steps that depend on them. A later check compares those facts with newly retrieved evidence and highlights possible consequences.

For example, imagine a museum's opening time changes from 10 a.m. to noon. A saved plan to visit at 10:30 might need to move, which could also affect lunch. This is a fictional example, not a claim about a real museum.

The follow-up is an aid to review, not a guarantee that a source or an assessment is correct. Open the cited sources before acting on an important change.

## How it works

1. **Ask:** The React chat sends the question to the Node.js API. When current information is useful, the API searches with Tavily and includes results in the model's context.
2. **Explore:** The answer appears alongside its source links. You can choose the model's reasoning level in the chat composer.
3. **Follow:** Opt in to extract facts and connected plan steps. The baseline is saved in the browser.
4. **Check again:** Use **Check now**, or leave the follow-up visible in the open chat for an hourly check. The app searches again and labels each tracked fact as changed, unchanged, or uncertain, with possible impacts on connected steps.

```text
Browser (React + TypeScript)
       |
       | /api/chat, /api/followup
       v
Node.js API ──────> Tavily Search ──────> web evidence
       |
       └──────────> Bifrost Gateway ────> OpenAI

Browser local storage: saved follow-up baseline and latest check
```

Bifrost routes the model requests; Tavily supplies search results and source links. The model's interpretation of those results is an assessment, not independent verification.

## Run locally

You'll need Node.js, an OpenAI API key with access to the configured model, and a Tavily API key. The included gateway launcher is for Windows with PowerShell.

Install dependencies from the repository root:

```powershell
npm ci
```

Create `.env.local` in the repository root and add your own keys:

```dotenv
OPENAI_API_KEY=your_openai_api_key
TAVILY_API_KEY=your_tavily_api_key
```

Start Bifrost, then start the app:

```powershell
npm run bifrost:start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first gateway launch downloads the official Bifrost binary. The launcher binds the gateway to localhost and disables request logging. Run it again after a computer restart. Do not expose the unauthenticated local gateway to a network.

By default, the app connects to `http://127.0.0.1:8080/openai/v1`. You can configure a gateway URL with `BIFROST_BASE_URL` and, if your gateway requires authentication, set `BIFROST_API_KEY`. Provider credentials belong on the gateway; they are not sent to the browser. Restart the app and gateway after changing their configuration.

`.env.local` and the local `.bifrost/` runtime directory are ignored by Git. Never commit real keys. API calls use your provider credits; higher reasoning levels and follow-up checks can increase usage.

## Deploy to Vercel

The repository includes `vercel.json` and `Dockerfile.vercel` for a Vercel Container Function. The container runs the built app and API alongside Bifrost, which listens only inside the container. Set these environment variables in the Vercel project before deploying:

- `OPENAI_API_KEY`
- `TAVILY_API_KEY`

Keep both values server-side and use a model that your OpenAI account can access. A locally hosted gateway on your own computer is not reachable from a Vercel deployment.

This is a public demo with provider-backed API calls. Protect or rate-limit the deployment before sharing it widely: traffic to the API can consume your credits. Per-process limits, if configured, are not a global spending cap.

## Checks

```powershell
npm test       # server endpoint tests with mocked external services
npm run build  # TypeScript check and production build
```

## Prototype limits

- Follow-up data is stored in this browser, not synced across devices. Automatic checks only run while the follow-up is visible in an open chat; closing or reopening the page does not run checks in the background.
- Search results and AI interpretations can be incomplete, conflicting, or wrong. An uncertain result means the evidence did not support a confident conclusion.
- Displayed source dates are based on available search metadata and may not represent a page's actual last update. Citations should be checked against the linked sources.
- The prototype is not a production monitoring service. It does not promise continuous alerts or automatically change a user's plans.

## Project structure

- `src/` — React interface, chat, and follow-up view.
- `server/` — chat and follow-up handlers, Tavily search, and Bifrost integration.
- `vite.config.mjs` — local development and preview API middleware.
- `start-bifrost.ps1` — local Windows gateway launcher.
- `Dockerfile.vercel` and `vercel.json` — container deployment configuration.
