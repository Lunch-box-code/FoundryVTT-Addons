# FoundryVTT-Modules

Foundry Virtual Tabletop (v14) modules by lunch_box. Each module lives in its own folder.

| Module | Description | Manifest URL |
|---|---|---|
| [Folder Permissions](folder-permissions/) | Folder-level ownership that cascades to contents and is inherited by new or moved-in documents | `https://raw.githubusercontent.com/Lunch-box-code/FoundryVTT-Modules/main/folder-permissions/module.json` |

## Releasing a module

1. Bump `version` in `<module>/module.json` and point `download` at `.../releases/download/<module>-v<version>/<module>.zip`.
2. Commit, then tag and push: `git tag <module>-v<version> && git push origin <module>-v<version>`.
3. The `Release module` workflow checks the version, zips the folder and creates the GitHub release.

## Development

`CLAUDE.md` and `.claude/skills/` hold Claude Code skills for Foundry v14 development. The API reference those skills search is not committed. Rebuild it with `.claude/skills/foundry-api-reference/scripts/README.md`.
