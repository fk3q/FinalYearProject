import { useEffect, useRef } from "react";
import { addUsageSeconds, getSessionUser } from "../api/auth";

/**
 * While a dashboard page is open, report active time so the server can store
 * "daily time spent" for the signed-in user.
 */
export function useUsageTracker() {
  const intervalRef = useRef(null);

  useEffect(() => {
    const user = getSessionUser();
    const uid = user?.id;
    if (!uid) return;

    const tick = () => {
      if (document.visibilityState === "visible") {
        addUsageSeconds(uid, 50);
      }
    };

    intervalRef.current = window.setInterval(tick, 50000);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        addUsageSeconds(uid, 15);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const onUnload = () => {
      addUsageSeconds(uid, 25);
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);
}
