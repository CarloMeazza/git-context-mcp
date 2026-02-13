# Git MCP Server

A Model Context Protocol (MCP) server for local Git operations with security and validation.

## Features

- 🔒 **Secure**: Path traversal protection and input validation
- ✅ **Validated**: Runtime Zod validation for all inputs
- ⏱️ **Timeout Protection**: Configurable timeouts prevent indefinite blocking
- 🛠️ **Complete**: 15 Git operations supported
- 📝 **Well-tested**: Comprehensive integration test suite

## Available Tools

- `git_clone`: Clone a Git repository
- `git_status`: Get the status of the repository
- `git_diff`: Get the diff of the repository (supports staged files)
- `git_list_branches`: List local and remote branches
- `git_checkout`: Switch between branches and update files
- `git_list_files`: List files in the repository
- `git_read_file`: Read the content of a file (with path traversal protection)
- `git_add`: Add files to the staging area
- `git_reset`: Reset current HEAD to the specified state (supports soft, mixed, hard)
- `git_pull`: Pull changes from remote (uses rebase)
- `git_commit`: Commit changes to the repository
- `git_push`: Push changes to remote (automatically performs `pull --rebase` first)
- `git_log`: Get the commit log of the repository
- `git_create_branch`: Create a new branch (optionally from a specific starting point)
- `git_merge`: Merge a branch into the current branch (supports `--no-ff`)

## Setup

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Build**:

   ```bash
   npm run build
   ```

3. **Run**:

   ```bash
   npm run start
   ```

## Configuration Examples

### Claude Desktop

```json
{
  "mcpServers": {
    "git-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/git-context-mcp/dist/index.js"]
    }
  }
}
```

### Cline / Windsurf

```json
{
  "mcpServers": {
    "git-mcp-server": {
      "command": "npx",
      "args": ["-y", "git-mcp-server"]
    }
  }
}
```

## Usage Examples

### Clone a Repository

```json
{
  "tool": "git_clone",
  "arguments": {
    "repoUrl": "https://github.com/user/repo.git",
    "localPath": "/path/to/local/repo"
  }
}
```

### Read a File

```json
{
  "tool": "git_read_file",
  "arguments": {
    "repoPath": "/path/to/repo",
    "filePath": "src/index.ts"
  }
}
```

### Create and Checkout a Branch

```json
{
  "tool": "git_create_branch",
  "arguments": {
    "repoPath": "/path/to/repo",
    "branch": "feature/new-feature",
    "checkout": true
  }
}
```

## Security

- **Path Traversal Protection**: File paths are validated to prevent access outside the repository
- **Input Validation**: All inputs are validated with Zod schemas before processing
- **Error Handling**: Proper error context preservation throughout the stack
- **Timeout Protection**: Operations have configurable timeouts (30s default, 60s for clone)

## Testing

Run the integration test suite to verify all Git tools work correctly:

```bash
npx tsx test_script.ts
```

The script creates temporary local repositories, exercises all 15 tools plus error handling scenarios, and cleans up automatically.

## Troubleshooting

### Error: "Path does not exist"

Ensure the repository path exists and is accessible.

### Error: "File path must be within the repository"

The requested file path is outside the repository boundaries. This is a security feature to prevent directory traversal attacks.

### Timeout errors

Operations have a 30-second timeout by default (60 seconds for clone). For very large repositories or slow networks, operations may timeout. This is a safety feature to prevent indefinite blocking.

### Error: "Git pull --rebase failed"

The rebase was automatically aborted to restore the repository to a clean state. Check for uncommitted changes or conflicts.

## Development

### Running Tests

```bash
npx tsx test_script.ts
```

### Building

```bash
npm run build
```

### Watching for Changes

```bash
npm run watch
```

## Prerequisites

- Node.js 18+
- Git

## License

MIT
