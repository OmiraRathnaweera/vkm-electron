/*
 * Loads the HTML files in src/Components and src/Pages (read by the main
 * process) and hands out a fresh copy of any of them on demand.
 *
 *   await Fragments.preload();
 *   const el = Fragments.create('Pages/ledger');   // new element every call
 */
(function () {
  "use strict";

  const cache = {};

  async function preload() {
    Object.assign(cache, await window.api.loadFragments());
  }

  function create(name) {
    const html = cache[name];
    if (typeof html !== "string")
      throw new Error("Missing UI fragment: " + name);
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim(); // static app files only - never user data
    return tpl.content.firstElementChild;
  }

  window.Fragments = { preload, create };
})();
