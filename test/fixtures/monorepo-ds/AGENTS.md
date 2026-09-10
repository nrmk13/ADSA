# Working in this repository

Every component in `@acme/mono-ui` has a guide next to it, at
`packages/core/src/<Component>/<Component>.spec.md`. Read the guide before you
write the component in.

## Looking something up

```sh
pnpm acme docs Button
```

## Rules

- Import from the package root: `import { Button } from "@acme/mono-ui"`.
- Colour, spacing and motion come from the theme tokens. Never a raw hex.
- Never install another component library alongside this one.
- Before you finish, `pnpm test` and `pnpm lint` must pass.
- If the system does not have the thing you need, stop and ask. Do not invent a
  component.
