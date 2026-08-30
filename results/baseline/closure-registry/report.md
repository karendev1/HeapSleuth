# closure-registry: baseline evaluation

## Outcome

| Field | Value |
| --- | --- |
| Run ID | 90a17e11-eb05-4e83-88fb-072f2864f051 |
| Status | succeeded |
| Observed verdict | leak |
| Observed mechanism | Uncleaned module-scoped closure array |
| Root-cause file | benchmark/src/cases/ClosureRegistryCase.tsx |
| Root-cause symbol | ClosureRegistryCase |
| Verdict correct | true |
| Mechanism correct | false |
| Localization correct | true |
| RCLA correct | false |
| Evidence-grounding score | 1/3 |
| Runtime | 3156 ms |
| Total tokens | 1026 |
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

- Static source code review performed without runtime heap profiling.
- Human time and monetary cost are unavailable from validated run artifacts.
- The baseline receives source code only, so runtime evidence categories are not represented.

This report is generated deterministically from the validated metrics JSON. It does not expose evaluator notes or accepted-answer lists.
