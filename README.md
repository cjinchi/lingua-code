# Lingua Code

**Lingua Code** is a VS Code extension that lets you describe code changes in natural language using `LINGUA_BLOCK` markers, then process them with [Claude Code](https://docs.anthropic.com/en/docs/claude-code)'s `/lingua` command.

## How It Works

1. **Insert a block** — Use `Cmd+Alt+T` (Mac) or `Ctrl+Alt+T` (Windows/Linux) to insert a `LINGUA_BLOCK` at your cursor position.
2. **Describe what you want** — Write your request in natural language between the markers.
3. **Run `/lingua`** — Execute the `/lingua` command in Claude Code to process all blocks across your project.

Claude Code will read each block, understand the surrounding code context, remove the markers, and implement what you described.

## Features

- **Insert blocks** with a keyboard shortcut or command palette
- **Sidebar panel** showing all `LINGUA_BLOCK`s across your workspace, with list and tree views
- **Click to navigate** — Jump to any block from the sidebar
- **Visual highlighting** — Blocks are visually highlighted in the editor with CodeLens actions
- **One-click `/lingua` command installation** — Install or update the Claude Code command from the sidebar

## Example

```python
def calculate_total(items):
    # __LINGUA_BLOCK_START__
    # Calculate the total price with tax (8.5%) and apply a 10% discount for orders over $100
    # __LINGUA_BLOCK_END__
    pass
```

After running `/lingua`, Claude Code will replace the block with a working implementation.

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| **Insert TODO Block** | `Cmd+Alt+T` | Insert a new `LINGUA_BLOCK` at cursor |
| **Delete TODO Block** | — | Delete a block via CodeLens |
| **Refresh Blocks** | — | Refresh the blocks sidebar |
| **Install /lingua Command** | — | Install the Claude Code command |

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and configured

## License

MIT
