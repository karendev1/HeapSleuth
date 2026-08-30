# global-cache: baseline evaluation

## Outcome

| Field | Value |
| --- | --- |
| Run ID | b82c04a6-169b-4f53-a6c5-b1cc3bcc9e95 |
| Status | succeeded |
| Observed verdict | leak |
| Observed mechanism | Unbounded Module-Scoped Cache Accumulation |
| Root-cause file | benchmark/src/cases/GlobalCacheCase.tsx |
| Root-cause symbol | viewedItemCache |
| Verdict correct | true |
| Mechanism correct | false |
| Localization correct | true |
| RCLA correct | false |
| Evidence-grounding score | 1/3 |
| Runtime | 11841 ms |
| Total tokens | 1057 |
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
