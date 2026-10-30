# Whisper | Agent Instructions

## 1. Project context

Whisper is an AI character companion application.

The project uses React, TypeScript, Vite, Supabase, and Gemini-based AI functionality. Verify the current implementation before relying on assumptions about specific services, models, files, or system behavior.

The repository contains project documentation, including:

- `ARCHITECTURE.md`
- `KNOWN_ISSUES.md`
- `whisper-roadmap-v4.md`

These documents provide useful context, but may not reflect the latest implementation. Check the actual code before making technical claims or proposing changes.

## 2. Working principles

- Treat the user as the product owner and final decision-maker.
- Understand the existing implementation before proposing changes.
- Prefer small, focused changes over unnecessary rewrites.
- Extend existing systems rather than introducing parallel implementations.
- Preserve established behavior unless a change is explicitly requested.
- Do not invent files, functions, exports, database fields, or APIs.
- Do not assume a documented issue is still present. Verify it first.
- Do not treat a passing build or test suite as proof that behavior is correct.

## 3. Approval before implementation

Before modifying files:

1. Explain the problem or requested change.
2. Identify the files and systems likely to be affected.
3. Describe the proposed approach.
4. Identify relevant risks or possible side effects.
5. Wait for the user's approval.

Do not independently expand the task into unrelated improvements.

Do not refactor, clean up, upgrade, migrate, or redesign unrelated systems without approval.

## 4. Repository and Git safety

- Use `npm` as the project's package manager.
- Treat `package-lock.json` as the authoritative npm lockfile.
- Do not regenerate or replace lockfiles unnecessarily.
- Do not switch package managers.
- Work on a dedicated feature branch or worktree.
- Do not commit directly to `main`.
- Do not merge or push changes to `main` without explicit approval.
- Keep changes focused and explain what each commit contains.
- Do not overwrite another agent's work.

When multiple agents are involved, avoid having them edit the same working tree simultaneously. Prefer separate branches or worktrees.

## 5. Secrets and environment safety

- Never commit API keys, access tokens, passwords, service-role keys, or private credentials.
- Never expose secret values in logs, reports, screenshots, or responses.
- Do not modify production environment variables or deployed secrets without explicit approval.
- Do not assume `.gitignore` makes secrets inaccessible to agents.
- Treat environment files and local Supabase configuration as sensitive.
- Use `.env.example` for documenting required environment variable names, never real values.
- If you discover an exposed secret, token, or credential anywhere in the repository (including git history), stop the current task and report it immediately. Do not attempt to "fix" it yourself by committing a change. Revocation happens outside the repo, by the user, on the relevant platform.

## 6. Technical change safety

Before changing an existing system:

- Inspect its current implementation and callers.
- Check relevant types, database interactions, and edge functions.
- Verify imports and exports before using them.
- Check whether the proposed change affects other characters, modes, or user accounts.
- Preserve existing API contracts unless changing them is part of the approved task.
- Consider loading states, error handling, concurrency, and fallback behavior.
- For relationship state, memory, or reset-related changes, confirm that every representation of the relevant state is reset together (axes, memory narrative, and `relationship_state` jsonb). A per-character reset must not affect other characters' data. Partial resets and cross-character mutations have caused real bugs in this project before.

For prompt, memory, relationship, character, and chat changes, be especially careful to preserve existing behavioral continuity.

- Do not make database schema changes, Supabase migrations, RLS changes, or production deployments without explicit approval.
- Do not modify NSFW tier logic, boundary/safety content, or the server-authoritative override block without explicit approval. This logic is intentionally server-side and safety-relevant, not a refactoring target.

## 7. Validation and reporting

After approved changes:

- Run relevant checks where possible.
- Use the project's existing npm scripts.
- Report which commands were run and whether they passed.
- Identify checks that could not be run.
- Explain what still requires manual testing.
- Summarize files changed and the reason for each change.

Do not claim that something works merely because it compiles.

## 8. Communication

Be direct and specific.

When investigating an issue:

- Distinguish confirmed findings from assumptions.
- Explain the evidence behind recommendations.
- Raise concerns when an approach could create regressions.
- Offer alternatives when appropriate.
- Ask before making decisions that affect product direction or established architecture.

Do not silently make product decisions on the user's behalf.

## 9. Scope discipline

Only work on the task the user approved.

Do not turn a focused feature request into a general code cleanup or architectural overhaul.

If additional problems are discovered, report them separately and wait for direction.
