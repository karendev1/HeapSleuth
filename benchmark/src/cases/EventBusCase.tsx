import { useEffect } from "react";

import {
  createRetainedPayload,
  getCaseRuntimeState,
  updateChecksum,
} from "../runtime-state.js";

const messageSubscribers = new Set<() => void>();

export function EventBusCase() {
  useEffect(() => {
    const state = getCaseRuntimeState("event-bus");
    const instanceId = ++state.createdInstances;
    const payload = createRetainedPayload(instanceId);
    const subscriber = () => updateChecksum(state, payload, instanceId);
    messageSubscribers.add(subscriber);
    state.activeResources = messageSubscribers.size;
    state.retainedResources = messageSubscribers.size;

    // The missing unsubscription is intentional benchmark behavior.
  }, []);

  return (
    <section className="preview" data-heapsleuth-panel>
      <h2>Message center is open</h2>
      <p>The center listens for message refresh notifications.</p>
    </section>
  );
}
