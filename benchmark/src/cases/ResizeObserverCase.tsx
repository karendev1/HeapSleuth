import { useEffect } from "react";

import {
  createRetainedPayload,
  getCaseRuntimeState,
  updateChecksum,
} from "../runtime-state.js";

export function ResizeObserverCase() {
  useEffect(() => {
    const state = getCaseRuntimeState("resize-observer");
    const instanceId = ++state.createdInstances;
    state.activeResources += 1;
    state.retainedResources += 1;
    const payload = createRetainedPayload(instanceId);
    const observer = new ResizeObserver(() => {
      updateChecksum(state, payload, instanceId);
    });

    observer.observe(document.body);

    // The missing observer disconnection is intentional benchmark behavior.
  }, []);

  return (
    <section className="preview" data-heapsleuth-panel>
      <h2>Responsive preview is open</h2>
      <p>The preview follows changes to the available page size.</p>
    </section>
  );
}
