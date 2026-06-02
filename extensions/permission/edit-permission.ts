import * as path from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

interface AllowedEditFileEntry {
  pattern: string;
}

interface RemovedEditFileEntry {
  index: number;
}

const ENTRY_TYPES = {
  allowed: "allowed-edit-file",
  removed: "removed-edit-file",
  allowProjectFiles: "allow-project-files",
  disallowProjectFiles: "disallow-project-files",
} as const;

function normalizePath(targetPath: string) {
  return path.resolve(targetPath);
}

export default function (pi: ExtensionAPI) {
  let projRoot: string | null = null;

  let sessionAllowedFilePatterns: string[] = [];

  let projectFilesAllowed = false;

  function restoreAllowedPaths(ctx: ExtensionContext) {
    sessionAllowedFilePatterns = [];

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom") {
        continue;
      }

      if (entry.customType === ENTRY_TYPES.allowed) {
        const data = entry.data as AllowedEditFileEntry | undefined;
        if (data?.pattern) {
          sessionAllowedFilePatterns.push(data.pattern);
        }
      } else if (entry.customType === ENTRY_TYPES.removed) {
        const data = entry.data as RemovedEditFileEntry | undefined;
        if (typeof data?.index === "number") {
          sessionAllowedFilePatterns.splice(data.index, 1);
        }
      } else if (entry.customType === ENTRY_TYPES.allowProjectFiles) {
        projectFilesAllowed = true;
      } else if (entry.customType === ENTRY_TYPES.disallowProjectFiles) {
        projectFilesAllowed = false;
      }
    }
  }

  function persistAllowedFile(pattern: string) {
    pi.appendEntry<AllowedEditFileEntry>(ENTRY_TYPES.allowed, {
      pattern,
    });
  }

  function persistRemovedFile(index: number) {
    pi.appendEntry<RemovedEditFileEntry>(ENTRY_TYPES.removed, {
      index,
    });
  }

  function persistProjectFilesAllowed(allowed: boolean) {
    pi.appendEntry(
      allowed
        ? ENTRY_TYPES.allowProjectFiles
        : ENTRY_TYPES.disallowProjectFiles,
    );
  }

  pi.on("session_start", async (_event, ctx) => {
    projRoot = ctx.cwd;
    restoreAllowedPaths(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreAllowedPaths(ctx);
  });

  pi.registerCommand("allowed-edits", {
    description: "Manage allowed file patterns for editing in this session.",
    handler: async (_args, ctx) => {
      while (true) {
        const projectAllowedOption = projectFilesAllowed
          ? "Disallow editing project files (currently allowed)"
          : "Allow editing project files (currently disallowed)";
        const action = await ctx.ui.select(
          "Manage allowed file patterns for editing:",
          [
            projectAllowedOption,
            "Add new file pattern",
            "View/remove pattern",
            "Clear all patterns",
            "Cancel",
          ],
        );

        if (action === projectAllowedOption) {
          projectFilesAllowed = !projectFilesAllowed;
          persistProjectFilesAllowed(projectFilesAllowed);
          ctx.ui.notify(
            projectFilesAllowed
              ? "Project files are now allowed for editing."
              : "Project files are now disallowed for editing.",
            "success",
          );
        } else if (action === "Add new file pattern") {
          const pattern = await ctx.ui.input(
            "Enter a file pattern to allow for editing.",
          );

          if (!pattern) {
            ctx.ui.notify("File pattern cannot be empty.", "error");
            continue;
          }

          sessionAllowedFilePatterns.push(pattern);
          persistAllowedFile(pattern);
          ctx.ui.notify(`Added allowed file pattern:\n${pattern}`, "success");
        } else if (action === "View/remove pattern") {
          let filePatterns = sessionAllowedFilePatterns
            .map((pattern, idx) => ({
              pattern,
              index: idx,
            }))
            .sort((a, b) => a.pattern.localeCompare(b.pattern));

          while (true) {
            const pattern = await ctx.ui.select(
              "Currently allowed file patterns for editing:",
              filePatterns.map((f, idx) => `[${idx + 1}] ${f.pattern}`),
            );

            if (!pattern) {
              break;
            }

            const idx =
              parseInt(pattern.match(/^\[(\d+)\]/)?.[1] || "", 10) - 1;
            const selectedFilePattern = filePatterns[idx];

            const action = await ctx.ui.select(
              `Selected file pattern:\n${selectedFilePattern.pattern}`,
              ["Remove", "Cancel"],
            );

            if (action === "Remove") {
              sessionAllowedFilePatterns.splice(selectedFilePattern.index, 1);
              persistRemovedFile(selectedFilePattern.index);
              ctx.ui.notify(
                `Removed allowed file pattern:\n${selectedFilePattern.pattern}`,
                "success",
              );
              filePatterns = sessionAllowedFilePatterns
                .map((pattern, idx) => ({
                  pattern,
                  index: idx,
                }))
                .sort((a, b) => a.pattern.localeCompare(b.pattern));
            }
          }
        } else if (action === "Clear all patterns") {
          if (sessionAllowedFilePatterns.length === 0) {
            ctx.ui.notify(
              "No allowed file patterns for editing to clear in this session.",
              "info",
            );
            continue;
          }

          const ok = await ctx.ui.confirm(
            "Clear allowed file patterns for editing?",
            sessionAllowedFilePatterns
              .sort()
              .map((pattern) => `- ${pattern}`)
              .join("\n"),
          );

          if (!ok) {
            continue;
          }

          for (let i = sessionAllowedFilePatterns.length - 1; i >= 0; i--) {
            persistRemovedFile(i);
          }
          sessionAllowedFilePatterns = [];

          ctx.ui.notify(
            "Cleared all allowed file patterns for editing in this session.",
            "info",
          );
          continue;
        } else {
          break;
        }
      }
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (
      !isToolCallEventType("write", event) &&
      !isToolCallEventType("edit", event)
    ) {
      return;
    }

    const targetPath = normalizePath(event.input.path as string);

    if (!targetPath) {
      return {
        block: true,
        reason: "Write/Edit blocked: unable to determine target file path",
      };
    }

    if (
      sessionAllowedFilePatterns.some((pattern) =>
        path.matchesGlob(targetPath, pattern),
      )
    ) {
      return;
    }

    const isProjectFile = projRoot ? targetPath.startsWith(projRoot) : false;

    if (isProjectFile && projectFilesAllowed) {
      return;
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: "Write/Edit blocked: no UI available for confirmation",
      };
    }

    while (true) {
      const choice = await ctx.ui.select(
        `Allow file change?\n\n${event.toolName} file:\n${event.input.path}`,
        [
          "Allow once",
          ...(isProjectFile ? ["Allow editing this project"] : []),
          "Allow editing this file",
          "Allow editing this directory",
          "Add a custom glob pattern for allowed edits",
          "Deny",
        ],
      );

      if (choice === "Allow once") {
        return;
      } else if (choice === "Allow editing this project") {
        projectFilesAllowed = true;
        persistProjectFilesAllowed(true);
        return;
      } else if (choice === "Allow editing this file") {
        sessionAllowedFilePatterns.push(targetPath);
        persistAllowedFile(targetPath);
        return;
      } else if (choice === "Allow editing this directory") {
        const pattern = path.join(path.dirname(targetPath), "**");
        sessionAllowedFilePatterns.push(pattern);
        persistAllowedFile(pattern);
        return;
      } else if (choice === "Add a custom glob pattern for allowed edits") {
        const newPattern = await ctx.ui.editor(
          "Enter a custom glob pattern to allow edits:",
          targetPath,
        );

        if (typeof newPattern !== "string") {
          continue;
        }

        const newNormalizedPattern = normalizePath(newPattern);

        if (!path.matchesGlob(targetPath, newNormalizedPattern)) {
          const ok = await ctx.ui.confirm(
            "The entered pattern does not match the target file path. Are you sure you want to add it?",
            `Target file path:\n${targetPath}\n\nEntered pattern:\n${newNormalizedPattern}`,
          );

          if (ok) {
            sessionAllowedFilePatterns.push(newNormalizedPattern);
            persistAllowedFile(newNormalizedPattern);
          }

          const allowEdit = await ctx.ui.confirm(
            "Do you still want to allow the edit?",
            `\n\n${event.toolName} file:\n${event.input.path}`,
          );

          if (!allowEdit) {
            return { block: true, reason: "Write/Edit blocked by user" };
          }

          return;
        }

        sessionAllowedFilePatterns.push(newNormalizedPattern);
        persistAllowedFile(newNormalizedPattern);
        return;
      } else {
        return { block: true, reason: "Write/Edit blocked by user" };
      }
    }
  });
}
