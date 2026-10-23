# Data models: full example (Foundry v14)

Pattern drawn from `articles/system-data-models.md`, `articles/system-development.md`, `articles/module-sub-types.md` and `api/modules/foundry.data.md` (all under `../foundry-api-reference/reference/`).

## 1. Manifest (`system.json` or `module.json`)

```json
{
  "documentTypes": {
    "Actor": {
      "hero":  { "htmlFields": ["biography.value", "biography.gm"], "gmOnlyFields": ["biography.gm"] },
      "pawn":  {}
    },
    "Item": {
      "weapon": { "filePathFields": { "icon": ["IMAGE"] } },
      "spell":  { "htmlFields": ["description"] }
    }
  }
}
```

- `htmlFields` (required for any `HTMLField`), `filePathFields` (base64 extraction), and `gmOnlyFields`. Paths are relative to `system`, and `*` is a wildcard inside Array or TypedObject fields.
- In a **module**, these sub-types become `my-module.hero` and so on. Register and reference them with that prefix.

## 2. Models (`module/data-models.mjs`)

```js
const {
  SchemaField, NumberField, StringField, HTMLField, BooleanField,
  ArrayField, SetField, TypedObjectField, FilePathField, DocumentUUIDField
} = foundry.data.fields;

/** Reusable helper: a value/max resource */
const resource = (initial = 10) => new SchemaField({
  value: new NumberField({ required: true, integer: true, min: 0, initial }),
  max:   new NumberField({ required: true, integer: true, min: 0, initial })
});

/** Shared base for all actor types (class inheritance of schemas) */
export class BaseActorModel extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["MYSYS.Actor"];   // MYSYS.Actor.FIELDS.<path>.label / .hint

  static defineSchema() {
    return {
      hp: resource(10),
      biography: new SchemaField({
        value: new HTMLField(),
        gm: new HTMLField()
      }),
      // v14: not stored, initialized every prep, targetable by ActiveEffects
      acBonus: new NumberField({ initial: 0, persisted: false })
    };
  }

  /** Before ActiveEffects / embedded docs */
  prepareBaseData() {
    super.prepareBaseData();
    this.encumbrance = { value: 0, max: 0 };   // keep AE "add" changes from producing NaN
  }

  /** After ActiveEffects */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.hp.value = Math.clamp(this.hp.value, 0, this.hp.max);
    this.encumbrance.value = this.parent.items.reduce((t, i) => t + (i.system.weight ?? 0), 0);
  }
}

export class HeroModel extends BaseActorModel {
  static defineSchema() {
    const schema = super.defineSchema();
    schema.xp = new NumberField({ required: true, integer: true, min: 0, initial: 0 });
    schema.skills = new TypedObjectField(new SchemaField({
      rank: new NumberField({ integer: true, min: 0, initial: 0 }),
      trained: new BooleanField()
    }));                                       // keys unknown in advance; delete one with _del
    schema.tags = new SetField(new StringField());
    return schema;
  }

  /** Runs on raw source AND on update deltas, so `source` may be partial */
  static migrateData(source) {
    if (typeof source.hp === "number") source.hp = { value: source.hp, max: source.hp };
    if ("level" in source && !("xp" in source)) source.xp = Number(source.level) * 100;
    return super.migrateData(source);
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this.level = Math.floor(this.xp / 100);
  }

  /** Type-specific lifecycle hooks are called by the owning document */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    this.parent.updateSource({ "prototypeToken.actorLink": true });
  }

  get dead() { return this.hp.value <= 0; }
}

export class PawnModel extends BaseActorModel {}

export class WeaponModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      damage: new StringField({ required: true, blank: false, initial: "1d6" }),
      kind: new StringField({ required: true, initial: "melee", choices: ["melee", "ranged"] }),
      weight: new NumberField({ min: 0, initial: 1 }),
      icon: new FilePathField({ required: false, categories: ["IMAGE"] }),
      properties: new ArrayField(new StringField()),
      sourceUuid: new DocumentUUIDField({ type: "Item" })
    };
  }
}

export class SpellModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new HTMLField(),
      circle: new NumberField({ required: true, integer: true, min: 0, max: 9, initial: 1 })
    };
  }
}
```

Notes:
- If the `choices` list is something other packages may extend, do not use `choices`. Validate in the sheet instead. Invalid data after a module is disabled is hard for users to fix (advice from `foundry.data` narrative).
- `ForeignDocumentField(Item, { idOnly: true })` stores an id for a non-world collection. Prefer `DocumentUUIDField` for compendium references.
- `EmbeddedCollectionField` and `EmbeddedDocumentField` are not for package use.

## 3. Document classes (`module/documents.mjs`)

```js
export class SystemActor extends Actor {
  /** Add flags to roll data so formulas can use @flags.<scope>.<key> */
  getRollData() {
    const data = { ...super.getRollData(), flags: this.flags };
    if (this.system.modifyRollData instanceof Function) this.system.modifyRollData(data);
    return data;
  }

  async applyDamage(amount) {
    amount = Math.max(1, Math.round(amount));
    const { value } = this.system.hp;
    await this.update({ "system.hp.value": value - amount });
    await ChatMessage.implementation.create({ content: `${this.name} took ${amount} damage!` });
  }

  /** Document-wide logic for all sub-types; call super */
  prepareDerivedData() {
    super.prepareDerivedData();
    // ...
  }

  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId === game.user.id && foundry.utils.hasProperty(changed, "system.hp.value") && this.system.dead) {
      this.toggleStatusEffect("dead", { active: true, overlay: true });
    }
  }
}

export class SystemItem extends Item {
  get isWeapon() { return this.type === "weapon"; }
}
```

## 4. Entry point (`mysystem.mjs`)

```js
import { SystemActor, SystemItem } from "./module/documents.mjs";
import { HeroModel, PawnModel, WeaponModel, SpellModel } from "./module/data-models.mjs";

Hooks.once("init", () => {
  CONFIG.Actor.documentClass = SystemActor;    // systems only, since there is one class per type
  CONFIG.Item.documentClass = SystemItem;

  Object.assign(CONFIG.Actor.dataModels, { hero: HeroModel, pawn: PawnModel });
  Object.assign(CONFIG.Item.dataModels, { weapon: WeaponModel, spell: SpellModel });

  CONFIG.Actor.trackableAttributes = {
    hero: { bar: ["hp"], value: ["xp"] },
    pawn: { bar: ["hp"], value: [] }
  };
});
```

For a **module** sub-type:

```js
Hooks.once("init", () => {
  Object.assign(CONFIG.JournalEntryPage.dataModels, { "my-module.quest": QuestModel });
});
// en.json: { "TYPES": { "JournalEntryPage": { "my-module.quest": "Quest" } } }
```

## 5. i18n for sub-types and fields

```json
{
  "TYPES": { "Actor": { "hero": "Hero", "pawn": "Pawn" }, "Item": { "weapon": "Weapon", "spell": "Spell" } },
  "MYSYS": { "Actor": { "FIELDS": { "hp": { "label": "Hit Points" }, "xp": { "label": "Experience", "hint": "Earned XP" } } } }
}
```

Models registered for a document sub-type are localized automatically. Call `Localization.localizeDataModel(Model)` in `i18nInit` only for other models, such as settings.

## 6. World-data migration (persisted)

`migrateData` fixes data in memory every time it is read. To rewrite stored data permanently, run a one-off GM migration:

```js
Hooks.once("ready", async () => {
  if (!game.user.isActiveGM) return;
  const last = game.settings.get("mysys", "schemaVersion");     // register this world setting at init
  if (!foundry.utils.isNewerVersion(game.system.version, last)) return;
  for (const actor of game.actors) {
    const updates = {};
    if (typeof actor._source.system.hp === "number") updates["system.hp"] = { value: actor._source.system.hp, max: actor._source.system.hp };
    if (!foundry.utils.isEmpty(updates)) await actor.update(updates);
  }
  await game.settings.set("mysys", "schemaVersion", game.system.version);
});
```

`foundry.utils.isEmpty` and `isNewerVersion` are in `api/functions/`. For the settings API (`game.settings.register/get/set`), see `api/classes/foundry.helpers.ClientSettings.md` and the `foundry-module-runtime` skill.
