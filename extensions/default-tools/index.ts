import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    try {
      const current = pi.getActiveTools() ?? [];
      const missing = ["find", "grep", "ls"].filter(
        (t) => !current.includes(t),
      );
      if (missing.length > 0) pi.setActiveTools([...current, ...missing]);
    } catch {
      // Extension should never crash Pi — silent no-op on failure
    }
  });

  pi.registerCommand("available-tools", {
    description: "Manage allowed file patterns for editing in this session.",
    handler: async (_args, ctx) => {
      const tools = pi.getActiveTools() ?? [];
      ctx.ui.notify(`Active tools: ${tools.join(", ")}`);
    },
  });
}
