/**
 * Payments API — talks to the FastAPI /api/payments/* routes.
 * All requests are same-origin and proxied by nginx (or Vite in dev).
 */

const jsonHeaders = { "Content-Type": "application/json" };

async function postJson(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        "Could not reach the server. Make sure the backend is running."
      );
    }
    throw e;
  }
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
 * @param {{ userId: number, plan: 'regular'|'advanced', billing: 'monthly'|'yearly' }} opts
 */
export async function createCheckoutSession({ userId, plan, billing = "monthly" }) {
  return postJson("/api/payments/create-checkout-session", {
    user_id: userId,
    plan,
    billing,
  });
}

/**
 * Create a Stripe customer-portal session so the user can manage their
 * subscription (cancel, change card, change plan).
 */
export async function createPortalSession({ userId }) {
  return postJson("/api/payments/create-portal-session", { user_id: userId });
}
