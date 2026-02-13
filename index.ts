#!/usr/bin/env node
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
} from "./tools/gitTools.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

enum ToolName {
  GIT_CLONE = "git_clone",
  GIT_LIST_BRANCHES = "git_list_branches",
  GIT_CHECKOUT = "git_checkout",
  GIT_LIST_FILES = "git_list_files",
  GIT_READ_FILE = "git_read_file",
  GIT_PULL = "git_pull",
}

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

    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
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
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: input } = request.params;

      try {
        switch (name) {
          case ToolName.GIT_CLONE:
            const cloneArgs = input as z.infer<typeof GitCloneSchema>;
            return await GitTools.clone(cloneArgs.repoUrl, cloneArgs.localPath);

          case ToolName.GIT_LIST_BRANCHES:
            const listBranchesArgs = input as z.infer<
              typeof GitListBranchesSchema
            >;
            return await GitTools.listBranches(listBranchesArgs.repoPath);

          case ToolName.GIT_CHECKOUT:
            const checkoutArgs = input as z.infer<typeof GitCheckoutSchema>;
            return await GitTools.checkout(
              checkoutArgs.repoPath,
              checkoutArgs.branch,
            );

          case ToolName.GIT_LIST_FILES:
            const listFilesArgs = input as z.infer<typeof GitListFilesSchema>;
            return await GitTools.listFiles(
              listFilesArgs.repoPath,
              listFilesArgs.recursive,
            );

          case ToolName.GIT_READ_FILE:
            const readFileArgs = input as z.infer<typeof GitReadFileSchema>;
            return await GitTools.readFile(
              readFileArgs.repoPath,
              readFileArgs.filePath,
            );

          case ToolName.GIT_PULL:
            const pullArgs = input as z.infer<typeof GitPullSchema>;
            return await GitTools.pull(pullArgs.repoPath);

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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Code Context MCP server running on stdio");
  }
}

const server = new CodeContextServer();
server.run().catch(console.error);
