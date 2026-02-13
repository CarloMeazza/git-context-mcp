# Git MCP Server

A lightweight Model Context Protocol (MCP) server for local Git operations.

<!-- testing commit functionality -->

## Available Tools

- `git_clone`: Clone a Git repository.
- `git_list_branches`: List local and remote branches.
- `git_checkout`: Switch between branches.
- `git_list_files`: List files in the repository.
- `git_read_file`: Read the content of a file.
- `git_pull`: Pull changes from remote (uses rebase).
- `git_commit`: Commit changes to the repository.

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
