# Button

The one thing a person clicks to commit to something.

```tsx
import { Button } from "@acme/mono-ui";

<Button tone="danger">Delete workspace</Button>;
```

| Prop | Type | Default |
| :-- | :-- | :-- |
| `tone` | `"neutral" \| "danger"` | `"neutral"` |

## Keyboard

Enter and Space activate. The button keeps its focus ring at every tone; do not
remove the outline to make a row look tidier.
