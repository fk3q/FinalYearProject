// React hook around /api/models.
//
// Loads the available-models list once per chat-page mount and caches
// the user's last selection in sessionStorage so the picker doesn't
// flash to the default every time they navigate.
//
// Returns the same shape regardless of loading / error state, so the
// picker UI can render unconditionally without a bunch of guards.

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchAvailableModels } from "../api/models";

const STORAGE_KEY = "laboracle.selectedModelId";

function readStoredSelection() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredSelection(id) {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sessionStorage may be unavailable in private mode */
  }
}

export function useModels() {
  const [models, setModels] = useState([]);
  const [tier, setTier] = useState("free");
  const [serverDefault, setServerDefault] = useState(null);
  const [selectedId, setSelectedIdState] = useState(() => readStoredSelection());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const setSelectedId = useCallback((id) => {
    setSelectedIdState(id);
    writeStoredSelection(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchAvailableModels()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.models) ? data.models : [];
        setModels(list);
        setTier(String(data?.tier || "free"));
        setServerDefault(data?.default || null);

        // Reconcile the selection. If the cached id isn't in the new
        // list (tier change, model retired) drop it and use the
        // server-suggested default instead.
        const stored = readStoredSelection();
        const isValid =
          stored && list.some((m) => m.id === stored && m.available);
        if (!isValid) {
          const next =
            (data?.default && list.find((m) => m.id === data.default && m.available)?.id) ||
            list.find((m) => m.available)?.id ||
            null;
          setSelectedIdState(next);
          writeStoredSelection(next);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Couldn't load models.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Convenience: the full ModelInfo object for the current selection.
  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedId) || null,
    [models, selectedId]
  );

  return {
    models,
    selectedId,
    selectedModel,
    setSelectedId,
    serverDefault,
    tier,
    loading,
    error,
  };
}
