#!/usr/bin/env node

/**
 * @module index
 * @description Entry point for the Git MCP Server.
 *
 * Bootstraps a {@link https://modelcontextprotocol.io Model Context Protocol}
 * server that exposes a suite of local Git operations (clone, commit, push,
 * diff, etc.) over stdio transport. Each operation is registered as an MCP
 * tool with a Zod-validated input schema.
 *
 * @license MIT
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  GitTools,
  GitCloneSchema,
  GitListBranchesSchema,
  GitCheckoutSchema,
  GitListFilesSchema,
  GitReadFileSchema,
  GitPullSchema,
  GitCommitSchema,
  GitStatusSchema,
  GitDiffSchema,
  GitPushSchema,
  GitAddSchema,
  GitResetSchema,
  GitLogSchema,
  GitCreateBranchSchema,
  GitMergeSchema,
} from "./tools/gitTools.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Tool Registry
// ---------------------------------------------------------------------------

/**
 * Canonical identifiers for every Git tool exposed by this server.
 * These names are sent to MCP clients during `tools/list` handshake.
 */
enum ToolName {
  GIT_CLONE = "git_clone",
  GIT_LIST_BRANCHES = "git_list_branches",
  GIT_CHECKOUT = "git_checkout",
  GIT_LIST_FILES = "git_list_files",
  GIT_READ_FILE = "git_read_file",
  GIT_PULL = "git_pull",
  GIT_COMMIT = "git_commit",
  GIT_STATUS = "git_status",
  GIT_DIFF = "git_diff",
  GIT_PUSH = "git_push",
  GIT_ADD = "git_add",
  GIT_RESET = "git_reset",
  GIT_LOG = "git_log",
  GIT_CREATE_BRANCH = "git_create_branch",
  GIT_MERGE = "git_merge",
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

/**
 * MCP server that bridges MCP tool calls to local Git operations.
 *
 * Lifecycle:
 * 1. The constructor creates the MCP {@link Server} instance and registers
 *    tool definitions + call handlers.
 * 2. {@link run} connects the server to a stdio transport and begins
 *    processing requests.
 */
class CodeContextServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "git-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();

    // Global error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Registers the `tools/list` and `tools/call` request handlers with
   * the MCP server.
   *
   * - **tools/list** – returns the full catalogue of available Git tools
   *   together with their Zod-derived JSON schemas.
   * - **tools/call** – dispatches incoming tool calls to the corresponding
   *   {@link GitTools} static method.
   */
  private setupToolHandlers() {
    // ── tools/list ────────────────────────────────────────────────────
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: ToolName.GIT_CLONE,
          description: "Clone a Git repository to a local path",
          inputSchema: zodToJsonSchema(GitCloneSchema),
        },
        {
          name: ToolName.GIT_LIST_BRANCHES,
          description: "List branches in a local Git repository",
          inputSchema: zodToJsonSchema(GitListBranchesSchema),
        },
        {
          name: ToolName.GIT_CHECKOUT,
          description: "Checkout a branch in a local Git repository",
          inputSchema: zodToJsonSchema(GitCheckoutSchema),
        },
        {
          name: ToolName.GIT_LIST_FILES,
          description: "List files in a local Git repository",
          inputSchema: zodToJsonSchema(GitListFilesSchema),
        },
        {
          name: ToolName.GIT_READ_FILE,
          description: "Read the content of a file in a local Git repository",
          inputSchema: zodToJsonSchema(GitReadFileSchema),
        },
        {
          name: ToolName.GIT_PULL,
          description: "Pull changes from remote using rebase (mandatory)",
          inputSchema: zodToJsonSchema(GitPullSchema),
        },
        {
          name: ToolName.GIT_COMMIT,
          description: "Commit changes to the repository",
          inputSchema: zodToJsonSchema(GitCommitSchema),
        },
        {
          name: ToolName.GIT_STATUS,
          description: "Get the status of the repository",
          inputSchema: zodToJsonSchema(GitStatusSchema),
        },
        {
          name: ToolName.GIT_DIFF,
          description: "Get the diff of the repository",
          inputSchema: zodToJsonSchema(GitDiffSchema),
        },
        {
          name: ToolName.GIT_PUSH,
          description:
            "Push changes to remote (automatically performs pull --rebase first)",
          inputSchema: zodToJsonSchema(GitPushSchema),
        },
        {
          name: ToolName.GIT_ADD,
          description: "Add files to staging area",
          inputSchema: zodToJsonSchema(GitAddSchema),
        },
        {
          name: ToolName.GIT_RESET,
          description: "Reset the repository",
          inputSchema: zodToJsonSchema(GitResetSchema),
        },
        {
          name: ToolName.GIT_LOG,
          description: "Get the commit log of the repository",
          inputSchema: zodToJsonSchema(GitLogSchema),
        },
        {
          name: ToolName.GIT_CREATE_BRANCH,
          description: "Create a new branch (optionally from a specific starting point)",
          inputSchema: zodToJsonSchema(GitCreateBranchSchema),
        },
        {
          name: ToolName.GIT_MERGE,
          description: "Merge a branch into the current branch",
          inputSchema: zodToJsonSchema(GitMergeSchema),
        },
      ],
    }));

    // ── tools/call ────────────────────────────────────────────────────
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: input } = request.params;

      try {
        switch (name) {
          // ── Repository setup ──────────────────────────────────────
          case ToolName.GIT_CLONE: {
            const args = input as z.infer<typeof GitCloneSchema>;
            return await GitTools.clone(args.repoUrl, args.localPath);
          }

          // ── Branch operations ─────────────────────────────────────
          case ToolName.GIT_LIST_BRANCHES: {
            const args = input as z.infer<typeof GitListBranchesSchema>;
            return await GitTools.listBranches(args.repoPath);
          }

          case ToolName.GIT_CHECKOUT: {
            const args = input as z.infer<typeof GitCheckoutSchema>;
            return await GitTools.checkout(args.repoPath, args.branch);
          }

          case ToolName.GIT_CREATE_BRANCH: {
            const args = input as z.infer<typeof GitCreateBranchSchema>;
            return await GitTools.createBranch(
              args.repoPath,
              args.branch,
              args.checkout,
              args.startPoint,
            );
          }

          // ── Merge operations ───────────────────────────────────────
          case ToolName.GIT_MERGE: {
            const args = input as z.infer<typeof GitMergeSchema>;
            return await GitTools.merge(args.repoPath, args.branch, args.noFf);
          }

          // ── File operations ───────────────────────────────────────
          case ToolName.GIT_LIST_FILES: {
            const args = input as z.infer<typeof GitListFilesSchema>;
            return await GitTools.listFiles(args.repoPath, args.recursive);
          }

          case ToolName.GIT_READ_FILE: {
            const args = input as z.infer<typeof GitReadFileSchema>;
            return await GitTools.readFile(args.repoPath, args.filePath);
          }

          // ── Sync operations ───────────────────────────────────────
          case ToolName.GIT_PULL: {
            const args = input as z.infer<typeof GitPullSchema>;
            return await GitTools.pull(args.repoPath);
          }

          case ToolName.GIT_PUSH: {
            const args = input as z.infer<typeof GitPushSchema>;
            return await GitTools.push(args.repoPath);
          }

          // ── Staging & committing ──────────────────────────────────
          case ToolName.GIT_ADD: {
            const args = input as z.infer<typeof GitAddSchema>;
            return await GitTools.add(args.repoPath, args.files);
          }

          case ToolName.GIT_COMMIT: {
            const args = input as z.infer<typeof GitCommitSchema>;
            return await GitTools.commit(
              args.repoPath,
              args.message,
              args.add,
            );
          }

          // ── Inspection ────────────────────────────────────────────
          case ToolName.GIT_STATUS: {
            const args = input as z.infer<typeof GitStatusSchema>;
            return await GitTools.status(args.repoPath);
          }

          case ToolName.GIT_DIFF: {
            const args = input as z.infer<typeof GitDiffSchema>;
            return await GitTools.diff(args.repoPath, args.staged);
          }

          case ToolName.GIT_LOG: {
            const args = input as z.infer<typeof GitLogSchema>;
            return await GitTools.log(args.repoPath, args.maxCount);
          }

          // ── History manipulation ──────────────────────────────────
          case ToolName.GIT_RESET: {
            const args = input as z.infer<typeof GitResetSchema>;
            return await GitTools.reset(args.repoPath, args.mode);
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`,
            );
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Connects the server to a stdio transport and starts processing
   * incoming MCP requests.
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Code Context MCP server running on stdio");
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const server = new CodeContextServer();
server.run().catch(console.error);
