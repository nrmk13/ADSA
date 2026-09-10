# Layout patterns

How a real page is assembled from the primitives, and what each pattern owes the
reader when it has nothing to show.

## Settings page

One column, one `Card` per group of settings, one `Field` per value.

```tsx
import { Card, Field } from "@acme/mono-ui";

<Card>
    <Field label="Display name" />
    <Field label="Reply-to address" />
</Card>;
```

| Task | Reach for |
| :-- | :-- |
| Group related settings | `Card` |
| Collect one value | `Field` |
| Confirm a destructive action | `Button` with `tone="danger"` |

### States

- **Empty** — a settings group with nothing in it is a bug, not a state. Remove
  the `Card` rather than render an empty one.
- **Loading** — render the `Card` with its heading and a skeleton line per
  field. Do not swap the whole page for a spinner: the heading is already known.
- **Error** — keep the fields on screen and put the message above them. A page
  that replaces itself with an error loses whatever the person had typed.

### Traps

- A `Field` outside a form still needs a label. Do not swap it for a bare input
  to save a line.
- Two `Card`s with no headings read as one long list. If a group cannot be
  named, it is not a group.
- `tone="danger"` is for the action that destroys something, not for the one
  that closes the dialog.

## Detail page

A heading, a summary `Card`, then the long content. The summary never scrolls
out of reach on narrow screens — it moves above the content instead of beside it.

### States

- **Empty** — show what the record would contain, in prose, and the one action
  that fills it.
- **Loading** — skeleton the summary, not the heading.
