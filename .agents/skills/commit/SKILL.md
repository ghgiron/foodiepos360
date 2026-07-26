---
name: commit
description: Triggers a git commit workflow that stages all changes, commits with a provided message, and pushes to the remote repository branch. Use when the user asks to commit, push, or run the commit workflow.
---

# Commit Workflow Skill

This skill automates staging, committing, and pushing code to the remote Git repository when explicitly requested by the user.

## Instructions

When the user invokes this workflow (e.g., "commit", "sube los cambios", "ejecuta el workflow commit con el mensaje X"):

1. **Get Commit Message**:
   - Check if the user provided a commit message in their request (e.g. `commit "Fix header layout"`).
   - If no message was provided, prompt the user or inspect `git status` / `git diff --stat` to generate a clear, concise descriptive message, confirming it with the user.

2. **Check Git Status**:
   - Run `git status` to ensure there are changes to commit and verify untracked/ignored files.

3. **Stage Changes**:
   - Run `git add .` to stage all working directory changes (respecting `.gitignore`).

4. **Create Commit**:
   - Run `git commit -m "<COMMIT_MESSAGE>"`.

5. **Push to Remote**:
   - Determine current branch using `git rev-parse --abbrev-ref HEAD`.
   - Run `git push origin <CURRENT_BRANCH>` (increasing `http.postBuffer` if needed for large payloads).

6. **Confirm Status**:
   - Report the commit hash, branch name, and push confirmation to the user.
