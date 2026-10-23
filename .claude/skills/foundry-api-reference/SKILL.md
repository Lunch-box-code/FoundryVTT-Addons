---
name: foundry-api-reference
description: Local, searchable copy of the official Foundry VTT v14 (build 14.368) API docs and developer knowledge-base articles. Use whenever writing or reviewing Foundry VTT module/system code and you need the exact signature, options, properties, hook arguments, or behaviour of any Foundry class, function, type, CONFIG/CONST entry, or hook event — instead of answering from memory.
---

# Foundry VTT API Reference (v14.368)

Scraped from https://foundryvtt.com/api/ (TypeDoc) and https://foundryvtt.com/kb/ developer articles.
Foundry's API changes significantly between major versions (V1→V2 applications, `foundry.*` namespacing, data models).
**Always verify signatures here rather than relying on memory of older versions.**

## Layout (all paths relative to this skill directory)

| Path | Contents |
|---|---|
| `reference/OVERVIEW.md` | API landing page: public vs private API, map of primary/embedded document types, canvas, UI, dice |
| `reference/CATALOG.md` | One line per API page grouped by namespace: `path — Title — summary`. **Start here.** |
| `reference/HOOKS.md` | Table of every core hook event with signature + description |
| `reference/api/classes/` | 679 classes, e.g. `foundry.applications.api.ApplicationV2.md` |
| `reference/api/interfaces/` | 490 interfaces (option objects, configuration shapes, e.g. `foundry.applications.types.ApplicationConfiguration.md`) |
| `reference/api/types/` | 218 type aliases |
| `reference/api/functions/` | 291 functions incl. `hookEvents.<hookName>.md` |
| `reference/api/variables/` | 182 variables (CONFIG entries, CONST values, global singletons) |
| `reference/api/modules/` | 114 namespace index pages (e.g. `foundry.data.fields.md`, `CONST.md`, `hookEvents.md`) |
| `reference/articles/` | KB articles: module-development, system-development, system-data-models, packaging-guide, package-management, package-release-api, localization, module-sub-types, migration, versioning, intro-development, settings, keybinds, active-effects, scene-regions, dice*, compendium, macros, tours |

File names equal the fully qualified name: `classes/foundry.documents.Actor.md`, `classes/foundry.data.fields.SchemaField.md`.

## How to look things up

1. **Know the name?** Read `reference/api/classes/<qualified.Name>.md` directly. If unsure of the namespace, Glob `reference/api/**/*<Name>*.md`.
2. **Know the concept only?** Grep `reference/CATALOG.md` (case-insensitive) for keywords, e.g. `token`, `sheet`, `fields`, `socket`.
3. **Need a member?** Grep the class file for `### memberName` (members are `###` headings; static members show `[Static]`, protected ones `(protected)`).
4. **Hooks:** Grep `reference/HOOKS.md`, then read `reference/api/functions/hookEvents.<name>.md` for parameter docs.
5. **Workflow/how-to questions** (manifest fields, packaging, data models, migration): read the relevant `reference/articles/*.md`.
6. Class pages are large (some > 100 KB). Grep for the heading first, then Read with `offset`/`limit` rather than loading the whole file.

## Page format notes

- Each page starts with `# Kind Name`, the qualified name, and the source URL. Cite that URL when telling the user where something is documented.
- Inherited members are not repeated. They are listed by name under **"Inherited members (documented on parent class)"**. Follow the `Hierarchy` section to the parent class page.
- `_underscored` members are protected or overridable hooks for subclasses. Members marked `@private` / internal were stripped. Do not depend on undocumented APIs (see "Public vs Private API" in OVERVIEW.md).
- Deprecation notes appear as `#### Deprecated` blocks. Prefer the replacement they name.

## Version caveats

- These docs are **v14**. When a user targets v12/v13, check `reference/articles/migration.md` and deprecation notes, and say clearly when an API may differ.
- ApplicationV1 (`foundry.appv1.*`, `FormApplication`, `Dialog`) is deprecated and slated for removal in v16. New code should use ApplicationV2 / DialogV2.
- Prefer namespaced access (`foundry.applications.api.ApplicationV2`, `foundry.utils.mergeObject`, `foundry.documents.Actor`) over legacy globals.

## Refreshing the docs

The scrape is reproducible. See `scripts/README.md` in this skill for the pipeline (navigation.js → curl → cheerio/turndown).
