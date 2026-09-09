# Button

The button component. Use it for actions.

## Import

```tsx
import { Button } from "@acme/native-ui/button";
```

## Usage

```tsx
<Button label="Save changes" variant="primary" />
```

### VoiceOver & TalkBack

- Renders as a `Pressable` with `accessibilityRole="button"`.
- `accessibilityLabel` is required — without it the control answers to nothing.
- Minimum touch target is 44x44pt (iOS) / 48x48dp (Android).
