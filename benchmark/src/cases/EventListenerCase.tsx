import { useEffect } from "react";

export const TARGET_EVENT_TYPE = "heapsleuth:notification";
const RETAINED_PAYLOAD_BYTES = 256 * 1024;

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
    const retainedPayload = new Uint8Array(RETAINED_PAYLOAD_BYTES);
    retainedPayload[0] = instanceId % 256;

    const handleNotification = () => {
      state.handlerInvocations += 1;
      state.retainedChecksum =
        (state.retainedChecksum + (retainedPayload[0] ?? 0) + instanceId) %
        65_535;
    };

    window.addEventListener(TARGET_EVENT_TYPE, handleNotification);

    // Intentionally no cleanup: this is the single synthetic leak used by the
    // Block 2 evidence spike.
  }, []);

  return (
    <section className="preview" data-heapsleuth-panel>
      <h2>Preview is open</h2>
      <p>This panel subscribes to notification updates while mounted.</p>
    </section>
  );
}
