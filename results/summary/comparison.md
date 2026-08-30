# HeapSleuth Frozen MVP Evaluation

## Primary result

| Approach | RCLA | Correct cases | Runtime | Total tokens |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 37.5% | 3/8 | 81189 ms | 8687 |
| Solution | 62.5% | 5/8 | 206326 ms | 43213 |

RCLA change: 25.0% percentage-point equivalent. Primary metric improved: true.

## Secondary metrics

| Metric | Baseline | Solution | Delta |
| --- | ---: | ---: | ---: |
| Leak detection accuracy | 100.0% | 100.0% | 0.0% |
| False-positive rate | 0.0% | 0.0% | 0.0% |
| Mechanism classification accuracy | 28.6% | 57.1% | 28.6% |
| Source localization accuracy | 100.0% | 100.0% | 0.0% |
| Inconclusive-result rate | 0.0% | 0.0% | N/A |
| Mean evidence-grounding score | 1.00 | 3.00 | 2.00 |
| Mean runtime | 10148.625 ms | 25790.75 ms | N/A |
| Mean tokens with usage | 1085.875 | 5401.625 | N/A |
| Human time | N/A | N/A | N/A |
| Estimated list cost | N/A | N/A | N/A |
| Actual billed cost | N/A | N/A | N/A |

## Per-case comparison

| Case | Baseline status | Baseline verdict | Baseline mechanism | Baseline RCLA | Baseline evidence | Solution status | Solution verdict | Solution mechanism | Solution RCLA | Solution evidence |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | ---: | ---: |
| event-listener | succeeded | leak | Unremoved Event Listener | true | 1 | succeeded | leak | Unremoved window event listener on unmount | true | 3 |
| interval | succeeded | leak | Uncleared setInterval timer | true | 1 | succeeded | leak | Uncleared setInterval timer callback retaining instance state after unmount | true | 3 |
| resize-observer | succeeded | leak | uncleaned-resize-observer | false | 1 | succeeded | leak | Missing cleanup in useEffect to disconnect or unobserve the ResizeObserver instance when the component unmounts | true | 3 |
| detached-dom | succeeded | leak | Detached DOM / Global reference retention | false | 1 | succeeded | leak | Module-scoped registry retains references to detached DOM elements and binary payloads after component unmount. | false | 3 |
| global-cache | succeeded | leak | Unbounded Module-Scoped Cache Accumulation | false | 1 | succeeded | leak | Module-scope Map (`viewedItemCache`) stores retained payloads on component mount without removing them when unmounted or cleaning up via useEffect. | false | 3 |
| closure-registry | succeeded | leak | Uncleaned module-scoped closure array | false | 1 | succeeded | leak | Module-scope callback registry retains closures and payloads across component unmounts without cleanup | true | 3 |
| event-bus | succeeded | leak | Missing event subscriber cleanup on component unmount | false | 1 | succeeded | leak | Module-scope subscriber set retains event listener callbacks and payload closures indefinitely after component unmount due to missing cleanup in useEffect. | false | 3 |
| healthy-control | succeeded | no-leak | N/A | true | 1 | succeeded | no-leak | N/A | true | 3 |

## Method boundaries

- The eight cases are synthetic and do not establish performance on arbitrary production applications.
- The Investigator and Verifier use separate requests to the same Gemini model family.
- Human time and monetary cost are unavailable; runtime and token usage are reported directly from metadata.
- Evidence grounding uses a conservative deterministic proxy for the qualitative rubric.

The cohort hash is `6c8c0f3f9fa017deb386e9b947c5a897a41dbb9d152f5157eadea6fa50980dff`. Detailed machine-readable values and denominators are available in `comparison.json`.
