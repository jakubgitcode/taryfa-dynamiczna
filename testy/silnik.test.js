"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../silnik.js");
const p = {
  magazyn: true,
  pv: false,
  zuzycie: 365,
  profil: "plaski",
  g11: 1,
  marza: 0,
  dystrybucja: 0,
  stale: 0,
  akcyza: 0,
  vat: 0,
  pojemnosc: 10,
  mocLadowania: 5,
  mocRozladowania: 5,
  minSoc: 0,
  startSoc: 0,
  sprawnosc: 100,
  kosztMagazynu: 100,
  kosztInwertera: 0,
  kwp: 1,
  uzysk: 1000,
  kosztPV: 100,
};
const blisko = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const w = (cena, zuzycie = 0, pv = 0, czas = 1) => ({
  cena,
  zuzycie,
  pv,
  czas,
});
const dane = (daty, ceny = Array(24).fill(1000)) => ({
  wersja: 1,
  od: daty[0],
  do: daty.at(-1),
  dni: daty.map((data) => ({
    data,
    zrodlo: "test",
    ceny: ceny.map((c, h) => [h, c]),
  })),
});

test("ręczny rachunek obejmuje VAT, akcyzę, dystrybucję i część opłaty stałej", () => {
  const r = S.symuluj(
    dane(["2026-01-01"]),
    {
      ...p,
      magazyn: false,
      g11: 0.5,
      marza: 0.1,
      dystrybucja: 0.2,
      akcyza: 5,
      vat: 23,
      stale: 31,
    },
    "2026-01-01",
    "2026-01-01",
  );
  blisko(r.warianty[0].suma.koszt, (0.5 + 0.2 + 0.005 + 1) * 1.23);
  blisko(r.warianty[1].suma.koszt, (1 + 0.1 + 0.2 + 0.005 + 1) * 1.23);
});
test("wieczorne ładowanie nie pokrywa wcześniejszego poranka", () => {
  const stan = S.nowyStan(p, 1);
  const rano = S.krok(w(1000, 3), [w(100, 0)], p, stan, true, false);
  blisko(rano.import, 3);
  blisko(rano.oddane, 0);
});
test("ręcznie: 2 kWh po 0,10 zamiast 1,00, z zachowaniem chronologii", () => {
  const stan = S.nowyStan(p, 0.1);
  const a = S.krok(w(100), [w(1000, 2)], p, stan, true, false);
  const b = S.krok(w(1000, 2), [], p, stan, true, false);
  blisko(a.ladowanieSiec, 2);
  blisko(b.oddane, 2);
  blisko(stan.energia, 0);
  blisko(a.import * 0.1 + b.import, 0.2);
});
test("stała cena i straty nie wywołują nieopłacalnego cyklu", () => {
  const stan = S.nowyStan({ ...p, sprawnosc: 81 }, 1);
  const a = S.krok(
    w(1000),
    [w(1000, 2)],
    { ...p, sprawnosc: 81 },
    stan,
    true,
    false,
  );
  blisko(a.ladowanieSiec, 0);
});
test("ograniczenia mocy, pojemności i straty cyklu także dla kwadransa", () => {
  const cfg = {
    ...p,
    pojemnosc: 2,
    mocLadowania: 4,
    mocRozladowania: 2,
    sprawnosc: 81,
  };
  const stan = S.nowyStan(cfg, 0.1);
  const a = S.krok(w(100, 0, 0, 0.25), [w(1000, 10)], cfg, stan, true, false);
  blisko(a.ladowanieSiec, 1);
  blisko(stan.energia, 0.9);
  blisko(a.strata, 0.1);
  const b = S.krok(w(1000, 5, 0, 0.25), [], cfg, stan, true, false);
  blisko(b.oddane, 0.5);
  blisko(b.strata, 0.5 / 0.9 - 0.5);
});
test("PV najpierw zasila dom, później magazyn, nadmiar eksportuje", () => {
  const cfg = { ...p, pv: true, mocLadowania: 2 };
  const stan = S.nowyStan(cfg, 1);
  const a = S.krok(w(1000, 1, 10), [], cfg, stan, true, true);
  blisko(a.bezposrednio, 1);
  blisko(a.ladowaniePV, 2);
  blisko(a.eksport, 7);
  blisko(a.import, 0);
  blisko(a.oddane, 0);
});
test("przy ujemnej cenie kupuje energię zamiast rozładowywać PV", () => {
  const stan = { energia: 3, kosztJednostki: 0 };
  const a = S.krok(w(-100, 1), [], p, stan, true, false);
  blisko(a.import, 1);
  blisko(a.oddane, 0);
});
test("zapas przechodzi przez północ i jest jawnie wyceniony", () => {
  const cfg = { ...p, startSoc: 50 };
  const r = S.symuluj(
    dane(["2026-01-01", "2026-01-02"]),
    cfg,
    "2026-01-01",
    "2026-01-02",
  );
  const b = r.warianty.find((v) => v.id === "magazyn");
  blisko(b.przebieg[24].socPrzed, b.przebieg[23].soc);
  // Pierwsza cena odpowiada kosztowi początkowego zapasu: brak darmowej oszczędności.
  blisko(b.suma.koszt, r.warianty[1].suma.koszt);
});
test("bilans energii oraz limity dla deterministycznego ciągu zmiennych cen/PV", () => {
  const cfg = {
    ...p,
    pv: true,
    minSoc: 10,
    startSoc: 20,
    sprawnosc: 88,
    mocLadowania: 2,
    mocRozladowania: 1,
  };
  const stan = S.nowyStan(cfg, 0.5);
  const ciag = Array.from({ length: 96 }, (_, i) =>
    w(
      ((i * 317) % 1800) - 200,
      (i % 7) / 3,
      Math.max(0, 4 * Math.sin(i)),
      0.25,
    ),
  );
  for (let i = 0; i < ciag.length; i++) {
    const a = S.krok(ciag[i], ciag.slice(i + 1, i + 8), cfg, stan, true, true);
    blisko(
      a.import + a.pv + a.socPrzed,
      a.zuzycie + a.eksport + a.soc + a.strata,
    );
    assert.ok(a.soc >= 1 - 1e-8 && a.soc <= 10 + 1e-8);
    assert.ok(
      a.oddane <= 0.25 + 1e-8 && a.ladowaniePV + a.ladowanieSiec <= 0.5 + 1e-8,
    );
    assert.ok(!(a.oddane > 1e-8 && a.ladowaniePV + a.ladowanieSiec > 1e-8));
  }
});
test("23/25 interwałów zachowuje osobne ceny i dzienne zużycie", () => {
  for (const n of [23, 25]) {
    const d = {
      data: "2026-03-29",
      ceny: Array.from({ length: n }, (_, i) => [i % 24, i]),
    };
    const r = S.profilDnia(d, p);
    assert.equal(r.length, n);
    blisko(
      r.reduce((s, w) => s + w.zuzycie, 0),
      1,
    );
  }
});
test("roczny profil sumuje się do zadanej energii także w roku przestępnym", () => {
  for (const rok of [2024, 2025]) {
    let zuzycie = 0,
      pv = 0;
    for (
      let t = Date.UTC(rok, 0, 1);
      t < Date.UTC(rok + 1, 0, 1);
      t += 86400000
    ) {
      const data = new Date(t).toISOString().slice(0, 10);
      const r = S.profilDnia(
        { data, ceny: Array.from({ length: 24 }, (_, h) => [h, 0]) },
        { ...p, pv: true },
      );
      zuzycie += r.reduce((s, w) => s + w.zuzycie, 0);
      pv += r.reduce((s, w) => s + w.pv, 0);
    }
    blisko(zuzycie, 365);
    blisko(pv, 1000);
  }
});
test("brak danych jest błędem, nie darmowym dniem", () => {
  assert.throws(
    () =>
      S.symuluj(
        dane(["2025-09-29", "2025-10-01"]),
        p,
        "2025-09-29",
        "2025-10-01",
      ),
    /2025-09-30/,
  );
});
test("walidacja odrzuca NaN, nieskończoność, błędny SoC i daty", () => {
  for (const v of [NaN, Infinity, -1])
    assert.throws(() => S.waliduj({ ...p, zuzycie: v }));
  assert.throws(() => S.waliduj({ ...p, minSoc: 20, startSoc: 10 }));
  assert.throws(() =>
    S.wybierzDni(dane(["2026-01-01"]), "2026-02-30", "2026-03-01"),
  );
  assert.doesNotThrow(() =>
    S.waliduj({ ...p, magazyn: false, pv: false, pojemnosc: NaN, kwp: NaN }),
  );
});
test("PV bez magazynu i brak zużycia są poprawnymi wariantami", () => {
  const r = S.symuluj(
    dane(["2026-01-01"]),
    { ...p, magazyn: false, pv: true, zuzycie: 0 },
    "2026-01-01",
    "2026-01-01",
  );
  assert.deepEqual(
    r.warianty.map((v) => v.id),
    ["g11", "dynamiczna", "pv"],
  );
  blisko(r.warianty[2].suma.import, 0);
  assert.ok(r.warianty[2].suma.eksport > 0);
});
test("zwrot wymaga pełnego roku i dodatniej oszczędności", () => {
  assert.equal(S.zwrot(100, 10, false), "Wymaga pełnego roku");
  assert.equal(S.zwrot(100, 0, true), "Brak zwrotu");
  assert.equal(S.zwrot(100, 10, true), "10.0 lat");
});

test("pełny dostępny rok 2026: skończone wyniki i zgodność sum miesięcznych", () => {
  require("../dane_rdn.js");
  const dane = globalThis.DANE_RDN;
  const cfg = {
    ...p,
    pv: true,
    zuzycie: 4500,
    minSoc: 10,
    startSoc: 10,
    sprawnosc: 88,
    marza: 0.08,
    dystrybucja: 0.37,
    vat: 23,
    akcyza: 5,
    stale: 30,
  };
  const koniec = dane.do < "2026-12-31" ? dane.do : "2026-12-31";
  const r = S.symuluj(dane, cfg, "2026-01-01", koniec);
  for (const v of r.warianty) {
    for (const [k, kwota] of Object.entries(v.suma)) {
      assert.ok(Number.isFinite(kwota));
      blisko(
        kwota,
        Object.values(v.miesiace).reduce((s, m) => s + m[k], 0),
      );
    }
    for (const w of v.przebieg)
      blisko(
        w.import + w.pv + w.socPrzed,
        w.zuzycie + w.eksport + w.soc + w.strata,
      );
  }
});
