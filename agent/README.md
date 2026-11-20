# Gamenet LAN Agent

The agent is a small HTTP service that runs on each customer PC and listens on
TCP port `48721`. The manager app sends requests from the Electron main process
(`gamenet:agent-request`) so the renderer CSP stays strict.

The app generates a random `alvand_agentToken` on first use (at least 16
characters). The old shared default `alvand123` is rejected and rotated. Copy
the token from Settings to each agent before using it on a shared LAN.

Endpoints used by the manager:

- `GET /lock` — lock the customer desktop
- `GET /unlock` — unlock it
- `GET /warn?msg=<text>` — show a warning on the customer screen
- `GET /shutdown` — shut the customer PC down
- `GET /status` — return the agent status as JSON

Every request is sent with the `X-Agent-Token: <alvand_agentToken>` header
(never in the URL). The main process only accepts a bare IPv4 host, a safe
path, a bounded JSON response, and a 16–128 character token.
