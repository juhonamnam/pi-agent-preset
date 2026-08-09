AGENTS for pi-agent-preset

Brief descriptions

- extensions/default-tools
  * Ensures basic CLI tools are enabled for agents. Adds any missing of ["find", "grep", "ls"] on before_agent_start.
  * Command: available-tools — shows active tools.

- extensions/permission
  * bash-permission.ts — Manages allowed bash command regexes and intercepts bash calls to prompt or block when not allowed.
  * edit-permission.ts — Manages allowed file glob patterns (and a project-files toggle) and intercepts write/edit calls to prompt or block when not allowed.

Quick usage

- Test locally: pi -e ./
- Install: pi install ./
- Build: npm run build
