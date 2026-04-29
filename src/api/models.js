// Multi-provider model picker — fetches the list of models the user is
// allowed to pick from /api/models. The backend filters by:
//   · subscription tier (Free / Regular / Advanced)
//   · which provider API keys are configured on the server
// so this list always reflects what the backend can actually serve.

import { authHeaders } from "./auth";
import { getApiBase } from "./chatHistory";

export async function fetchAvailableModels() {
  const res = await fetch(`${getApiBase()}/api/models`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail || "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(detail || `Failed to load models (HTTP ${res.status}).`);
  }

  return res.json(); // { models: [...], default: "gpt-5", tier: "free" }
}
