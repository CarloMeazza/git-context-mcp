# Git MCP Server

A lightweight Model Context Protocol (MCP) server for local Git operations.

## Available Tools

- `git_clone`: Clone a Git repository.
- `git_status`: Get the status of the repository.
- `git_diff`: Get the diff of the repository (supports staged files).
- `git_list_branches`: List local and remote branches.
- `git_checkout`: Switch between branches and update files.
- `git_list_files`: List files in the repository.
- `git_read_file`: Read the content of a file.
- `git_add`: Add files to the staging area.
- `git_reset`: Reset current HEAD to the specified state (supports soft, mixed, hard).
- `git_pull`: Pull changes from remote (uses rebase).
- `git_commit`: Commit changes to the repository.
- `git_push`: Push changes to remote (automatically performs `pull --rebase` first).
- `git_log`: Get the commit log of the repository.

## Setup

1.  **Install dependencies**:

    ```bash
    npm install
    ```

2.  **Build**:

    ```bash
    npm run build
    ```

3.  **Run**:
    ```bash
    npm run start
    ```

## Configuration

```json
{
  "mcpServers": {
    "git-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/code-context-mcp/dist/index.js"]
    }
  }
}
```

## Prerequisites

- Node.js
- Git
