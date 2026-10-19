import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import bashPermission from "./bash-permission.js";
import editPermission from "./edit-permission.js";

export default function (pi: ExtensionAPI) {
  const bash = bashPermission(pi);
  const edit = editPermission(pi);

  pi.registerCommand("allow-all", {
    description:
      "Allow all bash commands and project file edits for this session.",
    handler: async (_args, ctx) => {
      bash.allowAll();
      edit.allowAll();
      ctx.ui.notify(
        "Allowed all bash commands and project file edits for this session.",
      );
    },
  });
}
