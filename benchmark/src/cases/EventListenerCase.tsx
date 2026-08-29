import { useEffect } from "react";

import {
  createRetainedPayload,
  getCaseRuntimeState,
  updateChecksum,
} from "../runtime-state.js";

export const TARGET_EVENT_TYPE = "heapsleuth:notification";

type EventListenerBenchmarkState = {
  createdInstances: number;
  handlerInvocations: number;
  retainedChecksum: number;
};

declare global {
  interface Window {
    __HEAPSLEUTH_EVENT_LISTENER_STATE__?: EventListenerBenchmarkState;
  }
}

function getBenchmarkState(): EventListenerBenchmarkState {
  window.__HEAPSLEUTH_EVENT_LISTENER_STATE__ ??= {
    createdInstances: 0,
    handlerInvocations: 0,
    retainedChecksum: 0,
  };

  return window.__HEAPSLEUTH_EVENT_LISTENER_STATE__;
}

export function EventListenerCase() {
  useEffect(() => {
    const state = getBenchmarkState();
    const instanceId = ++state.createdInstances;
    const runtimeState = getCaseRuntimeState("event-listener");
    runtimeState.createdInstances += 1;
    runtimeState.activeResources += 1;
    runtimeState.retainedResources += 1;
    const retainedPayload = createRetainedPayload(instanceId);

    const handleNotification = () => {
      state.handlerInvocations += 1;
      state.retainedChecksum =
        (state.retainedChecksum + (retainedPayload[0] ?? 0) + instanceId) %
        65_535;
      updateChecksum(runtimeState, retainedPayload, instanceId);
    };

    window.addEventListener(TARGET_EVENT_TYPE, handleNotification);

    // Intentionally no cleanup: Block 2 and the dataset use this retained
    // listener as a synthetic, benchmark-controlled signal.
  }, []);

  return (
    <section className="preview" data-heapsleuth-panel>
      <h2>Preview is open</h2>
      <p>This panel subscribes to notification updates while mounted.</p>
    </section>
  );
}
