export type CaseRuntimeState = {
  createdInstances: number;
  activeResources: number;
  retainedResources: number;
  releasedResources: number;
  invocations: number;
  checksum: number;
};

declare global {
  interface Window {
    __HEAPSLEUTH_CASE_STATE__?: Record<string, CaseRuntimeState>;
  }
}

export function getCaseRuntimeState(caseId: string): CaseRuntimeState {
  window.__HEAPSLEUTH_CASE_STATE__ ??= {};
  window.__HEAPSLEUTH_CASE_STATE__[caseId] ??= {
    createdInstances: 0,
    activeResources: 0,
    retainedResources: 0,
    releasedResources: 0,
    invocations: 0,
    checksum: 0,
  };

  return window.__HEAPSLEUTH_CASE_STATE__[caseId];
}

export function createRetainedPayload(instanceId: number): Uint8Array {
  const payload = new Uint8Array(256 * 1024);
  payload[0] = instanceId % 256;
  return payload;
}

export function updateChecksum(
  state: CaseRuntimeState,
  payload: Uint8Array,
  instanceId: number,
): void {
  state.invocations += 1;
  state.checksum = (state.checksum + (payload[0] ?? 0) + instanceId) % 65_535;
}
