# Button

The button component. Use it for actions.

## Import

```tsx
import { Button } from "@acme/ui/button";
```

## Usage

```tsx
<Button color="primary" size="md">Save changes</Button>
```

For a row of buttons, use the button group:

```tsx
import { ButtonGroup } from "@acme/ui/button";

<ButtonGroup>
    <Button color="secondary" className="bg-gray-100 text-blue-600">Cancel</Button>
    <Button color="primary">Save</Button>
</ButtonGroup>
```

Buttons come in three colors and three sizes. The primary color should be used for
the main action on a page, and there should only be one of those per screen.
