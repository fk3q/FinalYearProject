/**
 * Payments API — talks to the FastAPI /api/payments/* routes.
 * All requests are same-origin and proxied by nginx (or Vite in dev).
 *
 * The `user_id` is now derived server-side from the bearer token, so callers
 * don't (and shouldn't) pass it in the request body.
 */

import { authHeaders, clearSessionUser } from "./auth";

async function postJson(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body || {}),
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error("Couldn't reach the Laboracle server. Please try again.");
    }
    throw e;
  }
  if (res.status === 401) clearSessionUser();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || d).join(" ")
          : res.statusText || "Request failed";
    throw new Error(msg);
  }
  return data;
}

/**
 * Ask the backend to create a Stripe Checkout session and return its URL.
 * Caller should redirect the browser to `url`.
 *
 * @param {{ plan: 'regular'|'advanced', billing: 'monthly'|'yearly' }} opts
 */
export async function createCheckoutSession({ plan, billing = "monthly" }) {
  return postJson("/api/payments/create-checkout-session", { plan, billing });
}

/**
 * Create a Stripe customer-portal session so the user can manage their
 * subscription (cancel, change card, change plan).
 */
export async function createPortalSession() {
  return postJson("/api/payments/create-portal-session");
}
