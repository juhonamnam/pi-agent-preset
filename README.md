# Pi Agent Presets

Pi extension that provides a preset of agents for common tasks.

Usage

- Test locally without installing: `pi -e ./` (loads this repo as a temporary extension)
- Install locally: `pi install ./` (adds to user or project settings)
- Build for publishing: `npm run build` (produces compiled files under `dist/`)

Notes

- This repo is a minimal package. Pi will auto-discover `extensions/` because of the `pi` manifest in package.json.
- Extensions run with full system access. Review code before installing.
