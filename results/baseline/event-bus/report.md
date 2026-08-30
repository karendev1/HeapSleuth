# event-bus: baseline evaluation

## Outcome

| Field | Value |
| --- | --- |
| Run ID | bb2df9bc-cd2a-4ced-a03c-078a39faf166 |
| Status | succeeded |
| Observed verdict | leak |
| Observed mechanism | Missing event subscriber cleanup on component unmount |
| Root-cause file | benchmark/src/cases/EventBusCase.tsx |
| Root-cause symbol | EventBusCase |
| Verdict correct | true |
| Mechanism correct | false |
| Localization correct | true |
| RCLA correct | false |
| Evidence-grounding score | 1/3 |
| Runtime | 32183 ms |
| Total tokens | 1183 |
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

- Static analysis performed without runtime heap snapshot measurements.
- Human time and monetary cost are unavailable from validated run artifacts.
- The baseline receives source code only, so runtime evidence categories are not represented.

This report is generated deterministically from the validated metrics JSON. It does not expose evaluator notes or accepted-answer lists.
