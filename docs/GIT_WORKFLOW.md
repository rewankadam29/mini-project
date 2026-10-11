# Git evidence for Phase 3

The archive includes `.git`, real feature branches and merge commits from this preparation session. If Windows hides the folder, that is normal. Do not run `git init` again after extracting. If you already have a team repository, copy these source files into your existing working branch instead of overwriting its `.git` folder.

## Show repository setup

Open PowerShell in the extracted project root:

```powershell
git status
git branch --all
git log --oneline --graph --all --decorate
```

Branches: `main`, `feature/frontend-results`, `feature/backend-mysql`, `feature/validation-tests`, `feature/phase3-docs`. `main` contains the merged implementation. These branches demonstrate module separation. Their existence does not establish that a particular team member authored a module.

## Connect GitHub

Create an empty repository on your own GitHub account. Leave README, license and gitignore unchecked so the remote has no initial commit. Replace the example URL with the actual URL from your repository:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/exam-seating-generator.git
git push -u origin main
git push origin --all
```

Only run `remote add` if `git remote -v` shows no origin. If origin already exists, check its URL before changing it. If the remote already has commits, use the existing repository workflow and avoid force-pushing.

Before committing your own work, set your real identity:

```powershell
git config user.name "Your Name"
git config user.email "Your verified GitHub email"
```

Never commit `.env`, passwords or `node_modules`. `.gitignore` already excludes them. The project has no real credentials.

## Team workflow

Keep `main` ready for demonstration. Each member creates a branch for the module they actually work on. Make small commits with a clear type and description. Open a pull request, review the changes, run `npm test`, then merge. Never invent old timestamps, authorship or historical commits for the evaluation.

```powershell
git switch main
git pull origin main
git switch -c feature/room-validation
# Make and review the actual change first.
git add public/script.js
git commit -m "fix: reject invalid room selections"
git push -u origin feature/room-validation
```

## Commit conventions

| Prefix | Use | Example |
| --- | --- | --- |
| feat | New behavior | feat: add room-wise seating display |
| fix | Correct a defect | fix: prevent duplicate student allocation |
| test | Verification | test: cover insufficient room capacity |
| docs | Documentation | docs: add phase 3 demonstration guide |
| chore | Setup or merge | chore: merge backend and database module |

## Evidence to show tomorrow

Show your actual GitHub URL and file structure, the branch list, one substantive feature commit, a merge commit and the passing test command. The local archive covers Git history, but you must connect and push it to your account to demonstrate GitHub hosting. Document member responsibilities only after the team confirms them.
