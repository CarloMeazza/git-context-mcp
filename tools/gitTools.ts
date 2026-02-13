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

export const GitCommitSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  message: z.string().describe("The commit message"),
  add: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether to add all tracked files before committing (equivalent to git commit -a)",
    ),
});

export const GitStatusSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
});

export const GitDiffSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  staged: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to show diff for staged changes"),
});

export const GitPushSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
});

export const GitAddSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  files: z
    .array(z.string())
    .describe("The files to add (use '.' for all files)"),
});

export const GitResetSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  mode: z
    .enum(["soft", "mixed", "hard"])
    .optional()
    .default("mixed")
    .describe("The reset mode (soft, mixed, hard)"),
});

export const GitLogSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  maxCount: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of commits to show"),
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

  private static async safePullRebase(git: SimpleGit) {
    try {
      // Mandatory rebase for safety as requested by user
      const result = await git.pull(["--rebase"]);
      return result;
    } catch (error) {
      // If pull rebase fails, try to abort the rebase to leave repo in clean state
      try {
        await git.rebase(["--abort"]);
      } catch (abortError) {
        // Ignore abort errors (e.g. if rebase didn't even start)
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Git pull --rebase failed and was aborted to restore state. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async pull(repoPath: string) {
    try {
      const git = this.getGit(repoPath);
      const result = await this.safePullRebase(git);
      return {
        content: [
          {
            type: "text",
            text: `Successfully pulled with rebase:\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Git pull failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async commit(repoPath: string, message: string, add: boolean = false) {
    try {
      const git = this.getGit(repoPath);
      const args = add ? ["-a"] : [];
      const result = await git.commit(message, args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully committed:\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Git commit failed: ${error instanceof Error ? error.message : String(error)}`,
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

  static async status(repoPath: string) {
    try {
      const git = this.getGit(repoPath);
      const status = await git.status();
      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async diff(repoPath: string, staged: boolean = false) {
    try {
      const git = this.getGit(repoPath);
      const args = staged ? ["--staged"] : [];
      const diff = await git.diff(args);
      return {
        content: [{ type: "text", text: diff }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get diff: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async push(repoPath: string) {
    try {
      const git = this.getGit(repoPath);
      // Mandatory pull --rebase before push, using safe helper
      await this.safePullRebase(git);
      const result = await git.push();
      return {
        content: [
          {
            type: "text",
            text: `Successfully pushed (after pull --rebase):\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to push: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async add(repoPath: string, files: string[]) {
    try {
      const git = this.getGit(repoPath);
      await git.add(files);
      return {
        content: [
          { type: "text", text: `Successfully added files: ${files.join(", ")}` },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to add files: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async reset(repoPath: string, mode: "soft" | "mixed" | "hard" = "mixed") {
    try {
      const git = this.getGit(repoPath);
      await git.reset(mode === "hard" ? ["--hard"] : mode === "soft" ? ["--soft"] : ["--mixed"]);
      return {
        content: [
          { type: "text", text: `Successfully reset repository (mode: ${mode})` },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to reset: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async log(repoPath: string, maxCount: number = 10) {
    try {
      const git = this.getGit(repoPath);
      const log = await git.log({ maxCount });
      return {
        content: [{ type: "text", text: JSON.stringify(log, null, 2) }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
