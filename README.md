# pi-permission

Minimal pi package that provides interactive permission gates for dangerous tools:

- `allowed-commands` command to manage allowed bash commands per session
- `allowed-edits` command to manage allowed file patterns for edit/write operations

Structure

- extensions/permission - TypeScript extension source (already present)

Usage

- Test locally without installing: `pi -e ./` (loads this repo as a temporary extension)
- Install locally: `pi install ./` (adds to user or project settings)
- Build for publishing: `npm run build` (produces compiled files under `dist/`)

Notes

- This repo is a minimal package. Pi will auto-discover `extensions/` because of the `pi` manifest in package.json.
- Extensions run with full system access. Review code before installing.
