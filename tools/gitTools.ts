/**
 * @module tools/gitTools
 * @description Core Git operations module for the MCP server.
 *
 * Provides Zod-validated input schemas and a stateless `GitTools` utility class
 * that wraps {@link https://www.npmjs.com/package/simple-git simple-git} to
 * expose every supported Git command as an MCP-compatible tool response.
 *
 * @license MIT
 */

import { z } from "zod";
import { simpleGit, SimpleGit } from "simple-git";
import path from "path";
import fs from "fs";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Input Schemas
// ---------------------------------------------------------------------------

/** Schema for the {@link GitTools.clone} tool input. */
export const GitCloneSchema = z.object({
  repoUrl: z.string().describe("The URL of the Git repository to clone"),
  localPath: z
    .string()
    .describe("The local path where the repository should be cloned"),
});

/** Schema for the {@link GitTools.listBranches} tool input. */
export const GitListBranchesSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
});

/** Schema for the {@link GitTools.checkout} tool input. */
export const GitCheckoutSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  branch: z.string().describe("The branch name to checkout"),
});

/** Schema for the {@link GitTools.listFiles} tool input. */
export const GitListFilesSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  recursive: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to list files recursively"),
});

/** Schema for the {@link GitTools.readFile} tool input. */
export const GitReadFileSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  filePath: z
    .string()
    .describe("The relative path to the file within the repository"),
});

/** Schema for the {@link GitTools.pull} tool input. */
export const GitPullSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
});

/** Schema for the {@link GitTools.commit} tool input. */
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

/** Schema for the {@link GitTools.status} tool input. */
export const GitStatusSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
});

/** Schema for the {@link GitTools.diff} tool input. */
export const GitDiffSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  staged: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to show diff for staged changes"),
});

/** Schema for the {@link GitTools.push} tool input. */
export const GitPushSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
});

/** Schema for the {@link GitTools.add} tool input. */
export const GitAddSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  files: z
    .array(z.string())
    .describe("The files to add (use '.' for all files)"),
});

/** Schema for the {@link GitTools.reset} tool input. */
export const GitResetSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  mode: z
    .enum(["soft", "mixed", "hard"])
    .optional()
    .default("mixed")
    .describe("The reset mode (soft, mixed, hard)"),
});

/** Schema for the {@link GitTools.log} tool input. */
export const GitLogSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  maxCount: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of commits to show"),
});

/** Schema for the {@link GitTools.createBranch} tool input. */
export const GitCreateBranchSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  branch: z.string().describe("The name of the new branch to create"),
  checkout: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to checkout the new branch after creation (default: true)"),
  startPoint: z
    .string()
    .optional()
    .describe("The commit, branch, or tag to start from (defaults to HEAD)"),
});

/** Schema for the {@link GitTools.merge} tool input. */
export const GitMergeSchema = z.object({
  repoPath: z.string().describe("The local path to the Git repository"),
  branch: z.string().describe("The branch to merge into the current branch"),
  noFf: z
    .boolean()
    .optional()
    .default(false)
    .describe("When true, always create a merge commit even for fast-forward merges (--no-ff)"),
});

// ---------------------------------------------------------------------------
// Git Tools Implementation
// ---------------------------------------------------------------------------

/**
 * Stateless utility class that wraps `simple-git` to provide MCP-compatible
 * Git operations.
 *
 * Every public method returns an object shaped as
 * `{ content: [{ type: "text", text: string }] }` so it can be passed
 * directly as an MCP tool response.
 */
export class GitTools {
  /**
   * Returns a `SimpleGit` instance bound to the given repository path.
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @param options - Optional configuration including timeout settings.
   * @returns A configured `SimpleGit` instance.
   * @throws {McpError} If the path does not exist or is not a valid Git repository.
   */
  private static async getGit(
    repoPath: string,
    options?: { timeout?: number },
  ): Promise<SimpleGit> {
    if (!fs.existsSync(repoPath)) {
      logger.error("Path does not exist", { repoPath });
      throw new McpError(
        ErrorCode.InvalidParams,
        `Path does not exist: ${repoPath}`,
      );
    }

    const git = simpleGit(repoPath, {
      timeout: {
        block: options?.timeout || 30000, // 30 seconds default for blocking operations
      },
    });

    // Verify it's a valid Git repository
    try {
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        logger.error("Path is not a Git repository", { repoPath });
        throw new McpError(
          ErrorCode.InvalidParams,
          `Path is not a Git repository: ${repoPath}`,
        );
      }
    } catch (error) {
      if (error instanceof McpError) throw error;
      logger.error("Failed to check if path is a Git repository", {
        repoPath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to verify Git repository: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    logger.debug("Git instance created", { repoPath });
    return git;
  }

  /**
   * Performs a `git pull --rebase` with automatic rollback on failure.
   *
   * If the rebase encounters conflicts it is aborted so the repository
   * is left in a clean state rather than mid-rebase.
   *
   * @param git - An initialised `SimpleGit` instance.
   * @returns The pull result on success.
   * @throws {McpError} If the pull fails (rebase is aborted automatically).
   */
  private static async safePullRebase(git: SimpleGit) {
    try {
      const result = await git.pull(["--rebase"]);
      return result;
    } catch (error) {
      // Attempt to abort the rebase so the repo isn't left in a broken state
      try {
        await git.rebase(["--abort"]);
      } catch {
        // Ignore – rebase may not have started at all
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Git pull --rebase failed and was aborted to restore state. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Detects the default branch of the repository (main or master).
   *
   * Modern repositories typically use 'main', while older ones use 'master'.
   * This method checks for both and returns the appropriate one.
   *
   * @param git - An initialised `SimpleGit` instance.
   * @returns The name of the default branch.
   */
  private static async getDefaultBranch(git: SimpleGit): Promise<string> {
    try {
      const branches = await git.branch();
      // Check for 'main' first (modern convention)
      if (branches.all.includes('main')) {
        return 'main';
      }
      // Fall back to 'master'
      if (branches.all.includes('master')) {
        return 'master';
      }
      // If neither exists, return the current branch
      return branches.current || 'main';
    } catch {
      // Default fallback
      return 'main';
    }
  }

  // -----------------------------------------------------------------------
  // Public Tool Methods
  // -----------------------------------------------------------------------

  /**
   * Pulls remote changes using `--rebase` (mandatory).
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @returns MCP tool response with the pull result.
   * @throws {McpError} On pull failure.
   */
  static async pull(repoPath: string) {
    try {
      const git = await this.getGit(repoPath);
      const result = await this.safePullRebase(git);
      return {
        content: [
          {
            type: "text",
            text: `Successfully pulled with rebase:
${JSON.stringify(result, null, 2)}`,
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

  /**
   * Creates a new commit in the repository.
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @param message  - Commit message.
   * @param add      - When `true`, stages all tracked files before committing (`-a` flag).
   * @returns MCP tool response with the commit details.
   * @throws {McpError} On commit failure.
   */
  static async commit(repoPath: string, message: string, add: boolean = false) {
    try {
      const git = await this.getGit(repoPath);
      logger.info("Committing changes", { repoPath, message, add });
      const args = add ? ["-a"] : [];
      const result = await git.commit(message, args);
      logger.info("Commit successful", { repoPath, commitHash: result.commit });
      return {
        content: [
          {
            type: "text",
            text: `Successfully committed:
${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Git commit failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clones a remote repository to a local path.
   *
   * If the target directory already exists and is non-empty the clone is
   * skipped and a descriptive message is returned instead of throwing.
   *
   * @param repoUrl   - URL of the remote Git repository.
   * @param localPath - Destination path for the clone.
   * @returns MCP tool response confirming the clone result.
   * @throws {McpError} On clone failure.
   */
  static async clone(repoUrl: string, localPath: string) {
    try {
      if (fs.existsSync(localPath) && fs.readdirSync(localPath).length > 0) {
        logger.warn("Clone target directory exists and is not empty", { localPath });
        return {
          content: [
            {
              type: "text",
              text: `Directory already exists and is not empty: ${localPath}`,
            },
          ],
        };
      }

      // Use longer timeout for clone operations (60 seconds)
      const git = simpleGit({ timeout: { block: 60000 } });
      logger.info("Cloning repository", { repoUrl, localPath });
      await git.clone(repoUrl, localPath);
      logger.info("Clone successful", { repoUrl, localPath });

      return {
        content: [
          {
            type: "text",
            text: `Successfully cloned ${repoUrl} to ${localPath}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      logger.error("Git clone failed", { repoUrl, localPath, error });
      throw new McpError(
        ErrorCode.InternalError,
        `Git clone failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Lists all local and remote branches in the repository.
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @returns MCP tool response with branch information as JSON.
   * @throws {McpError} On failure.
   */
  static async listBranches(repoPath: string) {
    try {
      const git = await this.getGit(repoPath);
      const branches = await git.branch();
      return {
        content: [{ type: "text", text: JSON.stringify(branches, null, 2) }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list branches: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Checks out the specified branch.
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @param branch   - Name of the branch to checkout.
   * @returns MCP tool response confirming the checkout.
   * @throws {McpError} On checkout failure.
   */
  static async checkout(repoPath: string, branch: string) {
    try {
      const git = await this.getGit(repoPath);
      await git.checkout(branch);
      return {
        content: [
          { type: "text", text: `Successfully checked out branch: ${branch}` },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to checkout branch ${branch}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Lists files tracked by Git using `git ls-tree`.
   *
   * @param repoPath  - Absolute path to the local Git repository.
   * @param recursive - Whether to list files in subdirectories (`-r` flag).
   * @returns MCP tool response with a JSON array of file paths.
   * @throws {McpError} On failure.
   */
  static async listFiles(repoPath: string, recursive: boolean = true) {
    try {
      const git = await this.getGit(repoPath);
      const args = ["ls-tree", "-r", "--name-only", "HEAD"];
      if (!recursive) {
        // Remove the `-r` flag to restrict listing to the top-level tree
        args.splice(1, 1);
      }

      const result = await git.raw(args);
      const files = result.split("\n").filter((f) => f.trim() !== "");

      return {
        content: [{ type: "text", text: JSON.stringify(files, null, 2) }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Reads the content of a file from the repository's working tree.
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @param filePath - Relative path to the file within the repository.
   * @returns MCP tool response containing the file content as plain text.
   * @throws {McpError} If the file does not exist or cannot be read.
   */
  static async readFile(repoPath: string, filePath: string) {
    try {
      // Normalize paths to prevent directory traversal attacks
      const fullPath = path.resolve(path.join(repoPath, filePath));
      const normalizedRepoPath = path.resolve(repoPath);

      // Verify that the file is within the repository
      if (!fullPath.startsWith(normalizedRepoPath + path.sep) && fullPath !== normalizedRepoPath) {
        logger.warn("Potential path traversal attempt", { repoPath, filePath });
        throw new McpError(
          ErrorCode.InvalidParams,
          `File path must be within the repository: ${filePath}`,
        );
      }

      if (!fs.existsSync(fullPath)) {
        logger.warn("File not found", { fullPath });
        throw new McpError(
          ErrorCode.InvalidParams,
          `File does not exist: ${filePath}`,
        );
      }

      const git = await this.getGit(repoPath);
      logger.debug("Reading file", { fullPath });
      const content = fs.readFileSync(fullPath, "utf-8");
      return {
        content: [{ type: "text", text: content }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      logger.error("Error reading file", { repoPath, filePath, error });
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns the working-tree status of the repository.
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @returns MCP tool response with status information as JSON.
   * @throws {McpError} On failure.
   */
  static async status(repoPath: string) {
    try {
      const git = await this.getGit(repoPath);
      logger.debug("Checking repository status", { repoPath });
      const status = await git.status();
      logger.debug("Status check complete", { repoPath });
      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Returns the diff of the working tree or staged changes.
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @param staged   - When `true`, shows only staged (`--staged`) changes.
   * @returns MCP tool response with the unified diff output.
   * @throws {McpError} On failure.
   */
  static async diff(repoPath: string, staged: boolean = false) {
    try {
      const git = await this.getGit(repoPath);
      const args = staged ? ["--staged"] : [];
      const diff = await git.diff(args);
      return {
        content: [{ type: "text", text: diff }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get diff: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Pushes local commits to the remote.
   *
   * A `pull --rebase` is executed automatically before pushing to ensure a
   * linear history and reduce the chance of push rejections.
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @returns MCP tool response confirming the push result.
   * @throws {McpError} On push or pre-push rebase failure.
   */
  static async push(repoPath: string) {
    try {
      const git = await this.getGit(repoPath);
      // Mandatory pull --rebase before push to enforce linear history
      await this.safePullRebase(git);
      const result = await git.push();
      return {
        content: [
          {
            type: "text",
            text: `Successfully pushed (after pull --rebase):
${JSON.stringify(result, null, 2)}`,
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

  /**
   * Stages files for the next commit.
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @param files    - Array of file paths to stage (use `['.']` for all files).
   * @returns MCP tool response listing the staged files.
   * @throws {McpError} On failure.
   */
  static async add(repoPath: string, files: string[]) {
    try {
      const git = await this.getGit(repoPath);
      logger.info("Staging files", { repoPath, files });
      await git.add(files);
      logger.info("Files staged successfully", { repoPath });
      return {
        content: [
          { type: "text", text: `Successfully added files: ${files.join(", ")}` },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to add files: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resets the current HEAD to its previous state.
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @param mode     - Reset mode: `"soft"`, `"mixed"` (default), or `"hard"`.
   * @returns MCP tool response confirming the reset.
   * @throws {McpError} On failure.
   */
  static async reset(repoPath: string, mode: "soft" | "mixed" | "hard" = "mixed") {
    try {
      const git = await this.getGit(repoPath);
      await git.reset(mode === "hard" ? ["--hard"] : mode === "soft" ? ["--soft"] : ["--mixed"]);
      return {
        content: [
          { type: "text", text: `Successfully reset repository (mode: ${mode})` },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to reset: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Retrieves the commit log.
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @param maxCount - Maximum number of commits to return (default: 10).
   * @returns MCP tool response with the commit log as JSON.
   * @throws {McpError} On failure.
   */
  static async log(repoPath: string, maxCount: number = 10) {
    try {
      const git = await this.getGit(repoPath);
      const log = await git.log({ maxCount });
      return {
        content: [{ type: "text", text: JSON.stringify(log, null, 2) }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Creates a new branch, optionally from a specific starting point.
   *
   * @param repoPath   - Absolute path to the local Git repository.
   * @param branch     - Name of the new branch.
   * @param checkout   - When `true` (default), switch to the new branch after creation.
   * @param startPoint - Optional commit / branch / tag to branch from (defaults to HEAD).
   * @returns MCP tool response confirming the branch creation.
   * @throws {McpError} On failure (e.g. branch already exists).
   */
  static async createBranch(
    repoPath: string,
    branch: string,
    checkout: boolean = true,
    startPoint?: string,
  ) {
    try {
      const git = await this.getGit(repoPath);

      if (checkout) {
        // Create and switch in one step
        const args = startPoint
          ? ["-b", branch, startPoint]
          : ["-b", branch];
        await git.checkout(args);
      } else {
        // Create the branch without switching
        const args = startPoint
          ? [branch, startPoint]
          : [branch];
        await git.branch(args);
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully created branch '${branch}'${
              checkout ? " and checked out" : ""
            }${startPoint ? ` from '${startPoint}'` : ""}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create branch '${branch}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Merges a branch into the current branch.
   *
   * @param repoPath - Absolute path to the local Git repository.
   * @param branch   - Name of the branch to merge into the current branch.
   * @param noFf     - When `true`, forces a merge commit even on fast-forward (`--no-ff`).
   * @returns MCP tool response confirming the merge result.
   * @throws {McpError} On merge failure (e.g. conflicts).
   */
  static async merge(repoPath: string, branch: string, noFf: boolean = false) {
    try {
      const git = await this.getGit(repoPath);
      const args = noFf ? ["--no-ff", branch] : [branch];
      const result = await git.merge(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully merged '${branch}' into current branch:
${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to merge '${branch}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
