# event-listener: baseline evaluation

## Outcome

| Field | Value |
| --- | --- |
| Run ID | 97d4dd08-64e4-4cd7-9714-10d7b984d9af |
| Status | succeeded |
| Observed verdict | leak |
| Observed mechanism | Unremoved Event Listener |
| Root-cause file | benchmark/src/cases/EventListenerCase.tsx |
| Root-cause symbol | EventListenerCase |
| Verdict correct | true |
| Mechanism correct | true |
| Localization correct | true |
| RCLA correct | true |
| Evidence-grounding score | 1/3 |
| Runtime | 6186 ms |
| Total tokens | 1234 |
| Human time | N/A |
| Estimated list cost | N/A |
| Actual billed cost | N/A |
| Failure category | N/A |
| Failure stage | N/A |

## Evidence-grounding assessment

Evidence is present, but the required runtime category or structured support is incomplete.

- Required categories represented: 0/2
- Structured evidence supports the verdict: false
- Limitations acknowledged: false

## Limitations

- Human time and monetary cost are unavailable from validated run artifacts.
- The baseline receives source code only, so runtime evidence categories are not represented.

This report is generated deterministically from the validated metrics JSON. It does not expose evaluator notes or accepted-answer lists.
