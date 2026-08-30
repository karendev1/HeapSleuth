# Evaluation Methodology and Results

## Question

Does browser-grounded investigation plus independent verification improve
frontend memory-leak root-cause diagnosis over a source-only model prompt on the
same cases?

The frozen evaluation answers this narrow question on eight synthetic cases. It
does not claim general accuracy on arbitrary production applications.

## Compared approaches

- **Baseline:** one Gemini request receives the public case description and
  relevant source code. It receives no runtime evidence and no verifier.
- **HeapSleuth:** a deterministic browser runner collects bounded post-GC
  evidence; one Investigator request produces a diagnosis; a separate Verifier
  request accepts, revises, or marks it inconclusive.

Both approaches used `gemini-3.6-flash` through `gemini-interactions`, a
`1,200`-token output ceiling, low thinking, the same public case source, and no
model tools. Prompt versions were `baseline-v1` and
`investigator-v1+verifier-v1`.

## Dataset and isolation

The cohort contains seven known leak mechanisms and one healthy control:

| Case               | Ground-truth class |
| ------------------ | ------------------ |
| `event-listener`   | leak               |
| `interval`         | leak               |
| `resize-observer`  | leak               |
| `detached-dom`     | leak               |
| `global-cache`     | leak               |
| `closure-registry` | leak               |
| `event-bus`        | leak               |
| `healthy-control`  | no leak            |

Ground truth is stored separately from public case data. The baseline,
Investigator, and Verifier input builders cannot read the evaluator-only file.
The evaluator first freezes the active run IDs and their hashes, then loads
ground truth. It never searches archived attempts for a better answer.

The diagnosis protocol was frozen at commit `c5043e3`. The deterministic
evaluator was introduced at commit `0d35152`. The cohort manifest records
dataset SHA-256
`866b95f6193bf7e7580d2d0b8ba2b0a6062abbbbe1b30de6d390da9f3da12ea9`.

## Metrics

The primary metric is **root-cause localization accuracy (RCLA)**. A case passes
only when:

1. the leak/no-leak verdict is correct;
2. the mechanism matches an allowed ground-truth label;
3. for leak cases, the root-cause file matches an allowed location.

Secondary metrics are verdict accuracy, false-positive rate on controls,
mechanism classification accuracy, source localization accuracy on leak cases,
inconclusive rate, evidence grounding, runtime, and token usage.

Evidence grounding is a deterministic 0–3 proxy for the qualitative rubric:

- `0`: no usable evidence;
- `1`: evidence is present but required runtime categories or structured support
  are incomplete;
- `2`: required evidence categories are represented but support or limitations
  are incomplete;
- `3`: required structured evidence supports the verdict and limitations are
  acknowledged.

No LLM judge participates in scoring.

## Frozen results

| Metric                        |    Baseline |  HeapSleuth |   Change |
| ----------------------------- | ----------: | ----------: | -------: |
| RCLA                          | 3/8 (37.5%) | 5/8 (62.5%) | +25.0 pp |
| Leak verdict accuracy         |  8/8 (100%) |  8/8 (100%) |     0 pp |
| False-positive rate           |    0/1 (0%) |    0/1 (0%) |     0 pp |
| Mechanism classification      | 2/7 (28.6%) | 4/7 (57.1%) | +28.6 pp |
| Source localization           |  7/7 (100%) |  7/7 (100%) |     0 pp |
| Inconclusive rate             |    0/8 (0%) |    0/8 (0%) |     0 pp |
| Mean evidence-grounding score |        1.00 |        3.00 |    +2.00 |

Per-case RCLA:

| Case               | Baseline | HeapSleuth |
| ------------------ | -------: | ---------: |
| `event-listener`   |     pass |       pass |
| `interval`         |     pass |       pass |
| `resize-observer`  |     fail |       pass |
| `detached-dom`     |     fail |       fail |
| `global-cache`     |     fail |       fail |
| `closure-registry` |     fail |       pass |
| `event-bus`        |     fail |       fail |
| `healthy-control`  |     pass |       pass |

The complete generated table is in
[`results/summary/comparison.md`](../results/summary/comparison.md), and exact
denominators and per-case checks are in
[`comparison.json`](../results/summary/comparison.json).

## Runtime, tokens, and cost

| Measurement             |    Baseline |  HeapSleuth |    Combined |
| ----------------------- | ----------: | ----------: | ----------: |
| Summed per-case runtime |    81.189 s |   206.326 s |   287.515 s |
| Mean runtime per case   |    10.149 s |    25.791 s |         n/a |
| Input tokens            |       5,054 |      37,613 |      42,667 |
| Output tokens           |       3,633 |       5,600 |       9,233 |
| Total tokens            |       8,687 |      43,213 |      51,900 |
| Estimated list cost     | unavailable | unavailable | unavailable |
| Actual billed cost      | unavailable | unavailable | unavailable |

Runtime is the sum of recorded per-case durations rather than one uninterrupted
wall-clock batch. Human time was not recorded. Provider billing data was not
present in the validated artifacts, so the project makes no zero-cost claim.

## Frozen cohort

The canonical manifest is
[`results/summary/evaluation-cohort.json`](../results/summary/evaluation-cohort.json).
Its full cohort hash is:

```text
6c8c0f3f9fa017deb386e9b947c5a897a41dbb9d152f5157eadea6fa50980dff
```

This hash identifies the selected active run IDs and protocol metadata. Live
regeneration can yield a different cohort because provider latency and model
outputs can vary.

## What the result supports

On this cohort, runtime-grounded investigation plus verification improved the
strict combined diagnosis metric, mechanism classification, and evidence
grounding. It did not improve the already-perfect binary verdict accuracy or
source-file localization. The evidence therefore supports a measured
diagnosis-quality improvement, not a claim that browser evidence universally
improves accuracy.

## Evidence-driven iteration

The main observed failure was semantic overreach: a correct verdict and file
could still use a mechanism phrase too broad for the strict allowed label. A
candidate `verifier-v2` prompt asked the Verifier to be stricter about canonical
mechanism naming. On the same eight cases it reduced RCLA from 5/8 to 3/8,
violated the keep rule, and was removed. The unchanged v1 implementation and
frozen cohort remain active. The candidate, complete outputs, comparison,
failures, and trajectories are preserved in
[`results/iterations/verifier-v2`](../results/iterations/verifier-v2/README.md).

## Limitations

- Eight synthetic React cases are too small to estimate production-world
  accuracy.
- There is only one healthy control, so the false-positive denominator is one.
- The Investigator and Verifier are separate requests but use the same Gemini
  model family.
- The browser evidence is bounded and benchmark-instrumented; it is not a
  general heap retaining-path search.
- Absolute heap sizes vary by browser engine and environment.
- Model output is not guaranteed to reproduce byte-for-byte despite fixed
  settings.
- Monetary cost and human time are unavailable from validated metadata.
- The strict mechanism matcher can mark a semantically plausible diagnosis wrong
  when its terminology falls outside the allowed labels.

These boundaries are part of the result, not post-hoc exclusions.
