/**
 * __TITLE__ entry point. Loaded as an ES module via the "esmodules" manifest key.
 */
export const MODULE_ID = "__ID__";

const log = (...args) => console.log(`${MODULE_ID} |`, ...args);

Hooks.once("init", () => {
  log("Initializing");
  // Register settings, keybindings, CONFIG changes, document/sheet classes, Handlebars partials here.
  game.settings.register(MODULE_ID, "enabled", {
    name: `${MODULE_ID}.settings.enabled.name`,
    hint: `${MODULE_ID}.settings.enabled.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false
  });
});

Hooks.once("setup", () => {
  // Game data is initialized but the canvas and UI are not yet rendered.
});

Hooks.once("ready", () => {
  // Everything is loaded: game.user, game.actors, ui.* are all available.
  // Expose a public API for other packages and macros.
  game.modules.get(MODULE_ID).api = {};
  log("Ready");
});
