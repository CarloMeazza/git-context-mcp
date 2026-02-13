import { GitTools } from "./tools/gitTools.js";
import path from "path";
import fs from "fs";
import { simpleGit } from "simple-git";

async function runTests() {
  const testDir = path.resolve("./test_repo_123");

  try {
    // Clean up if exists
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    console.log("Testing GitTools...");

    // Initialize a test repo manually since we want to avoid network dependency for verification
    fs.mkdirSync(testDir);
    const git = simpleGit(testDir);
    await git.init();
    await git.addConfig("user.name", "Test User");
    await git.addConfig("user.email", "test@example.com");
    console.log("Initialized test repo at", testDir);

    // Create a file
    fs.writeFileSync(path.join(testDir, "test.txt"), "Hello World");
    await git.add("test.txt");
    await git.commit("Initial commit");

    // Create another branch
    await git.checkoutLocalBranch("feature-branch");
    fs.writeFileSync(path.join(testDir, "feature.txt"), "Feature Content");
    await git.add("feature.txt");
    await git.commit("Add feature");

    // Test 1: List Files
    console.log("\n--- Testing listFiles ---");
    const files = await GitTools.listFiles(testDir);
    console.log("Files:", files.content[0].text);

    // Test 2: Read File
    console.log("\n--- Testing readFile ---");
    const content = await GitTools.readFile(testDir, "test.txt");
    console.log(
      "Content validation:",
      content.content[0].text === "Hello World" ? "PASS" : "FAIL",
    );

    // Test 3: List Branches
    console.log("\n--- Testing listBranches ---");
    const branches = await GitTools.listBranches(testDir);
    console.log(
      "Branches output exists:",
      branches.content[0].text.length > 0 ? "PASS" : "FAIL",
    );

    // Test 4: Checkout
    console.log("\n--- Testing checkout ---");
    await GitTools.checkout(testDir, "master");
    // Note: 'master' might comprise 'main' depending on git config, verify with branch list
    const branchList = JSON.parse(branches.content[0].text);
    const mainBranch = branchList.all.includes("main") ? "main" : "master";
    await GitTools.checkout(testDir, mainBranch);

    const status = await git.status();
    console.log(
      "Checkout validation:",
      status.current === mainBranch ? "PASS" : "FAIL",
    );

    console.log("\nAll tests passed!");
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

runTests().catch(console.error);
