# detached-dom: baseline evaluation

## Outcome

| Field | Value |
| --- | --- |
| Run ID | 0f3c70c1-12fb-4a58-be24-e133f285b6bb |
| Status | succeeded |
| Observed verdict | leak |
| Observed mechanism | Detached DOM / Global reference retention |
| Root-cause file | benchmark/src/cases/DetachedDomCase.tsx |
| Root-cause symbol | artifactRegistry |
| Verdict correct | true |
| Mechanism correct | false |
| Localization correct | true |
| RCLA correct | false |
| Evidence-grounding score | 1/3 |
| Runtime | 16864 ms |
| Total tokens | 1182 |
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

- Analysis relies solely on static source code inspection without runtime heap snapshot measurements.
- Human time and monetary cost are unavailable from validated run artifacts.
- The baseline receives source code only, so runtime evidence categories are not represented.

This report is generated deterministically from the validated metrics JSON. It does not expose evaluator notes or accepted-answer lists.
