/**
 * @module test_script
 * @description Manual integration test for the {@link GitTools} class.
 *
 * Spins up temporary local Git repositories, exercises every GitTools
 * method, and tears everything down when finished. A bare "remote" repo
 * is created locally to test pull / push without network dependency.
 *
 * Usage:
 * ```bash
 * npx tsx test_script.ts
 * ```
 *
 * @license MIT
 */

import { GitTools } from "./tools/gitTools.js";
import path from "path";
import fs from "fs";
import { simpleGit } from "simple-git";

/** Simple pass/fail counter for the test run summary. */
let passed = 0;
let failed = 0;

/**
 * Asserts a condition and logs a PASS / FAIL result.
 *
 * @param label - Human-readable test description.
 * @param ok    - Whether the assertion passed.
 */
function assert(label: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

/**
 * Runs the full integration test suite against {@link GitTools}.
 *
 * Creates two disposable repositories:
 * - **bareDir** – a bare repo that acts as a "remote" for push/pull tests.
 * - **testDir** – a working clone used for every other test.
 *
 * Both directories are deleted in the `finally` block — even on failure.
 */
async function runTests() {
  const testDir = path.resolve("./test_repo_123");
  const bareDir = path.resolve("./test_bare_remote");

  try {
    // ── Cleanup from any previous interrupted run ─────────────────
    for (const dir of [testDir, bareDir]) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    console.log("🚀 Testing GitTools…\n");

    // ── Setup: bare remote + working repo ─────────────────────────
    // Create a bare repository to act as a local "remote"
    fs.mkdirSync(bareDir);
    const bareGit = simpleGit(bareDir);
    await bareGit.init(true); // --bare

    // ── Test 1: Clone ─────────────────────────────────────────────
    console.log("--- Test 1: clone ---");
    const cloneResult = await GitTools.clone(bareDir, testDir);
    assert("clone returns success message", cloneResult.content[0].text.includes("Successfully cloned"));
    assert("cloned directory exists", fs.existsSync(testDir));

    // Clone into non-empty directory should return a warning, not throw
    const cloneDupe = await GitTools.clone(bareDir, testDir);
    assert("clone into non-empty dir returns warning", cloneDupe.content[0].text.includes("already exists"));

    // Configure the cloned repo for commits
    const git = simpleGit(testDir);
    await git.addConfig("user.name", "Test User");
    await git.addConfig("user.email", "test@example.com");

    // Create an initial commit so HEAD exists
    fs.writeFileSync(path.join(testDir, "test.txt"), "Hello World");
    await git.add("test.txt");
    await git.commit("Initial commit");
    await git.push(["--set-upstream", "origin", "master"]);
    console.log();

    // ── Test 2: Status ────────────────────────────────────────────
    console.log("--- Test 2: status ---");
    const statusClean = await GitTools.status(testDir);
    const statusObj = JSON.parse(statusClean.content[0].text);
    assert("status reports clean working tree", statusObj.isClean === true);

    // Make the tree dirty and check again
    fs.writeFileSync(path.join(testDir, "dirty.txt"), "uncommitted");
    const statusDirty = await GitTools.status(testDir);
    const dirtyObj = JSON.parse(statusDirty.content[0].text);
    assert("status reports dirty working tree", dirtyObj.isClean === false);
    console.log();

    // ── Test 3: Add ───────────────────────────────────────────────
    console.log("--- Test 3: add ---");
    const addResult = await GitTools.add(testDir, ["dirty.txt"]);
    assert("add returns success message", addResult.content[0].text.includes("Successfully added"));

    // Verify the file is now staged
    const statusAfterAdd = await GitTools.status(testDir);
    const afterAddObj = JSON.parse(statusAfterAdd.content[0].text);
    assert("file appears in staged list", afterAddObj.staged.length > 0);
    console.log();

    // ── Test 4: Diff ──────────────────────────────────────────────
    console.log("--- Test 4: diff ---");
    // Staged diff should show our new file
    const stagedDiff = await GitTools.diff(testDir, true);
    assert("staged diff contains new file content", stagedDiff.content[0].text.includes("uncommitted"));

    // Unstaged diff should be empty (nothing modified after staging)
    const unstagedDiff = await GitTools.diff(testDir, false);
    assert("unstaged diff is empty after staging", unstagedDiff.content[0].text.trim() === "");
    console.log();

    // ── Test 5: Commit ────────────────────────────────────────────
    console.log("--- Test 5: commit ---");
    const commitResult = await GitTools.commit(testDir, "Add dirty file");
    assert("commit returns success message", commitResult.content[0].text.includes("Successfully committed"));

    // Verify tree is clean again
    const statusAfterCommit = await GitTools.status(testDir);
    const afterCommitObj = JSON.parse(statusAfterCommit.content[0].text);
    assert("tree is clean after commit", afterCommitObj.isClean === true);

    // Test commit with -a flag
    fs.writeFileSync(path.join(testDir, "dirty.txt"), "modified content");
    const commitAResult = await GitTools.commit(testDir, "Auto-add commit", true);
    assert("commit -a returns success", commitAResult.content[0].text.includes("Successfully committed"));
    console.log();

    // ── Test 6: Log ───────────────────────────────────────────────
    console.log("--- Test 6: log ---");
    const logResult = await GitTools.log(testDir);
    const logObj = JSON.parse(logResult.content[0].text);
    assert("log returns commits", logObj.total > 0);
    assert("log contains our commit message", logObj.all.some((c: any) => c.message === "Add dirty file"));

    // Test maxCount limiting
    const logLimited = await GitTools.log(testDir, 1);
    const logLimitedObj = JSON.parse(logLimited.content[0].text);
    assert("log respects maxCount", logLimitedObj.all.length === 1);
    console.log();

    // ── Test 7: List Files ────────────────────────────────────────
    console.log("--- Test 7: listFiles ---");
    const files = await GitTools.listFiles(testDir);
    const fileList = JSON.parse(files.content[0].text);
    assert("listFiles returns tracked files", fileList.length > 0);
    assert("listFiles includes test.txt", fileList.includes("test.txt"));
    assert("listFiles includes dirty.txt", fileList.includes("dirty.txt"));
    console.log();

    // ── Test 8: Read File ─────────────────────────────────────────
    console.log("--- Test 8: readFile ---");
    const content = await GitTools.readFile(testDir, "test.txt");
    assert("readFile returns correct content", content.content[0].text === "Hello World");
    console.log();

    // ── Test 9: List Branches ─────────────────────────────────────
    console.log("--- Test 9: listBranches ---");
    // Create a secondary branch first
    await git.checkoutLocalBranch("feature-branch");
    fs.writeFileSync(path.join(testDir, "feature.txt"), "Feature Content");
    await git.add("feature.txt");
    await git.commit("Add feature");

    const branches = await GitTools.listBranches(testDir);
    const branchObj = JSON.parse(branches.content[0].text);
    assert("listBranches returns data", branchObj.all.length > 0);
    assert("listBranches includes feature-branch", branchObj.all.includes("feature-branch"));
    console.log();

    // ── Test 10: Checkout ─────────────────────────────────────────
    console.log("--- Test 10: checkout ---");
    // Detect whether the default branch is called "main" or "master"
    const mainBranch = branchObj.all.includes("main") ? "main" : "master";
    const checkoutResult = await GitTools.checkout(testDir, mainBranch);
    assert("checkout returns success message", checkoutResult.content[0].text.includes("Successfully checked out"));

    const statusAfterCheckout = await git.status();
    assert("checkout switched to correct branch", statusAfterCheckout.current === mainBranch);
    console.log();

    // ── Test 11: Push ─────────────────────────────────────────────
    console.log("--- Test 11: push ---");
    // Create a new commit to push
    fs.writeFileSync(path.join(testDir, "push_test.txt"), "push content");
    await git.add("push_test.txt");
    await git.commit("Commit to push");

    const pushResult = await GitTools.push(testDir);
    assert("push returns success message", pushResult.content[0].text.includes("Successfully pushed"));
    console.log();

    // ── Test 12: Pull ─────────────────────────────────────────────
    console.log("--- Test 12: pull ---");
    // Nothing new on remote, pull should still succeed (already up to date)
    const pullResult = await GitTools.pull(testDir);
    assert("pull returns success message", pullResult.content[0].text.includes("Successfully pulled"));
    console.log();

    // ── Test 13: Reset ────────────────────────────────────────────
    console.log("--- Test 13: reset ---");
    // Create a commit, then soft-reset to undo it
    fs.writeFileSync(path.join(testDir, "reset_test.txt"), "to be reset");
    await git.add("reset_test.txt");
    await git.commit("Commit to reset");

    const resetSoft = await GitTools.reset(testDir, "soft");
    assert("soft reset returns success", resetSoft.content[0].text.includes("Successfully reset"));

    // After soft reset the file should still be staged
    const statusAfterSoftReset = await GitTools.status(testDir);
    const softResetObj = JSON.parse(statusAfterSoftReset.content[0].text);
    assert("soft reset keeps file staged", softResetObj.staged.length > 0);

    // Now hard-reset to discard everything
    await git.commit("Re-commit for hard reset test");
    const resetHard = await GitTools.reset(testDir, "hard");
    assert("hard reset returns success", resetHard.content[0].text.includes("Successfully reset"));

    // Mixed reset (default)
    fs.writeFileSync(path.join(testDir, "mixed_test.txt"), "mixed");
    await git.add("mixed_test.txt");
    await git.commit("Commit for mixed reset");
    const resetMixed = await GitTools.reset(testDir);
    assert("mixed reset returns success", resetMixed.content[0].text.includes("Successfully reset"));
    console.log();

    // ── Summary ───────────────────────────────────────────────────
    console.log("═".repeat(40));
    console.log(`  Total: ${passed + failed}  |  ✅ ${passed}  |  ❌ ${failed}`);
    console.log("═".repeat(40));

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("\n💥 Test suite crashed:", err);
    process.exitCode = 1;
  } finally {
    // Always clean up the temporary repositories
    for (const dir of [testDir, bareDir]) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
}

// ── Bootstrap ───────────────────────────────────────────────────────
runTests().catch(console.error);
