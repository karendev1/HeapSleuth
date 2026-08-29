import { useEffect } from "react";

import {
  createRetainedPayload,
  getCaseRuntimeState,
  updateChecksum,
} from "../runtime-state.js";

const HEALTHY_EVENT_TYPE = "heapsleuth:summary";

export function HealthyControlCase() {
  useEffect(() => {
    const state = getCaseRuntimeState("healthy-control");
    const instanceId = ++state.createdInstances;
    const payload = createRetainedPayload(instanceId);
    const handleSummary = () => updateChecksum(state, payload, instanceId);
    state.activeResources += 1;
    state.retainedResources += 1;
    window.addEventListener(HEALTHY_EVENT_TYPE, handleSummary);

    return () => {
      window.removeEventListener(HEALTHY_EVENT_TYPE, handleSummary);
      state.activeResources -= 1;
      state.retainedResources -= 1;
      state.releasedResources += 1;
    };
  }, []);

  return (
    <section className="preview" data-heapsleuth-panel>
      <h2>Summary is open</h2>
      <p>The summary prepares temporary data while it is displayed.</p>
    </section>
  );
}
