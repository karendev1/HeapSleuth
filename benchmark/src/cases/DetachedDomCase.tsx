import { useEffect } from "react";

import {
  createRetainedPayload,
  getCaseRuntimeState,
} from "../runtime-state.js";

const artifactRegistry: Array<{
  element: HTMLElement;
  payload: Uint8Array;
}> = [];

export function DetachedDomCase() {
  useEffect(() => {
    const state = getCaseRuntimeState("detached-dom");
    const instanceId = ++state.createdInstances;
    const payload = createRetainedPayload(instanceId);
    const artifact = document.createElement("article");
    artifact.dataset.heapsleuthArtifact = String(instanceId);
    artifact.textContent = `Prepared details ${instanceId}`;
    artifact.hidden = true;
    document.body.append(artifact);
    artifactRegistry.push({ element: artifact, payload });
    state.activeResources += 1;
    state.retainedResources = artifactRegistry.length;

    return () => {
      artifact.remove();
    };
  }, []);

  return (
    <section className="preview" data-heapsleuth-panel>
      <h2>Details panel is open</h2>
      <p>The panel prepares a temporary details artifact for display.</p>
    </section>
  );
}
