# AKButton

The button composable. Use it for actions.

## Import

```kotlin
import com.acme.ds.AKButton
```

## Usage

```kotlin
AKButton(label = "Save changes", onClick = { })
```

### TalkBack & content description

- Sets `contentDescription` to the label via `Modifier.semantics`.
- Sets `role = Role.Button` so TalkBack announces it as a button.
- Minimum touch target is 48dp per Material guidance.
