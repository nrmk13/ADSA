# Agents

<!-- adsa:start -->
## Design system: @acme/ui 1.4.0

This project uses @acme/ui. Before writing any UI:

- Find the component first: run `npx adsa search "<what you need>"`, then `npx adsa docs <component>`. Do not read `node_modules` types and do not
  reach for habits from shadcn, MUI or Radix — this system has its own names.
- Import per component: `import { Badge } from "@acme/ui/badge"`. Never from the package root.
- Colour, spacing, radius and typography come from the system's tokens. Raw palette
  classes (`bg-gray-100`, `text-blue-600`) and raw hex values are not allowed in product code.
- Icons come only from the system's icon set. No second icon library, no local
  `components/ui` folder, no copied component source.
- **If the component you need does not exist, stop and ask.** Do not invent a
  wrapper, do not approximate it with a div, and do not silently pick the nearest
  thing. Known absences and what to use instead are listed in GAPS.md.
- Before you call the work done: your project's type check and lint must pass.
<!-- adsa:end -->
