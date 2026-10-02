"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const katalog = path.resolve(__dirname, "..");
const klucz = "taryfa-dynamiczna:konfiguracja:v1";

function strona(t, zapis, blokada = false, bezDanych = false) {
  const bledy = [];
  const log = new VirtualConsole();
  log.on("jsdomError", (e) => bledy.push(e));
  // Tylko DOM w pamięci. Bez przeglądarki, sieci i ładowania zewnętrznych zasobów.
  const dom = new JSDOM(
    fs.readFileSync(path.join(katalog, "index.html"), "utf8"),
    {
      url: "https://test.invalid/",
      runScripts: "outside-only",
      virtualConsole: log,
    },
  );
  t.after(() => {
    dom.window.close();
    assert.deepEqual(bledy, []);
  });
  const { window: w } = dom;
  if (zapis !== undefined) w.localStorage.setItem(klucz, zapis);
  if (blokada)
    Object.defineProperty(w, "localStorage", {
      get() {
        throw new Error("Zablokowany storage");
      },
    });
  for (const plik of [
    ...(bezDanych ? [] : ["dane_rdn.js"]),
    "silnik.js",
    "formularz.js",
  ])
    w.eval(fs.readFileSync(path.join(katalog, plik), "utf8"));
  const ustaw = (id, value) => {
    const pole = w.document.getElementById(id);
    if (pole.type === "checkbox") pole.checked = value;
    else pole.value = String(value);
    pole.dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  return { w, d: w.document, ustaw };
}
const poczekaj = () => new Promise((resolve) => setTimeout(resolve, 20));
async function oblicz(d) {
  d.getElementById("konfiguracja").requestSubmit();
  await poczekaj();
}

test("pełny przepływ formularza: wyniki, składniki, bilans i zapis", async (t) => {
  const { d, w, ustaw } = strona(t);
  ustaw("od", "2026-01-01");
  ustaw("do", "2026-01-02");
  ustaw("pv", true);
  await oblicz(d);
  assert.equal(d.getElementById("wyniki").hidden, false);
  assert.equal(d.querySelectorAll("#porownanie tr").length, 5);
  assert.equal(d.querySelectorAll("#skladniki tr").length, 5);
  assert.equal(d.querySelectorAll("#bilans tr").length, 24);
  assert.ok(d.querySelector("#wykres-soc polyline"));
  assert.match(d.getElementById("status").textContent, /gotowe/);
  assert.match(d.getElementById("zwrot").textContent, /Wymaga pełnego roku/);
  assert.equal(JSON.parse(w.localStorage.getItem(klucz)).pola.pv, true);
  ustaw("zuzycie", 5000);
  assert.match(d.getElementById("stan-wynikow").textContent, /nieaktualne/);
});
test("niepoprawny SoC blokuje obliczenia, wyłączenie magazynu zwalnia pola", async (t) => {
  const { d, ustaw } = strona(t);
  ustaw("startSoc", 0);
  ustaw("minSoc", 20);
  assert.equal(d.getElementById("konfiguracja").checkValidity(), false);
  await oblicz(d);
  assert.equal(d.getElementById("wyniki").hidden, true);
  ustaw("magazyn", false);
  ustaw("od", "2026-01-01");
  ustaw("do", "2026-01-01");
  assert.equal(d.getElementById("pola-magazyn").disabled, true);
  assert.equal(d.getElementById("konfiguracja").checkValidity(), true);
  await oblicz(d);
  assert.equal(d.querySelectorAll("#porownanie tr").length, 2);
});
test("PV może działać bez magazynu", async (t) => {
  const { d, ustaw } = strona(t);
  ustaw("magazyn", false);
  ustaw("pv", true);
  ustaw("od", "2026-01-01");
  ustaw("do", "2026-01-01");
  await oblicz(d);
  assert.equal(d.querySelectorAll("#porownanie tr").length, 3);
  assert.match(
    d.querySelector("#porownanie tr:last-child").textContent,
    /Dynamiczna \+ PV/,
  );
});
test("puste, ujemne i odwrócone daty nie przechodzą walidacji", (t) => {
  const { d, ustaw } = strona(t);
  for (const v of ["", -1]) {
    ustaw("zuzycie", v);
    assert.equal(d.getElementById("konfiguracja").checkValidity(), false);
  }
  ustaw("zuzycie", 4500);
  ustaw("od", "2026-09-30");
  ustaw("do", "2026-01-01");
  assert.equal(d.getElementById("konfiguracja").checkValidity(), false);
});
test("odczyt ustawień i reset nie zapisują automatycznie", async (t) => {
  const zapis = JSON.stringify({
    wersja: 1,
    pola: { zuzycie: "1234", pv: true },
  });
  const { d, w } = strona(t, zapis);
  assert.equal(d.getElementById("zuzycie").value, "1234");
  assert.equal(d.getElementById("pv").checked, true);
  d.getElementById("konfiguracja").reset();
  await poczekaj();
  assert.equal(d.getElementById("zuzycie").value, "4500");
  assert.equal(d.getElementById("pv").checked, false);
  assert.equal(w.localStorage.getItem(klucz), zapis);
});
test("uszkodzony zapis oraz blokada storage nie blokują obliczeń", async (t) => {
  for (const [zapis, blokada] of [
    ["{oops", false],
    [undefined, true],
  ]) {
    const { d, ustaw } = strona(t, zapis, blokada);
    ustaw("od", "2026-01-01");
    ustaw("do", "2026-01-01");
    await oblicz(d);
    assert.equal(d.getElementById("wyniki").hidden, false);
    if (blokada)
      assert.match(
        d.getElementById("status").textContent,
        /nie pozwala zapisać/,
      );
  }
});
test("znana luka jest czytelnym błędem", async (t) => {
  const { d, ustaw } = strona(t);
  ustaw("od", "2025-09-29");
  ustaw("do", "2025-10-01");
  await oblicz(d);
  assert.match(d.getElementById("status").textContent, /2025-09-30/);
  assert.equal(d.getElementById("wyniki").hidden, true);
});
test("brak danych wyłącza przycisk zamiast pokazywać puste rachunki", (t) => {
  const { d } = strona(t, undefined, false, true);
  assert.equal(d.querySelector("button[type=submit]").disabled, true);
  assert.match(d.getElementById("zakres-danych").textContent, /Brak pliku/);
});
test("etykiety i zasoby lokalne są kompletne, identyfikatory unikalne", (t) => {
  const { d } = strona(t);
  const ids = [...d.querySelectorAll("[id]")].map((e) => e.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const label of d.querySelectorAll("label[for]"))
    assert.ok(d.getElementById(label.htmlFor));
  for (const element of d.querySelectorAll("script[src],link[href]")) {
    const ref = element.getAttribute("src") || element.getAttribute("href");
    assert.ok(!ref.includes("://"));
    assert.ok(fs.existsSync(path.join(katalog, ref)));
  }
});
