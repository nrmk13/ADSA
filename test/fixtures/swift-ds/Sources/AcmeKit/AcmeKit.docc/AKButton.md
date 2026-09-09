# AKButton

The button view. Use it for actions.

## Import

```swift
import AcmeKit
```

## Usage

```swift
AKButton(title: "Save changes", style: .primary)
```

### VoiceOver & Dynamic Type

- Carries `.accessibilityLabel` matching the title automatically.
- Adds the `.isButton` trait so VoiceOver announces it as a button.
- Uses the system `Text` style, so it respects Dynamic Type out of the box.
