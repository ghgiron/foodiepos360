---
description: 
---

# Workflow: Commit & Push to GitHub (commit-github)

## Description
Automates the full Git staging, committing, and pushing pipeline to GitHub from Antigravity IDE, ensuring clear commit messaging, repository status verification, and robust branch management.

---

## 1. Prerequisites Check
Before executing, the assistant must ensure:
1. Git is installed and initialized in the local repository (`git rev-parse --is-inside-work-tree`).
2. A remote GitHub repository is linked (`git remote -v`).
3. Active user identity is configured (`git config user.name` and `git config user.email`).

---

## 2. Interactive Input
Prompt the user for the following input if not provided upfront:
- **Commit Message:** Short, descriptive explanation of changes following conventional commits (e.g., `feat:`, `fix:`, `docs:`, `refactor:`, `style:`).
- **Target Branch (Optional):** Current active branch by default (`git branch --show-current`).

---

## 3. Execution Steps

### Step 1: Pre-Commit Status & Diff Verification
Run git status to evaluate modified, untracked, or deleted files:
```bash
git status -s