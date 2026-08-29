import { useEffect } from "react";

import {
  createRetainedPayload,
  getCaseRuntimeState,
  updateChecksum,
} from "../runtime-state.js";

export function IntervalCase() {
  useEffect(() => {
    const state = getCaseRuntimeState("interval");
    const instanceId = ++state.createdInstances;
    state.activeResources += 1;
    state.retainedResources += 1;
    const payload = createRetainedPayload(instanceId);

    window.setInterval(() => {
      updateChecksum(state, payload, instanceId);
    }, 1_000);

    // The missing timer cleanup is intentional benchmark behavior.
  }, []);

  return (
    <section className="preview" data-heapsleuth-panel>
      <h2>Activity card is open</h2>
      <p>The card refreshes its displayed activity while it is mounted.</p>
    </section>
  );
}
