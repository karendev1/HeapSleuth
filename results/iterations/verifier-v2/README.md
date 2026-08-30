# Removed Verifier v2 Experiment

Status: removed after the predefined keep criteria failed.

This directory preserves the complete Block 8 mechanism-precision experiment.
The candidate changed only the Verifier prompt and version expectation. It did
not change the Investigator, benchmark, browser evidence, model, provider
settings, ground truth, schemas, or deterministic scoring rule.

The integrated eight-case iteration completed five cases and preserved three
provider failures. RCLA was 3/8, compared with 5/8 for the active Block 7
solution. Mechanism classification was 2/7, compared with 4/7. The completed
target cases did not produce a Verifier revision attributable to the candidate
policy, so the change failed both the aggregate and attribution criteria.

Contents:

- `candidate-verifier-v2.md`: the rejected prompt candidate;
- `solution/`: validated per-case raw and evaluated artifacts;
- `trajectories/`: the eight iteration trajectories;
- `summary/`: the frozen cohort, machine-readable comparison, rendered report,
  and changelog evidence.

The archived cohort manifest retains the repository-relative artifact paths
that were active when it was hashed and scored. The corresponding files are
mirrored below this directory using the same `solution/<case-id>/` and
`trajectories/<case-id>/` suffixes. The active `results/solution/` and
`results/summary/` trees were restored to Block 7 after this snapshot was made.

No API credential or environment file is included.
