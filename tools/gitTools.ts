import { z } from "zod";
import { simpleGit, SimpleGit } from "simple-git";
import path from "path";
import fs from "fs";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// Input schemas
export const GitCloneSchema = z.object({
  repoUrl: z.string().describe("The URL of the Git repository to clone"),
  localPath: z
    .string()
    .describe("The local path where the repository should be cloned"),
});

export const GitListBranchesSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
});

export const GitCheckoutSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  branch: z.string().describe("The branch name to checkout"),
});

export const GitListFilesSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  recursive: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to list files recursively"),
});

export const GitReadFileSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  filePath: z
    .string()
    .describe("The relative path to the file within the repository"),
});

export const GitPullSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
});

/**
 * Git Tools Implementation
 */
export class GitTools {
  private static getGit(repoPath: string): SimpleGit {
    if (!fs.existsSync(repoPath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path does not exist: ${repoPath}`,
      );
    }
    return simpleGit(repoPath);
  }

  static async pull(repoPath: string) {
    try {
      const git = this.getGit(repoPath);
      // Mandatory rebase for safety as requested by user
      const result = await git.pull(["--rebase"]);
      return {
        content: [
          {
            type: "text",
            text: `Successfully pulled with rebase:\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Git pull rebase failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async clone(repoUrl: string, localPath: string) {
    try {
      if (fs.existsSync(localPath) && fs.readdirSync(localPath).length > 0) {
        return {
          content: [
            {
              type: "text",
              text: `Directory already exists and is not empty: ${localPath}`,
            },
          ],
        };
      }

      const git = simpleGit();
      await git.clone(repoUrl, localPath);

      return {
        content: [
          {
            type: "text",
            text: `Successfully cloned ${repoUrl} to ${localPath}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Git clone failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async listBranches(repoPath: string) {
    try {
      const git = this.getGit(repoPath);
      const branches = await git.branch();
      return {
        content: [{ type: "text", text: JSON.stringify(branches, null, 2) }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list branches: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async checkout(repoPath: string, branch: string) {
    try {
      const git = this.getGit(repoPath);
      await git.checkout(branch);
      return {
        content: [
          { type: "text", text: `Successfully checked out branch: ${branch}` },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to checkout branch ${branch}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async listFiles(repoPath: string, recursive: boolean = true) {
    try {
      const git = this.getGit(repoPath);
      const args = ["ls-tree", "-r", "--name-only", "HEAD"];
      if (!recursive) {
        // Remove -r for non-recursive listing
        args.splice(1, 1);
      }

      const result = await git.raw(args);
      const files = result.split("\n").filter((f) => f.trim() !== "");

      return {
        content: [{ type: "text", text: JSON.stringify(files, null, 2) }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async readFile(repoPath: string, filePath: string) {
    try {
      const fullPath = path.join(repoPath, filePath);
      if (!fs.existsSync(fullPath)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `File does not exist: ${filePath}`,
        );
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      return {
        content: [{ type: "text", text: content }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
