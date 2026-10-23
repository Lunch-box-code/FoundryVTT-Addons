/**
 * DialogV2 factory methods and ApplicationV2 render/header hooks (Foundry VTT v14).
 * Everything here is plain DOM: no jQuery.
 */

const { DialogV2 } = foundry.applications.api;

/* -------------------------------------------- */
/*  DialogV2                                    */
/* -------------------------------------------- */

/** Yes/No. Resolves true/false, or null if dismissed and rejectClose is false. */
export async function confirmDelete(name) {
  return DialogV2.confirm({
    window: { title: "Delete?" },
    content: `<p>Delete <strong>${foundry.utils.escapeHTML(name)}</strong>?</p>`,
    yes: { label: "Delete", icon: "fa-solid fa-trash" },   // overrides the default yes button
    no: { label: "Keep" },
    rejectClose: false,
    modal: true
  });
}

/** Single OK button. Resolves the button action id or that button's callback return value. */
export async function notice(text) {
  return DialogV2.prompt({
    window: { title: "Notice" },
    content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
    ok: { label: "Got it" },
    rejectClose: false
  });
}

/** Form input. Resolves an object keyed by the inputs' `name` attributes, or null if cancelled. */
export async function askForBonus() {
  // Build content with the form field helpers: an HTMLDivElement is trusted (not cleaned).
  const { createFormGroup, createNumberInput, createSelectInput } = foundry.applications.fields;
  const content = document.createElement("div");
  content.append(
    createFormGroup({
      label: "Bonus",
      input: createNumberInput({ name: "bonus", value: 0 })
    }),
    createFormGroup({
      label: "Ability",
      input: createSelectInput({
        name: "ability",
        options: [{ value: "str", label: "Strength" }, { value: "dex", label: "Dexterity" }]
      })
    })
  );
  const data = await DialogV2.input({
    window: { title: "Roll Bonus" },
    content,
    ok: { label: "Roll", icon: "fa-solid fa-dice-d20" },
    rejectClose: false
  });
  return data;   // e.g. { bonus: 2, ability: "dex" } or null
}

/** Arbitrary buttons. Each button's callback return value becomes the resolved value. */
export async function chooseRollMode() {
  return DialogV2.wait({
    window: { title: "Roll mode" },
    content: "<p>How should this be rolled?</p>",
    buttons: [
      { action: "normal", label: "Normal", default: true },
      { action: "adv", label: "Advantage" },
      {
        action: "custom",
        label: "Custom",
        // (event, button, dialog) => value. button.form gives access to the dialog's form.
        callback: (event, button, dialog) => "custom"
      }
    ],
    // Synchronous render callback: attach listeners to the dialog's content here.
    render: (event, dialog) => console.log("dialog rendered", dialog.element),
    rejectClose: false
  });
}

/** Ask another connected user (e.g. the GM). Callback options are not supported here. */
export async function askGM() {
  const gm = game.users.activeGM;
  if ( !gm ) return null;
  return DialogV2.query(gm, "confirm", { content: "<p>Allow this action?</p>" });
}

/* -------------------------------------------- */
/*  Render hooks                                */
/* -------------------------------------------- */

/**
 * renderApplicationV2 signature: (application, element: HTMLElement, context, options).
 * Substitute any class name in the inheritance chain: renderActorSheetV2, renderMyApp, ...
 * Each class in the chain fires its own hook, so this runs for every ActorSheetV2 subclass.
 */
Hooks.on("renderActorSheetV2", (app, element, context, options) => {
  if ( !app.isEditable ) return;
  // Hooks run on every render (incl. partial re-renders). Guard against duplicate injection.
  if ( element.querySelector(".my-module-roll") ) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "my-module-roll";
  button.innerHTML = `<i class="fa-solid fa-dice"></i> Quick Roll`;
  button.addEventListener("click", () => console.log("roll for", app.document.name));

  element.querySelector(".window-content")?.prepend(button);
});

/** Add an entry to the header controls menu of any ApplicationV2. */
Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
  controls.push({
    icon: "fa-solid fa-scroll",
    label: "Session Notes",
    onClick: (event, target) => console.log("clicked header control for", app.document.name)
  });
});

/** Fires when any ApplicationV2 closes. Substitute a class name to narrow it. */
Hooks.on("closeApplicationV2", app => {
  // cleanup per-app state here
});
