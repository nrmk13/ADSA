# What this system does not have

An agent cannot tell "this does not exist" from "I have not found it yet", so it
invents a component and moves on. This file is the difference between those two.

Keep it short and current. Every row is a decision, not a backlog item.

| What is missing | Use instead | Why / status |
| :-- | :-- | :-- |
| _example:_ Date range picker | Two `DatePicker` fields with a shared label | Planned, no owner yet |
| _example:_ Toast / snackbar | The host application's notification layer | Deliberate: lives outside the system |

## Reporting a new gap

If you hit something that is not in this list and not in the system, add a row
here in the same change. Do not put it only in a ticket or a chat message: the next
agent reads this file, not your inbox.
