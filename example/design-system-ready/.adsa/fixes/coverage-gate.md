# Fix: fail CI on an undocumented export

**Dimension:** Docs coverage · **Size:** S · **Repo:** @acme/ui

Coverage that nothing enforces goes down with every release. One gate keeps it.

## What to build

A check that lists what a consumer can import and asserts each has a guide in
`guidelines`. Package `exports` subpaths are the reliable source of that list;
fall back to exported component symbols if the package ships one entry point.

1. Set aside icon and logo sets — nobody writes a guide per icon — and print how
   many were set aside so the number is not a surprise.
2. Allow an explicit allowlist file for exports that genuinely need no guide
   (sub-parts documented inside a parent guide), with a reason per entry.
3. Fail with the list of undocumented exports, not just a count.
4. Wire it into the same CI job as the other documentation checks.

## Done when

- A new exported component with no guide turns the build red.
- The allowlist is short and every entry has a reason.
