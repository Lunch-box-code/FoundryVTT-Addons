# Documents cookbook (Foundry v14)

Plain JS ES module snippets. Every API used here is documented in `../foundry-api-reference/reference/`.
`MODULE_ID` stands for your package id.

```js
const MODULE_ID = "my-module";
```

## Create

```js
// World actor, opening its sheet
const hero = await Actor.implementation.create(
  { name: "Hero", type: "character", img: "icons/svg/mystery-man.svg" },
  { renderSheet: true }
);

// Several world items at once
const created = await Item.implementation.createDocuments([
  { name: "Sword", type: "weapon" },
  { name: "Shield", type: "armor" }
]);

// Owned (embedded) items. These two forms are equivalent.
await Item.implementation.createDocuments([{ name: "Dagger", type: "weapon" }], { parent: hero });
await hero.createEmbeddedDocuments("Item", [{ name: "Dagger", type: "weapon" }]);

// Copy a world item onto an actor (toObject() = plain source data)
await hero.createEmbeddedDocuments("Item", [game.items.getName("Sword").toObject()]);

// Keep explicit ids (e.g. when re-creating known content)
await Item.implementation.create({ _id: "abcdefghij123456", name: "Fixed", type: "weapon" }, { keepId: true });

// Custom operation keys travel to hooks as options.<key>
await hero.update({ "system.hp.value": 0 }, { [MODULE_ID]: { reason: "trap" } });
```

## Update

```js
await hero.update({ "system.hp.value": 5 });                        // dot-notation
await hero.update({ system: { hp: { value: 5 } } });                 // nested object form, merged recursively

// Arrays are replaced wholesale, so rebuild them
const tags = [...hero.system.tagsArray, "new"];
await hero.update({ "system.tagsArray": tags });

// Delete a key / replace an object (v14 globals; "-=" and "==" are deprecated)
await hero.update({ "system.resources.mana": _del });
await hero.update({ "system.stats": _replace({ str: 10, dex: 10 }) });

// Many embedded docs
const updates = hero.items.filter(i => i.type === "weapon").map(i => ({ _id: i.id, "system.equipped": false }));
await hero.updateEmbeddedDocuments("Item", updates);

// Whole world collection
await game.actors.updateAll({ "system.hp.value": 10 }, a => a.type === "character");
await game.actors.updateAll(a => ({ name: a.name.trim() }));          // function transformation

// Local-only change (no database write), e.g. inside _preCreate or preCreate hooks
doc.updateSource({ "system.rarity": "common" });
```

## Delete

```js
await hero.delete();
await Actor.implementation.deleteDocuments([idA, idB]);
await hero.deleteEmbeddedDocuments("Item", hero.items.filter(i => i.system.broken).map(i => i.id));
await hero.deleteDialog();
```

## Atomic multi-location batch

```js
await foundry.documents.modifyBatch([
  { action: "update", documentName: "Actor", updates: [{ _id: hero.id, "system.size": "large" }] },
  { action: "create", documentName: "Item", data: [{ name: "Cloak", type: "armor" }], parent: hero },
  { action: "delete", documentName: "Token", ids: [tokenId], parent: canvas.scene }
]);
// A cancellation (_pre* returning false) or a throw cancels the whole batch. Ops cannot reference earlier results.
```

## Flags

```js
await hero.setFlag(MODULE_ID, "favorite", true);
const fav = hero.getFlag(MODULE_ID, "favorite") ?? false;
await hero.unsetFlag(MODULE_ID, "favorite");

// Bulk flags in one update, or on many embedded docs
await hero.update({ [`flags.${MODULE_ID}`]: { favorite: true, color: "#ff0000" } });
await hero.updateEmbeddedDocuments("Item",
  hero.items.map(i => ({ _id: i.id, [`flags.${MODULE_ID}.seen`]: true })));
```

## UUIDs

```js
const uuid = item.uuid;                       // "Actor.<id>.Item.<id>" or "Compendium.<pkg>.<pack>.Item.<id>"
const doc = await fromUuid(uuid);             // full doc (loads compendium docs)
const quick = fromUuidSync(uuid);             // world doc, or compendium INDEX entry (plain object)
if (quick && !(quick instanceof foundry.abstract.Document)) { /* index entry: has name, img, type, uuid */ }
const parts = foundry.utils.parseUuid(uuid);

// Drag/drop
const dropped = await Item.implementation.fromDropData(data);  // data from a DataTransfer event
const dragData = item.toDragData();
```

## Compendium packs

```js
const pack = game.packs.get(`${MODULE_ID}.monsters`);
if (!pack) return;

// Index-based browsing (cheap)
await pack.getIndex({ fields: ["system.cr", "system.type"] });
const lowCr = pack.index.filter(e => (e.system?.cr ?? 0) <= 1);

// Load documents
const goblin = await pack.getDocument(lowCr[0]._id);
const weapons = await pack.getDocuments({ type: "weapon" });           // query object (field equality)
const gear = await pack.getDocuments({ type__in: ["weapon", "armor"] });
const notWeapons = await pack.getDocuments({ type__ne: "weapon" });
const someIds = await pack.getDocuments({ _id__in: ids });

// Import to world
const imported = await game.actors.importFromCompendium(pack, goblin.id, { name: "Goblin Boss" });
await pack.importAll({ folderName: "Monsters" });

// Write into an (unlocked) pack
if (!pack.locked) {
  await Actor.implementation.create(hero.toCompendium(pack), { pack: pack.collection });
  await Actor.implementation.updateDocuments([{ _id: goblin.id, name: "Goblin" }], { pack: pack.collection });
}

// Extend indexes for all packs once, at ready
Hooks.once("ready", async () => {
  for (const p of game.packs.filter(p => p.documentName === "Item")) await p.getIndex({ fields: ["system.price"] });
});
```

## Lifecycle hooks

```js
// Defaults on creation (requesting client only)
Hooks.on("preCreateItem", (item, data, options, userId) => {
  if (item.parent?.documentName !== "Actor") return;
  if (!foundry.utils.hasProperty(data, `flags.${MODULE_ID}.acquired`)) {
    item.updateSource({ [`flags.${MODULE_ID}.acquired`]: game.time.worldTime });
  }
});

// Veto / adjust updates
Hooks.on("preUpdateActor", (actor, changed, options, userId) => {
  const hp = foundry.utils.getProperty(changed, "system.hp.value");
  if (hp === undefined) return;
  if (hp < 0) foundry.utils.setProperty(changed, "system.hp.value", 0);   // mutate in place
  if (options[MODULE_ID]?.locked) return false;                            // cancel
});

// React once (all clients get the hook; only the initiator acts)
Hooks.on("updateActor", (actor, changed, options, userId) => {
  if (userId !== game.user.id) return;
  if (foundry.utils.getProperty(changed, "system.hp.value") === 0) {
    actor.toggleStatusEffect("dead", { active: true, overlay: true });
  }
});

// GM-side automation regardless of who initiated
Hooks.on("createCombatant", (combatant, options, userId) => {
  if (!game.user.isActiveGM) return;
  // ...
});

Hooks.on("deleteItem", (item, options, userId) => { /* cleanup */ });
```

## Ownership checks

```js
const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
if (!actor.isOwner) return ui.notifications.warn("You do not own this actor.");
const observers = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OBSERVER"));
const exactLimited = actor.testUserPermission(user, L.LIMITED, { exact: true });

// Give a player ownership
await actor.update({ [`ownership.${user.id}`]: L.OWNER });
await actor.update({ "ownership.default": L.LIMITED });
```

## Searching collections

```js
game.items.search({ query: "sword" });
game.actors.find(a => a.hasPlayerOwner && a.type === "character");
for (const actor of game.actors) { /* iterate */ }
game.actors.contents;   // array
```
