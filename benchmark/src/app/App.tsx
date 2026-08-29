import { useState } from "react";

import { EventListenerCase } from "../cases/EventListenerCase.js";

const EVENT_LISTENER_ROUTE = "/cases/event-listener";

export function App() {
  const [isMounted, setIsMounted] = useState(false);

  if (window.location.pathname !== EVENT_LISTENER_ROUTE) {
    return (
      <main className="benchmark-shell">
        <h1>HeapSleuth benchmark</h1>
        <p>Unknown benchmark route.</p>
      </main>
    );
  }

  return (
    <main className="benchmark-shell" data-heapsleuth-ready="true">
      <p className="eyebrow">HeapSleuth browser evidence spike</p>
      <h1>Notification preview</h1>
      <p>
        Repeatedly open and close the preview to exercise the deterministic
        benchmark scenario.
      </p>
      <button
        data-heapsleuth-toggle
        type="button"
        onClick={() => setIsMounted((current) => !current)}
      >
        {isMounted ? "Close preview" : "Open preview"}
      </button>
      {isMounted ? <EventListenerCase /> : null}
    </main>
  );
}
