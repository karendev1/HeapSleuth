import { useEffect } from "react";

import {
  createRetainedPayload,
  getCaseRuntimeState,
  updateChecksum,
} from "../runtime-state.js";

const reportCallbacks: Array<() => void> = [];

export function ClosureRegistryCase() {
  useEffect(() => {
    const state = getCaseRuntimeState("closure-registry");
    const instanceId = ++state.createdInstances;
    const payload = createRetainedPayload(instanceId);
    reportCallbacks.push(() => updateChecksum(state, payload, instanceId));
    state.activeResources = reportCallbacks.length;
    state.retainedResources = reportCallbacks.length;
  }, []);

  return (
    <section className="preview" data-heapsleuth-panel>
      <h2>Report preview is open</h2>
      <p>The preview registers a callback for later report preparation.</p>
    </section>
  );
}
