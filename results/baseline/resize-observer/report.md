# resize-observer: baseline evaluation

## Outcome

| Field | Value |
| --- | --- |
| Run ID | bf7bc7d2-f31f-4f00-ae05-ea4fd43692d8 |
| Status | succeeded |
| Observed verdict | leak |
| Observed mechanism | uncleaned-resize-observer |
| Root-cause file | benchmark/src/cases/ResizeObserverCase.tsx |
| Root-cause symbol | ResizeObserverCase |
| Verdict correct | true |
| Mechanism correct | false |
| Localization correct | true |
| RCLA correct | false |
| Evidence-grounding score | 1/3 |
| Runtime | 3978 ms |
| Total tokens | 1025 |
| Human time | N/A |
| Estimated list cost | N/A |
| Actual billed cost | N/A |
| Failure category | N/A |
| Failure stage | N/A |

## Evidence-grounding assessment

Evidence is present, but the required runtime category or structured support is incomplete.

- Required categories represented: 0/2
- Structured evidence supports the verdict: false
- Limitations acknowledged: true

## Limitations

- Static code review without runtime heap snapshot analysis.
- Human time and monetary cost are unavailable from validated run artifacts.
- The baseline receives source code only, so runtime evidence categories are not represented.

This report is generated deterministically from the validated metrics JSON. It does not expose evaluator notes or accepted-answer lists.
