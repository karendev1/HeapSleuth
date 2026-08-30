# HeapSleuth Verifier v2 Candidate

This rejected candidate added the following policy to the version 1 Verifier
prompt after the existing skeptical evidence checks and before its decision
rules:

## Mechanism precision

- For a supported `leak` verdict, check that the mechanism explicitly
  distinguishes the retained resource or relationship, the retaining owner or
  scope, and the lifecycle cleanup failure or unbounded growth behavior when
  those dimensions are visible in the supplied source and runtime evidence.
- Use concrete frontend memory terminology. Relevant resource categories may
  include timers, observers, subscriptions, callbacks, DOM subtrees, and
  collections. Relevant owners may include browser targets, schedulers,
  JavaScript references, registries, and global or module scope.
- Do not infer a dimension that the supplied evidence does not support. Mark
  the result inconclusive when a precise mechanism cannot be grounded.
- If the verdict and source location are supported but the stated mechanism
  materially omits a supported resource, owner, cleanup, or growth dimension,
  return `revise` with a complete, precise diagnosis instead of `accept`.

The runtime prompt version was `verifier-v2`. The policy was removed because it
did not satisfy the predefined aggregate or attribution criteria.
