# HeapSleuth Frozen MVP Evaluation

## Primary result

| Approach | RCLA | Correct cases | Runtime | Total tokens |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 37.5% | 3/8 | 81189 ms | 8687 |
| Solution | 37.5% | 3/8 | 410551 ms | 34129 |

RCLA change: 0.0% percentage-point equivalent. Primary metric improved: false.

## Secondary metrics

| Metric | Baseline | Solution | Delta |
| --- | ---: | ---: | ---: |
| Leak detection accuracy | 100.0% | 62.5% | -37.5% |
| False-positive rate | 0.0% | 0.0% | 0.0% |
| Mechanism classification accuracy | 28.6% | 28.6% | 0.0% |
| Source localization accuracy | 100.0% | 57.1% | -42.9% |
| Inconclusive-result rate | 0.0% | 0.0% | N/A |
| Mean evidence-grounding score | 1.00 | 1.88 | 0.88 |
| Mean runtime | 10148.625 ms | 51318.875 ms | N/A |
| Mean tokens with usage | 1085.875 | 4875.571428571428 | N/A |
| Human time | N/A | N/A | N/A |
| Estimated list cost | N/A | N/A | N/A |
| Actual billed cost | N/A | N/A | N/A |

## Per-case comparison

| Case | Baseline status | Baseline verdict | Baseline mechanism | Baseline RCLA | Baseline evidence | Solution status | Solution verdict | Solution mechanism | Solution RCLA | Solution evidence |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | ---: | ---: |
| event-listener | succeeded | leak | Unremoved Event Listener | true | 1 | succeeded | leak | Uncleaned global event listener attached to window in useEffect hook upon component unmount | true | 3 |
| interval | succeeded | leak | Uncleared setInterval timer | true | 1 | succeeded | leak | Uncleared setInterval callback retaining component payload and closure state after unmount | true | 3 |
| resize-observer | succeeded | leak | uncleaned-resize-observer | false | 1 | failed | N/A | N/A | false | 0 |
| detached-dom | succeeded | leak | Detached DOM / Global reference retention | false | 1 | succeeded | leak | Global module-level array retaining detached DOM elements and associated payloads after component unmount | false | 3 |
| global-cache | succeeded | leak | Unbounded Module-Scoped Cache Accumulation | false | 1 | succeeded | leak | Unbounded module-scoped Map cache retains allocated payloads across component mount/unmount cycles without eviction or cleanup. | false | 3 |
| closure-registry | succeeded | leak | Uncleaned module-scoped closure array | false | 1 | failed | N/A | N/A | false | 0 |
| event-bus | succeeded | leak | Missing event subscriber cleanup on component unmount | false | 1 | failed | N/A | N/A | false | 0 |
| healthy-control | succeeded | no-leak | N/A | true | 1 | succeeded | no-leak | N/A | true | 3 |

## Method boundaries

- The eight cases are synthetic and do not establish performance on arbitrary production applications.
- The Investigator and Verifier use separate requests to the same Gemini model family.
- Human time and monetary cost are unavailable; runtime and token usage are reported directly from metadata.
- Evidence grounding uses a conservative deterministic proxy for the qualitative rubric.

The cohort hash is `f997b454ca63b4f6952eb0fa2227683ad078b0705c8a15bd268310e1e49fccaf`. Detailed machine-readable values and denominators are available in `comparison.json`.
