# event-bus: solution evaluation

## Outcome

| Field | Value |
| --- | --- |
| Run ID | 8f59f6a1-f033-4b5d-ad94-4c9aab3beda8 |
| Status | succeeded |
| Observed verdict | leak |
| Observed mechanism | Module-scope subscriber set retains event listener callbacks and payload closures indefinitely after component unmount due to missing cleanup in useEffect. |
| Root-cause file | benchmark/src/cases/EventBusCase.tsx |
| Root-cause symbol | EventBusCase |
| Verdict correct | true |
| Mechanism correct | false |
| Localization correct | true |
| RCLA correct | false |
| Evidence-grounding score | 3/3 |
| Runtime | 83353 ms |
| Total tokens | 5254 |
| Human time | N/A |
| Estimated list cost | N/A |
| Actual billed cost | N/A |
| Failure category | N/A |
| Failure stage | N/A |

## Evidence-grounding assessment

Required structured evidence supports the verdict and limitations are acknowledged.

- Required categories represented: 2/2
- Structured evidence supports the verdict: true
- Limitations acknowledged: true

## Limitations

- The evidence comes from a synthetic benchmark-controlled scenario, not an arbitrary production application.
- Heap-size deltas are engine-sensitive and must not be treated as leak proof without a retained post-GC signal.
- The bounded listener summary inspects listeners attached to window and does not replace a full heap snapshot or arbitrary retaining-path search.
- Human time and monetary cost are unavailable from validated run artifacts.

This report is generated deterministically from the validated metrics JSON. It does not expose evaluator notes or accepted-answer lists.
