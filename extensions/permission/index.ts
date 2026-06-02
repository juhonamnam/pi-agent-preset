import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import bashPermission from "./bash-permission";
import editPermission from "./edit-permission";

export default function (pi: ExtensionAPI) {
  bashPermission(pi);
  editPermission(pi);
}
