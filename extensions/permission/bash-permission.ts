import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

interface AllowedBashCommandEntry {
  regex: string;
}

interface RemovedBashCommandEntry {
  index: number;
}

const ENTRY_TYPES = {
  allowed: "allowed-bash-command",
  removed: "removed-bash-command",
} as const;

function normalizeCommand(command: string) {
  return command.trim();
}

function getCommandKey(command: string) {
  const parts = command.split(/\s+/);

  return parts[0] || "";
}

function commandToRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

const DEFAULT_ALLOWED_BASH_COMMANDS = [
  /^ls(\s|$)/,
  /^pwd(\s|$)/,
  /^find(\s|$)/,
  /^rg(\s|$)/,
];

export default function (pi: ExtensionAPI) {
  let sessionAllowedBashCommands: RegExp[] = [];

  function restoreAllowedCommands(ctx: ExtensionContext) {
    sessionAllowedBashCommands = [];
    const newAllowedBashRegexes: string[] = [];

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom") {
        continue;
      }

      if (entry.customType === ENTRY_TYPES.allowed) {
        const data = entry.data as AllowedBashCommandEntry | undefined;
        if (data?.regex) {
          newAllowedBashRegexes.push(data.regex);
        }
      } else if (entry.customType === ENTRY_TYPES.removed) {
        const data = entry.data as RemovedBashCommandEntry | undefined;
        if (typeof data?.index === "number") {
          newAllowedBashRegexes.splice(data.index, 1);
        }
      }
    }

    for (const regex of newAllowedBashRegexes) {
      sessionAllowedBashCommands.push(new RegExp(regex));
    }
  }

  function persistAllowedCommand(regex: string) {
    pi.appendEntry<AllowedBashCommandEntry>(ENTRY_TYPES.allowed, {
      regex,
    });
  }

  function persistRemovedCommand(index: number) {
    pi.appendEntry<RemovedBashCommandEntry>(ENTRY_TYPES.removed, {
      index,
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    restoreAllowedCommands(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreAllowedCommands(ctx);
  });

  pi.registerCommand("allowed-commands", {
    description: "Manage allowed bash commands in this session.",
    handler: async (_args, ctx) => {
      while (true) {
        const action = await ctx.ui.select(
          "Allowed bash commands management:",
          [
            "Add new allowed command",
            "View/remove allowed commands",
            "Clear all allowed commands",
            "Cancel",
          ],
        );

        if (action === "Add new allowed command") {
          const regex = await ctx.ui.input(
            "Enter a regex pattern for the bash command to allow.",
          );

          if (!regex) {
            ctx.ui.notify("No regex entered. Action cancelled.", "info");
            continue;
          }

          sessionAllowedBashCommands.push(new RegExp(regex));
          persistAllowedCommand(regex);
          ctx.ui.notify(`Added allowed bash command:\n${regex}`, "success");
        } else if (action === "View/remove allowed commands") {
          let commands = sessionAllowedBashCommands
            .map((regex, idx) => ({
              command: regex.toString(),
              index: idx,
            }))
            .sort((a, b) => a.command.localeCompare(b.command));

          while (true) {
            const command = await ctx.ui.select(
              "Currently allowed bash commands:",
              commands.map((c, idx) => `[${idx + 1}] ${c.command}`),
            );

            if (!command) {
              break;
            }

            const idx =
              parseInt(command.match(/^\[(\d+)\]/)?.[1] || "", 10) - 1;
            const selectedCommand = commands[idx];

            const action = await ctx.ui.select(
              `Selected bash command:\n${selectedCommand.command}`,
              ["Remove", "Cancel"],
            );

            if (action === "Remove") {
              sessionAllowedBashCommands.splice(selectedCommand.index, 1);
              persistRemovedCommand(selectedCommand.index);
              ctx.ui.notify(
                `Removed allowed bash command:\n${selectedCommand.command}`,
                "info",
              );
              commands = sessionAllowedBashCommands
                .map((regex, idx) => ({
                  command: regex.toString(),
                  index: idx,
                }))
                .sort((a, b) => a.command.localeCompare(b.command));
            }
          }
        } else if (action === "Clear all allowed commands") {
          if (sessionAllowedBashCommands.length === 0) {
            ctx.ui.notify("No allowed bash commands to clear.", "info");
            continue;
          }

          const ok = await ctx.ui.confirm(
            "Clear allowed bash commands?",
            sessionAllowedBashCommands
              .sort((a, b) => a.toString().localeCompare(b.toString()))
              .map((cmd) => `- ${cmd}`)
              .join("\n"),
          );

          if (!ok) {
            continue;
          }

          for (let i = sessionAllowedBashCommands.length - 1; i >= 0; i--) {
            persistRemovedCommand(i);
          }
          sessionAllowedBashCommands = [];

          ctx.ui.notify(
            "Cleared all allowed bash commands for this session.",
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
    if (!isToolCallEventType("bash", event)) {
      return;
    }

    const command = event.input.command as string;
    const normalizedCommand = normalizeCommand(command);

    if (!normalizedCommand) {
      return {
        block: true,
        reason: "Empty bash command blocked",
      };
    }

    if (
      sessionAllowedBashCommands.some((regex) =>
        regex.test(normalizedCommand),
      ) ||
      DEFAULT_ALLOWED_BASH_COMMANDS.some((regex) =>
        regex.test(normalizedCommand),
      )
    ) {
      return;
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: "Bash blocked (no UI available for confirmation)",
      };
    }

    const commandKey = getCommandKey(command);

    const exactMatchPermissionOption = `Allow \`${command}\` for this session`;
    const commandKeyPermissionOption = `Allow all \`${commandKey}\` for this session`;

    while (true) {
      const choice = await ctx.ui.select(
        `Bash command:\n\n${command}\n\nChoose permission:`,
        [
          "Allow once",
          exactMatchPermissionOption,
          commandKeyPermissionOption,
          "Add a custom regex permission",
          "Deny",
        ],
      );

      if (choice === "Allow once") {
        return;
      } else if (choice === exactMatchPermissionOption) {
        const regexStr = `^${commandToRegex(normalizedCommand)}$`;
        sessionAllowedBashCommands.push(new RegExp(regexStr));
        persistAllowedCommand(regexStr);
        return;
      } else if (choice === commandKeyPermissionOption) {
        const regexStr = `^${commandToRegex(commandKey)}(\\s|$)`;
        sessionAllowedBashCommands.push(new RegExp(regexStr));
        persistAllowedCommand(regexStr);
        return;
      } else if (choice === "Add a custom regex permission") {
        const defaultRegexStr = `^${commandToRegex(normalizedCommand)}$`;
        const newRegexStr = await ctx.ui.editor(
          "Enter a custom regex pattern to allow this command:",
          defaultRegexStr,
        );

        if (typeof newRegexStr !== "string") {
          continue;
        }

        if (!new RegExp(newRegexStr).test(normalizedCommand)) {
          const ok = await ctx.ui.confirm(
            "The entered pattern does not match the command. Do you still want to add it?",
            `Command:\n${normalizedCommand}\n\nEntered pattern:\n${newRegexStr}`,
          );

          if (ok) {
            sessionAllowedBashCommands.push(new RegExp(newRegexStr));
            persistAllowedCommand(newRegexStr);
          }

          const allowEdit = await ctx.ui.confirm(
            "Do you still want to allow the command?",
            `Bash command:\n\n${command}`,
          );

          if (!allowEdit) {
            return { block: true, reason: "Write/Edit blocked by user" };
          }

          return;
        }

        sessionAllowedBashCommands.push(new RegExp(newRegexStr));
        persistAllowedCommand(newRegexStr);
        return;
      } else {
        return { block: true, reason: "Blocked by user" };
      }
    }
  });
}
