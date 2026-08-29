import { useEffect } from "react";

import {
  createRetainedPayload,
  getCaseRuntimeState,
} from "../runtime-state.js";

const viewedItemCache = new Map<number, Uint8Array>();

export function GlobalCacheCase() {
  useEffect(() => {
    const state = getCaseRuntimeState("global-cache");
    const instanceId = ++state.createdInstances;
    viewedItemCache.set(instanceId, createRetainedPayload(instanceId));
    state.activeResources = viewedItemCache.size;
    state.retainedResources = viewedItemCache.size;
  }, []);

  return (
    <section className="preview" data-heapsleuth-panel>
      <h2>Recent item is open</h2>
      <p>The item records its prepared display data while viewed.</p>
    </section>
  );
}
