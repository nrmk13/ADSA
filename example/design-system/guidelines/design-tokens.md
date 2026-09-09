# Design tokens

Tables, not prose. An agent copies from a table and guesses from a paragraph.

## Colour

| Token | Class | Use for |
| :-- | :-- | :-- |
| `--color-bg-primary` | `bg-primary` | Default page and card background |
| _add the rest of your semantic tokens_ | | |

## Spacing

| Token | Value | Use for |
| :-- | :-- | :-- |
| `--spacing-2` | 8px | Gap inside a control |
| _add your scale_ | | |

## Motion

| Token | Value | Use for |
| :-- | :-- | :-- |
| `--duration-fast` | 100ms | Hover, focus ring, colour changes |
| `--duration-base` | 200ms | Toggles, small reveals, tooltips |
| `--duration-slow` | 300ms | Drawers, modals, layout shifts |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Anything entering or moving |

## Rules

- Product code uses the token classes, never the raw palette.
- A value that is not in these tables is a gap: add it here or ask, do not inline it.
