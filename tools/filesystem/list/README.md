# filesystem.list

## Purpose
Lists files and directories in a given path.

## Workflow
- Windows: `Get-ChildItem -Force -LiteralPath {{path}}`

## Permissions
- `ShellExecution`

## Limitations
- Cannot list files the user doesn't have permission to access
- Symlinks shown but not followed

## Examples
- "Show me all the files here"
- "List files in ~/Documents"
- "What's in this folder?"
