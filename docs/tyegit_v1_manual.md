# Tyegit v1.0 User Manual

Welcome to the official manual for Tyegit! Tyegit is a next-generation Git GUI designed to make version control fast, safe, and beautiful. Whether you're a beginner trying to understand Git or an enterprise security team implementing zero-trust secret management, this manual provides everything you need.

This documentation follows the Diátaxis framework and is divided into four main sections:

---

## 1. Tutorials (Learning-Oriented)

*Hands-on lessons designed to help you get started quickly.*

### Getting Started: Cloning Your First Repo
1. Open Tyegit. On the main Dashboard, click **Clone Repository**.
2. Paste the HTTPS or SSH URL of a repository and select a destination folder.
3. Click **Clone**. Tyegit will automatically detect the repo and add it to your active workspace.
4. Click on the repository card to open the **Workspace View**.

### Your First Commit
1. In the Workspace View, navigate to the **Changes** tab (the first icon).
2. You will see a list of modified files. Click a file to open the **God-Mode Diff Editor**, which provides side-by-side highlighting.
3. Click the checkbox next to a file to stage it.
4. At the bottom right, enter your commit message. If you want to credit someone, click **Add Co-Author** (`F-043`).
5. Click **Commit** (or press `Ctrl+Enter`). 

### Time Travel 101
Made a mistake? Drop a commit accidentally?
1. Press `Ctrl+T` (or click **More > Time Machine**).
2. This opens the **Git Time Machine & Recovery Center**.
3. Browse the visual timeline of every action you've taken.
4. Click **[ Undo Action ]** to instantly roll back your repository to the exact second before you made your mistake. No CLI wizardry required.

---

## 2. How-To Guides (Problem-Oriented)

*Step-by-step instructions for solving specific, real-world problems.*

### How to Resolve Merge Conflicts
When a pull or rebase results in a conflict, Tyegit blocks the operation and triggers the **Three-Way Conflict Modal**.
1. Tyegit automatically stages all non-conflicted files for you.
2. For each conflicted file, the UI shows you three panes: *Current Change*, *Incoming Change*, and *Result*.
3. Click **Accept Current**, **Accept Incoming**, or **Accept Both** on a line-by-line basis.
4. Once all conflicts are resolved, click **Complete Merge**.

### How to Perform an Interactive Rebase
1. Navigate to the **Graph** tab.
2. Right-click any commit and select **Rebase from here**.
3. This opens the **Interactive Rebase Modal**.
4. You can now drag-and-drop commits to reorder them.
5. Change a commit's action from `pick` to `squash` (to merge it with the commit above) or `drop` (to erase it).
6. Click **Execute Rebase**. If something goes wrong, you can undo the entire operation via the Time Machine.

### How to Manage Multiple Repositories
1. Go to the Dashboard and click **New Workspace Group**.
2. Name the group (e.g., "Frontend Microservices").
3. Drag and drop repository cards into the group.
4. You can now perform bulk actions (like fetching all remotes simultaneously) on the entire group.

### How to Use Worktrees
Worktrees allow you to check out multiple branches of the same repository in different folders on your computer simultaneously.
1. In the Workspace View, click **More > Worktrees**.
2. Click **Create Worktree**, name the branch, and select a folder path outside of your current repo.
3. You can now open that folder in your IDE and work on a new feature without losing your uncommitted state on the main branch!

### How to Securely Push Secrets (Enterprise)
1. Open the **Pipelines** tab (Ensure you have enabled the CI/CD Dashboard via `Settings > Enterprise`).
2. Navigate to the **Secrets** section and click **New Secret**.
3. Enter the Key name and the plaintext Value.
4. Tyegit encrypts the value locally on your machine using Libsodium X25519 before sending it over the network.

---

## 3. Explanations (Understanding-Oriented)

*High-level discussions that provide context and explain architectural decisions.*

### The Checkpoint Architecture
Git's standard undo features (`reflog`) can be intimidating and destructive. Tyegit solves this by bypassing Git's standard history when executing dangerous commands. Every time you perform an action (Commit, Rebase, Reset), Tyegit generates a lightweight snapshot payload and stores it in a hidden `.tyegit/checkpoints` directory. If you trigger a rollback, Tyegit doesn't just run `git reset`; it parses the exact state of your index and working directory from the checkpoint and forcefully restores it, ensuring 100% data safety.

### The Plugin Ecosystem
Tyegit is the first Git GUI with a natively compiled WebAssembly (Wasm) plugin engine. Instead of relying on slow Node.js scripts for Git Hooks, you can write plugins in Rust (or any Wasm-compatible language) to intercept Git operations. For example, the `conventional-commits` plugin runs at near-native speed to validate your commit message format before Tyegit even builds the commit object.

### The Zero-Trust Encryption Model
When managing CI/CD secrets (like AWS keys), Tyegit assumes the network is compromised. When you input a secret in the UI, Tyegit fetches the repository's public encryption key directly from the hosting provider. The secret is then encrypted locally on your CPU using a **Libsodium X25519 sealed box**. The plaintext is never stored in memory, never logged to the console, and only the encrypted ciphertext is transmitted over HTTPS.

---

## 4. Technical Reference (Information-Oriented)

*Dry, factual descriptions for quick lookups.*

### Keyboard Shortcuts
| Action | Windows / Linux | macOS |
| :--- | :--- | :--- |
| Open Global Configuration | `Ctrl + ,` | `Cmd + ,` |
| Open Git Time Machine | `Ctrl + T` | `Cmd + T` |
| Open Keyboard Shortcuts | `Ctrl + /` | `Cmd + /` |
| Toggle Global Sidebar | `Ctrl + B` | `Cmd + B` |
| Create New Commit | `Ctrl + Enter` | `Cmd + Enter` |

### DLP Scanner Regex Patterns
The Enterprise DLP Scanner (`secrets-scanner`) evaluates the `diff` string of your staging area against 30+ regex patterns before allowing a commit. High-severity patterns include:
*   **AWS Access Key ID:** `(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}`
*   **AWS Secret Access Key:** `(?i)aws(.{0,20})?(?-i)['\"][0-9a-zA-Z\/+]{40}['\"]`
*   **GitHub Personal Access Token:** `ghp_[0-9a-zA-Z]{36}`
*   **Slack OAuth v2 Token:** `xox[baprs]-([0-9a-zA-Z]{10,48})?`
*   **RSA Private Key:** `-----BEGIN RSA PRIVATE KEY-----`
