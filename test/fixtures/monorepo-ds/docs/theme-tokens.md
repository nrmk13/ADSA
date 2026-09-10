# Theme tokens

Colour, spacing and motion are named decisions. Read them from the theme; never
write a raw value into a component.

## Colour

| Token | Use |
| :-- | :-- |
| `--acme-surface` | Card and sheet backgrounds |
| `--acme-ink` | Body text |

## Spacing

A four-step space scale: `--acme-space-1` through `--acme-space-4`. Nothing in
between; if a gap needs a fifth step, the layout is wrong.

## Motion

| Token | Duration | Easing |
| :-- | :-- | :-- |
| `--acme-motion-fast` | 120ms | standard |
| `--acme-motion-slow` | 240ms | emphasised |
