---
name: foundry-documents-data
description: Working with Foundry VTT v14 Documents and data in module/system code. Use when creating, reading, updating or deleting Actors/Items/embedded documents; resolving UUIDs; reading or writing compendium packs; storing data in flags; reacting to preCreate/update/delete hooks or overriding _preCreate/_onUpdate; writing prepareBaseData/prepareDerivedData; checking ownership/permissions; defining TypeDataModel/DataModel schemas with foundry.data.fields; registering system or module sub-types (documentTypes, CONFIG.<Doc>.dataModels); migrateData; ActiveEffects; or replacing CONFIG.<Doc>.documentClass.
---

# Foundry v14 Documents and Data

Verified against the scraped v14.368 docs in `../foundry-api-reference/reference/`. If you need something that is not listed here, look it up there. Do not rely on memory of v10–v13, because several things changed in v14 (see **v14 gotchas** at the bottom).

Longer examples:
- [crud-cookbook.md](crud-cookbook.md): CRUD, batching, flags, UUIDs, compendia, hooks, ownership.
- [data-models.md](data-models.md): full TypeDataModel + document subclass + migration + sub-type registration example.

## 1. Document type map

| Kind | Types (from `CONST.*_DOCUMENT_TYPES`) |
|---|---|
| **World** (`CONST.WORLD_DOCUMENT_TYPES`, has a `game.*` collection) | Actor, Cards, ChatMessage, Combat, FogExploration, Folder, Item, JournalEntry, Macro, Playlist, RollTable, Scene, Setting, User |
| **Primary** (`CONST.PRIMARY_DOCUMENT_TYPES`) | the world types + **Adventure** (compendium only) + **ActiveEffect** (primary in v14, but there is no world collection) |
| **Compendium-storable** (`CONST.COMPENDIUM_DOCUMENT_TYPES`) | ActiveEffect, Actor, Adventure, Cards, Item, JournalEntry, Macro, Playlist, RollTable, Scene |
| **Embedded** (`CONST.EMBEDDED_DOCUMENT_TYPES`) | ActiveEffect, ActorDelta, AmbientLight, AmbientSound, Card, Combatant, CombatantGroup, Drawing, Item, JournalEntryCategory, JournalEntryPage, Level, Note, PlaylistSound, Region, RegionBehavior, TableResult, Tile, Token, Wall |

- Common parent → collection pairs: `actor.items`, `actor.effects`, `item.effects`, `scene.tokens`, `journalEntry.pages`. Use `Doc.implementation.getCollectionName("Item")`, which returns `"items"`, to resolve a collection name.
- Packages **cannot** add new document types or new embedding relationships, and cannot change core schemas. Put custom data in `flags` or in `system` (for types with `hasTypeData`).
- `Actor.hasTypeData` → true and `Playlist.hasTypeData` → false. `Doc.TYPES` returns the allowed sub-types, and `game.documentTypes` is the registry for the world.
- Classes: `foundry.documents.Actor` (client) extends `foundry.documents.BaseActor`. The legacy globals (`Actor`, `Item`, …) still exist. **Always call `Actor.implementation`**, which is the configured subclass.

Ref: `OVERVIEW.md` (Documents and Data), `api/modules/foundry.documents.md` (narrative guide), `api/variables/CONST.*_DOCUMENT_TYPES.md`.

## 2. CRUD

```js
// Create: static factory. `new Actor(...)` does NOT persist.
const actor = await Actor.implementation.create({ name: "Hero", type: "character" });
const items = await Item.implementation.createDocuments([{ name: "Sword", type: "weapon" }], { parent: actor });
await actor.createEmbeddedDocuments("Item", [{ name: "Shield", type: "armor" }]);
await Item.implementation.create({ name: "X", type: "weapon" }, { pack: "my-module.items" });

// Update: dot-notation keys allowed
await actor.update({ "system.hp.value": 10, name: "Renamed" });
await Actor.implementation.updateDocuments([{ _id: a.id, name: "A" }, { _id: b.id, name: "B" }]);
await actor.updateEmbeddedDocuments("Item", [{ _id: sword.id, "system.equipped": true }]);

// Delete
await item.delete();
await Actor.implementation.deleteDocuments([id1, id2]);
await actor.deleteEmbeddedDocuments("Item", [sword.id]);
await item.deleteDialog();                       // confirmation via DialogV2

// Several locations in one atomic request (all succeed or all fail)
await foundry.documents.modifyBatch([
  { action: "update", documentName: "Actor", updates: [{ _id: actor.id, "system.size": "big" }] },
  { action: "update", documentName: "Token", updates: [{ _id: tokId, width: 2 }], parent: scene }
]);
```

Signatures (`api/classes/foundry.abstract.Document.md`):
- `static create(data, operation?)` → `Promise<Doc | Doc[] | undefined>` (accepts an array too)
- `static createDocuments(data[], operation?)`, `static updateDocuments(updates[], operation?)`, `static deleteDocuments(ids[], operation?)` → `Promise<Doc[]>`
- `update(data?, operation?)` and `delete(operation?)` → `Promise<Doc | undefined>`
- `createEmbeddedDocuments(name, data[], op?)`, `updateEmbeddedDocuments(name, updates[], op?)`, `deleteEmbeddedDocuments(name, ids[], op?)`
- `getEmbeddedDocument(name, id, {strict, invalid})`, `getEmbeddedCollection(name)`
- `clone(data?, context?)` returns an ephemeral (unsaved) copy. `DocumentCloneOptions`: `save` (persist it, returns a Promise), `keepId`, `addSource`.
- `toObject(source = true)` returns plain source data, and `toObject(false)` returns prepared values.

### Operation options

| Option | Applies to | Meaning |
|---|---|---|
| `parent` | all | Parent document for embedded ops. Do not also pass `pack`, because the parent locates it. |
| `pack` | all | Compendium collection id, e.g. `"my-module.items"` |
| `parentUuid` | all | Parent by UUID when the instance is unavailable |
| `render` | all | Re-render dependent apps |
| `renderSheet` | create | Open the sheet of the created doc |
| `keepId` / `keepEmbeddedIds` | create | Keep the provided `_id`s instead of generating new ones |
| `diff` | update | Diff each update against current data and send only the changes |
| `recursive` | update | `false` replaces inner objects instead of merging them ("use with caution") |
| `noHook` | all | Skip dispatch of `pre*` hooks |
| `dryRun` | all | Run the workflow and return an empty result without writing |
| `deleteAll` | delete | Delete every document in the collection, regardless of id |
| `broadcast`, `modifiedTime`, `_result`… | – | Internal/server. Do not set them. |

You may add your **own JSON-serializable keys** to `operation`. They travel through the whole transaction, so hooks can read them as `options.myFlag`.
Ref: `api/interfaces/foundry.abstract.types.Database{Create,Update,Delete}Operation.md`.

### Update semantics and special operators (v14)

- Object fields are merged recursively. **Arrays are always replaced wholesale.** To change one element, read the array, modify a copy, and write the whole array back.
- **Delete a key:** use the global `_del` as the value. **Replace an object wholesale:** use the global `_replace(data)`. Both are documented in `api/modules/foundry.documents.md` as "globally available".
  ```js
  await actor.update({ "system.resources.oldKey": _del });          // remove key (e.g. in a TypedObjectField)
  await actor.update({ "system.stats": _replace({ str: 1, dex: 2 }) }); // no inner merge
  ```
- The underlying classes are `foundry.data.operators.ForcedDeletion` (`new ForcedDeletion()`) and `ForcedReplacement.create(value)`. `foundry.utils.mergeObject(a, b, {applyOperators: true})` applies them.
- **The legacy `"-=key"` / `"==key"` string syntax is deprecated in v14** (`api/functions/foundry.utils.applyDataOperators.md`). Do not write new code with it.

## 3. Finding documents: collections and UUIDs

```js
game.actors.get(id);  game.actors.getName("Hero");  game.items.filter(i => i.type === "weapon");
game.actors.get(id, { strict: true });          // throws if missing
game.collections.get("Actor");                  // WorldCollection by document name
Actor.implementation.get(id);                   // static get for World-level documents
actor.items.documentsByType;  actor.itemTypes;  // grouped by sub-type

doc.uuid;                                       // e.g. "Actor.abc123.Item.def456"
const doc  = await fromUuid(uuid);              // async; works for compendium docs too
const sync = fromUuidSync(uuid);                // sync; returns the INDEX ENTRY for compendium docs
foundry.utils.parseUuid(uuid);                  // { collection, documentType, id, ... }
foundry.utils.buildUuid({ documentName: "Actor", id });
```
- `fromUuid(uuid, {invalid, relative})` → `Promise<Doc|null>`. `fromUuidSync(uuid, {invalid, relative, strict})`. The canonical paths are `foundry.utils.fromUuid` and `foundry.utils.fromUuidSync`.
- `DocumentCollection`: `get`, `getInvalid`, `search({query, filters, exclude})`, `updateAll(transformation, condition?, options?)`, `importDocument`, plus `Collection` methods (`getName`, `find`, `filter`, `map`, `contents`, iteration).
- The world collection classes are `foundry.documents.collections.Actors`, `Items`, `Journal`, `Scenes`, and so on.

## 4. Compendium packs

```js
const pack = game.packs.get("my-module.monsters");   // CompendiumCollection, key = "<packageId>.<packName>"
pack.documentName; pack.locked; pack.collection;
await pack.getIndex({ fields: ["system.cr"] });      // cache extra fields in pack.index
pack.index.getName("Goblin");                        // { _id, name, img, type, uuid, ... } (sync)
const goblin = await pack.getDocument(id);           // full Document
const weapons = await pack.getDocuments({ type: "weapon" });   // query operators: __ne, __in
await pack.getDocuments({ _id__in: ids });
pack.getUuid(id);                                    // "Compendium.my-module.monsters.Actor.<id>"
await game.actors.importFromCompendium(pack, id, updateData?, options?);
await pack.importAll({ folderName: "Monsters" });
await actor.toCompendium(pack, { clearFlags: false });  // returns cleaned data object, does not write
```
- Documents in packs are **not** fully loaded. Use `pack.index` or `fromUuidSync` for sync lookups, and `fromUuid`/`getDocument(s)` to load them. The `ready` hook is the usual place to extend indexes.
- Writing to a pack means passing `{pack: pack.collection}` to `create`/`createDocuments`. A locked pack (`pack.locked`) rejects edits.
- `FromCompendiumOptions`: `clearFolder, clearOwnership, clearSort, clearState, keepId, dialog`. `ToCompendiumOptions` adds `clearFlags, clearSource`.
Ref: `api/classes/foundry.documents.collections.CompendiumCollection.md`, `articles/compendium.md`.

## 5. Flags

```js
await doc.setFlag(MODULE_ID, "lastRoll", { total: 17 });   // Promise<Doc>
doc.getFlag(MODULE_ID, "lastRoll");                       // sync read
await doc.unsetFlag(MODULE_ID, "lastRoll");
await doc.update({ [`flags.${MODULE_ID}.a`]: 1, [`flags.${MODULE_ID}.b`]: 2 }); // several at once
```
- Scope: `"core"` for core, **your package id** for modules and systems, and `"world"` for world scripts. Setting a flag value to `null` deletes it, per the `setFlag` docs.
- `setFlag`/`unsetFlag` are `update` wrappers, so they trigger the full update workflow and hooks. Never call them during data preparation.

## 6. Lifecycle hooks and document overrides

**Global hooks** (replace `Document` with the name, e.g. `preCreateItem`, `updateActor`, `deleteToken`):

| Hook | Args | Runs on | Notes |
|---|---|---|---|
| `preCreate<Doc>` | `(document, data, options, userId)` | **requesting client only** | Mutate with `document.updateSource({...})`. Return `false` to cancel. |
| `preUpdate<Doc>` | `(document, changed, options, userId)` | requesting client only | Mutate `changed` in place. Return `false` to cancel. |
| `preDelete<Doc>` | `(document, options, userId)` | requesting client only | Return `false` to cancel. |
| `create<Doc>` | `(document, options, userId)` | **all clients** | |
| `update<Doc>` | `(document, changed, options, userId)` | all clients | `changed` is the diff |
| `delete<Doc>` | `(document, options, userId)` | all clients | |

```js
Hooks.on("updateActor", (actor, changed, options, userId) => {
  if (userId !== game.user.id) return;               // run side effects once, on the originating client
  if (!foundry.utils.hasProperty(changed, "system.hp.value")) return;
  // ...
});
```

**Subclass overrides** (on a `documentClass` subclass or on a `TypeDataModel`, which is called by the document). Always call `super`:

```js
async _preCreate(data, options, user) {        // return false to exclude this doc
  if ((await super._preCreate(data, options, user)) === false) return false;
  this.updateSource({ img: "icons/svg/sword.svg" });   // modify pending doc via updateSource
}
async _preUpdate(changes, options, user) { return super._preUpdate(changes, options, user); }
async _preDelete(options, user) { return super._preDelete(options, user); }
_onCreate(data, options, userId) { super._onCreate(data, options, userId); }   // all clients
_onUpdate(changed, options, userId) { super._onUpdate(changed, options, userId); }
_onDelete(options, userId) { super._onDelete(options, userId); }
```
- There are batch-level static versions too: `static async _preCreateOperation(documents, operation, user)`, `_preUpdateOperation`, `_preDeleteOperation` (return `false` to cancel the whole batch), and `_onCreateOperation`/`_onUpdateOperation`/`_onDeleteOperation`. They run after the per-document methods.
- Parent documents get `_preCreateDescendantDocuments` / `_onCreateDescendantDocuments` and the matching update/delete variants (see `api/classes/foundry.ClientDocument.md`).
Ref: `HOOKS.md`, `api/functions/hookEvents.preCreateDocument.md` (and the update/delete pages).

## 7. Data preparation

From `ClientDocument#prepareData` (`api/classes/foundry.ClientDocument.md`), this order runs on every create, update, or reset:
1. `reset` → `_initialize` → `prepareData()`
2. `system.prepareBaseData()` (TypeDataModel), then `document.prepareBaseData()`
3. `prepareEmbeddedDocuments()`. For Actors, ActiveEffects are applied after base data and before derived data.
4. `system.prepareDerivedData()` (TypeDataModel), then `document.prepareDerivedData()`

(The core docs list step 7 as "TypeDataModel#prepareBaseData". That is a typo. `TypeDataModel#prepareDerivedData` is documented as "Called before ClientDocument#prepareDerivedData".)

Rules:
- Prefer overriding `prepareBaseData`/`prepareDerivedData` on the **TypeDataModel**. Use `this.parent` to reach the document, for example `this.parent.items`.
- Use plain assignment for derived values (`this.hp.bloodied = …`). **Never** call `update`/`setFlag` in prep, because that causes infinite loops. Prep must be idempotent, since it may run more than once.
- v14: a field defined with `{persisted: false}` is initialized but not stored, and ActiveEffects can target it. This replaces most `prepareBaseData` "initialize to 0" code.

## 8. Ownership and permissions

```js
const { NONE, LIMITED, OBSERVER, OWNER, INHERIT } = CONST.DOCUMENT_OWNERSHIP_LEVELS; // 0,1,2,3,-1
doc.isOwner; doc.limited; doc.visible; doc.permission;   // current user
doc.hasPlayerOwner;                                      // any non-GM owner
doc.testUserPermission(user, "OBSERVER");                // >= level; {exact: true} for equality
doc.getUserLevel(user);                                  // explicit level in doc.ownership (GM may be NONE)
doc.canUserModify(user, "update", data);
Actor.implementation.canUserCreate(user);
game.user.isGM; game.users.activeGM; game.user.isActiveGM;  // elect one GM for automation
await doc.update({ ownership: { default: LIMITED, [userId]: OWNER } });
```
- Embedded documents defer to their parent. Compendium content uses role-based ownership.
- `CONST.DOCUMENT_META_OWNERSHIP_LEVELS` (`DEFAULT: -20`, `NOCHANGE: -10`) are UI-only and never stored.
- Players can only write documents they own. For a GM-only write, route it through the active GM over a socket (see the `foundry-module-runtime` skill).

## 9. DataModel / TypeDataModel

```js
const { SchemaField, NumberField, StringField, HTMLField, ArrayField, SetField, BooleanField } = foundry.data.fields;
export class CharacterData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["MYSYS.Character"];   // FIELDS.<key>.label / .hint
  static defineSchema() {
    return {
      hp: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
        max:   new NumberField({ required: true, integer: true, min: 0, initial: 10 })
      }),
      biography: new HTMLField(),
      tags: new SetField(new StringField()),
      armorBonus: new NumberField({ initial: 0, persisted: false })   // AE target, not stored
    };
  }
  prepareDerivedData() { this.hp.pct = this.hp.value / this.hp.max; }
}
```
Members: `static defineSchema()`, `static migrateData(source, options)`, `static cleanData(data, options)`, `static validateJoint(data)`, `static shimData`, `static fromSource(source)`, `updateSource(changes, options)` (local only, no DB write), `validate(options)`, `toObject()`, `reset()`, `clone()`, `getFieldForProperty("a.b")`, `parent`, `schema`, `_source`. TypeDataModel adds `prepareBaseData`, `prepareDerivedData`, `_preCreate/_preUpdate/_preDelete/_onCreate/_onUpdate/_onDelete`, `toEmbed`. `doc.system.modelProvider` (from `articles/module-sub-types.md`, not on the class page) returns the System or Module providing the sub-type.

### Most-used fields (`foundry.data.fields.*`)

| Field | Constructor | Notes |
|---|---|---|
| `StringField` | `(options)` | `blank`, `trim`, `choices`, `textSearch` |
| `NumberField` | `(options)` | `integer`, `min`, `max`, `step`, `positive`, `choices` |
| `BooleanField` | `(options)` | |
| `SchemaField` | `(fields, options)` | nested object with known keys |
| `ArrayField` | `(elementField, options)` | `min`, `max`. Updates replace the whole array. |
| `SetField` | `(elementField, options)` | initializes a `Set` |
| `TypedObjectField` | `(elementField, options)` | unknown keys, known value shape. `validateKey`, `expandKeys`. Delete keys with `_del`. |
| `ObjectField` | `(options)` | free-form object |
| `HTMLField` | `(options)` | **must** be listed in manifest `htmlFields` for sanitization |
| `FilePathField` | `(options)` | `categories: ["IMAGE", …]`, `base64`, `wildcard`, `virtual` |
| `ColorField`, `JSONField`, `AngleField`, `AlphaField`, `HueField` | `(options)` | specialised strings/numbers |
| `ForeignDocumentField` | `(DocumentClass, options)` | stores an id. Use `idOnly: true` if it is not a world collection. |
| `DocumentUUIDField` | `(options)` | `type`, `embedded`, `relative` |
| `EmbeddedDataField` | `(ModelClass, options)` | nested DataModel |
| `TypedSchemaField` | `(types, options)` | union discriminated by `type` |
| `AnyField` | `(options)` | avoid unless needed |

**Common options (`DataFieldOptions`):** `required`, `nullable`, `initial` (value or function), `label`, `hint`, `placeholder`, `readonly`, `gmOnly`, `persisted` (v14), `validate`, `validationError`. The `foundry.data` narrative says `required` and `nullable` default to `false` for most fields. A field that is required, not nullable, and has no `initial` throws when it is missing. `EmbeddedCollectionField`/`EmbeddedDocumentField` are **not** for package use.

Ref: `api/modules/foundry.data.md` (narrative), `api/modules/foundry.data.fields.md`, `api/interfaces/foundry.data.types.*FieldOptions.md`.

## 10. Registering sub-types

1. Manifest (`system.json` or `module.json`):
   ```json
   "documentTypes": { "Actor": { "character": { "htmlFields": ["biography"], "gmOnlyFields": ["gmNotes"],
                                                 "filePathFields": { "crest": ["IMAGE"] } } } }
   ```
   Paths are relative to `system`, and `*` wildcards work inside Array or TypedObject fields (`ServerSanitizationFields`).
2. `init` hook: `CONFIG.Actor.dataModels.character = CharacterData;`
   - **Module sub-types are auto-prefixed**, so register `"my-module.quest"`: `Object.assign(CONFIG.JournalEntryPage.dataModels, {"my-module.quest": QuestModel})`.
3. i18n: `"TYPES": { "Actor": { "character": "Character" } }`. For modules the key is `TYPES.JournalEntryPage.my-module.quest`.
4. ActiveEffect sub-types subclass `foundry.data.ActiveEffectTypeDataModel` instead of TypeDataModel.
5. Disabling a module hides every document of its sub-types (they become invalid). Prefer flags or an alternate sheet when that is enough.
Ref: `articles/system-data-models.md`, `articles/module-sub-types.md`, `articles/system-development.md`.

## 11. migrateData / cleanData

```js
static migrateData(source) {
  if ("hp" in source && typeof source.hp === "number") source.hp = { value: source.hp, max: source.hp };
  return super.migrateData(source);
}
```
- `migrateData` runs on source read from disk **and on every update delta**, so `source` may be partial. Do not assume a missing key means old data.
- `static cleanData(data, options)` cleans input to fit the schema. `DataModelCleaningOptions` include `partial`, `prune`, `expand`, `migrate`, `persisted`, and `copy`. Override `static _cleanData(data, options, _state)` (protected, in-place) for custom imputation.
- `validateJoint(data)` throws for cross-field rule violations.
- Persisted migrations of world data are still the package's job: loop over docs and `update` them, gated on a version setting and `foundry.utils.isNewerVersion`.

## 12. ActiveEffects (v14 shape)

```js
await actor.createEmbeddedDocuments("ActiveEffect", [{
  name: "Bless", img: "icons/svg/aura.svg", origin: item.uuid,
  duration: { value: 3, units: "rounds" },
  system: { changes: [{ key: "system.attributes.ac.bonus", type: "add", value: "1", phase: "initial" }] }
}]);
```
- In v14, `BaseActiveEffect.defineSchema()` has **no top-level `changes`**. Changes live in `system.changes` (`ActiveEffectTypeDataModel`). The `ActiveEffectData` typedef still lists `changes`. I could not verify whether that is a migration shim, so write the `system.changes` form for new data.
- Change `type` keys come from `CONST.ACTIVE_EFFECT_CHANGE_TYPES`: `custom 0, multiply 10, add 20, subtract 20, downgrade 30, upgrade 40, override 50` (the numbers are default priorities). **`CONST.ACTIVE_EFFECT_MODES` does not exist in v14.**
- `phase`: `CONST.ACTIVE_EFFECT_CHANGE_PHASES` = `["initial", "final"]`. Custom phases go in `CONFIG.ActiveEffect.phases`, and your code must call `actor.applyActiveEffects("myPhase")`.
- Duration `units`: `CONST.ACTIVE_EFFECT_DURATION_UNITS` (`years…seconds, rounds, turns`). Use `duration.expiry` for expiry events and `CONFIG.ActiveEffect.expiryAction`.
- Other fields: `disabled`, `transfer` (Item → Actor), `statuses` (Set), `showIcon`, `tint`, `description`, `start`.
- Actor helpers: `actor.appliedEffects`, `actor.allApplicableEffects()` (generator, includes transferred item effects), `actor.temporaryEffects`, `actor.statuses`, `actor.overrides`, `await actor.toggleStatusEffect("prone", {active, overlay})`.
- Effect helpers: `effect.active`, `effect.isSuppressed`, `effect.isTemporary`, `effect.target`, `effect.modifiesActor`, `await ActiveEffect.implementation.fromStatusEffect(statusId)`. `item.transferredEffects`.
- The `applyActiveEffect(actor, change, current, delta, changes)` hook fires for **custom** change types.
Ref: `api/classes/foundry.documents.ActiveEffect.md`, `api/variables/CONFIG.ActiveEffect.md`, `articles/active-effects.md` (user-facing, older terminology).

## 13. Custom document classes

```js
export class MyActor extends Actor {               // or foundry.documents.Actor
  getRollData() { return { ...super.getRollData(), flags: this.flags }; }
  async applyDamage(n) { return this.update({ "system.hp.value": this.system.hp.value - n }); }
}
Hooks.once("init", () => { CONFIG.Actor.documentClass = MyActor; });
```
- There is **one** class per document type. Systems own this. Modules that replace `documentClass` will clash, so prefer hooks, TypeDataModel methods, or libWrapper.
- Always create through `Actor.implementation` so the configured class is used.
- `CONFIG.Actor` also holds `dataModels`, `trackableAttributes`, `typeLabels`, `typeIcons`, `compendiumIndexFields`, and `collection`.

## v14 gotchas

- `-=key` / `==key` are deprecated. Use `_del` / `_replace(...)` (`foundry.data.operators`).
- ActiveEffect is a primary (compendium-storable) type. Its changes live in `system.changes` with `type`/`phase`, not `mode`.
- New `Level` embedded document type (inside Scene) and `persisted: false` fields.
- Manifest `gmOnlyFields` block owner (non-GM) writes to listed `system` paths.
- `ClientDocument.fromImport(source)` must be used to import data from older core versions, because it applies legacy migrations.
- Sheets are ApplicationV2 (`doc.sheet`). See the `foundry-applications` skill.
