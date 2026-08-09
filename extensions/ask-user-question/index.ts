import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const TOOL_DESCRIPTION = `Ask a multiple-choice question to the user. Use when you need to:

1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take

Use this tool instead of asking the user directly in the chat.

The last choice is always an 'Other' option that prompts for custom input. 
`;

const OTHER_LABEL = "Other (enter custom answer)";

export default function (pi: ExtensionAPI) {
  // Register the tool only when a session starts in TUI mode. This avoids
  // registering a tool that requires interactive UI when running in non-interactive
  // environments.
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    pi.registerTool({
      name: "ask-user-question",
      label: "Ask user question",
      description: TOOL_DESCRIPTION,
      // Parameters: question text and an array of option strings
      parameters: Type.Object({
        question: Type.String({
          description: "Question to present to the user",
        }),
        options: Type.Array(Type.String(), {
          description:
            "Array of option labels. Maximum of 10 options recommended.",
        }),
      }),
      executionMode: "sequential",

      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const opts = Array.isArray(params.options)
          ? params.options.slice()
          : [];
        if (opts.length === 0) {
          return {
            content: [{ type: "text", text: "Error: no options provided" }],
            details: { question: params.question, options: [], answer: null },
          };
        }
        // Ensure the last entry is the Other option. If opts already contains it, avoid duplicating.
        const finalChoices = opts.slice(0, -1).concat([OTHER_LABEL]);
        if (opts.length === 1) {
          // Present the single option and the Other option
          finalChoices.unshift(opts[0]);
        }

        const selected = await ctx.ui.select(params.question, finalChoices);

        if (!selected) {
          return {
            content: [{ type: "text", text: "User cancelled the selection" }],
            details: { question: params.question, options: opts, answer: null },
          };
        }

        let answer: string | null = selected;
        let wasCustom = false;

        if (selected === OTHER_LABEL) {
          const custom = await ctx.ui.input("Enter custom answer:");
          if (!custom) {
            return {
              content: [
                {
                  type: "text",
                  text: "No custom answer entered. Selection aborted.",
                },
              ],
              details: {
                question: params.question,
                options: opts,
                answer: null,
              },
            };
          }
          answer = custom;
          wasCustom = true;
        }

        return {
          content: [{ type: "text", text: `User answered: ${answer}` }],
          details: {
            question: params.question,
            options: opts,
            answer,
            wasCustom,
          },
        };
      },
    });
  });
}
