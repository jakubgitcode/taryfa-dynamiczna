"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../silnik.js");
const p = {
  magazyn: true,
  pv: false,
  profil: "wlasny",
  mocGodzinowa: Array(24).fill(0),
  zuzycie: 0,
  g11: 1,
  marza: 0,
  dystrybucja: 0,
  akcyza: 0,
  vat: 0,
  stale: 0,
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
  godzinyLadowania: 4,
};
const blisko = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const profil = (ceny, moce = ceny.map(() => 0)) =>
  ceny.map((cena, i) => ({
    cena,
    zuzycie: moce[i],
    pv: 0,
    czas: 1,
    nr: i + 1,
    godzina: i,
    okno: false,
  }));
const dane = (ceny) => ({
  wersja: 1,
  od: "2026-01-01",
  do: "2026-01-01",
  dni: [
    { data: "2026-01-01", zrodlo: "test", ceny: ceny.map((c, h) => [h, c]) },
  ],
});

test("wybiera X najtańszych interwałów, remisy rozstrzyga chronologicznie", () => {
  assert.deepEqual(
    S.najtanszeGodziny(profil([300, 100, 200, 100, 50]), {
      ...p,
      godzinyLadowania: 3,
    }),
    [4, 1, 3],
  );
});
test("własny profil zachowuje kW bez skalowania rocznym zużyciem", () => {
  const moce = Array.from({ length: 24 }, (_, h) => h / 10);
  const r = S.profilDnia(dane(Array(24).fill(500)).dni[0], {
    ...p,
    mocGodzinowa: moce,
    zuzycie: 999999,
  });
  assert.deepEqual(
    r.map((w) => w.zuzycie),
    moce,
  );
});
test("profil i X mają walidację niezależną od formularza", () => {
  for (const n of [0, 25, 1.5, NaN])
    assert.throws(() => S.waliduj({ ...p, godzinyLadowania: n }));
  for (const moce of [
    [],
    Array(23).fill(1),
    Array(24).fill(-1),
    Array(24).fill(NaN),
  ])
    assert.throws(() => S.waliduj({ ...p, mocGodzinowa: moce }));
  assert.doesNotThrow(() => S.waliduj({ ...p, zuzycie: NaN }));
  assert.doesNotThrow(() =>
    S.waliduj({ ...p, magazyn: false, godzinyLadowania: NaN }),
  );
});
test("model prosty: ręczne 2 kWh po 0,10 i 1 kWh po 0,20", () => {
  const w = profil([500, 100, 200, 1000], [0, 0, 0, 3]);
  const r = S.prostyDzien(
    w,
    { ...p, godzinyLadowania: 2, mocLadowania: 2 },
    false,
  );
  blisko(r[1].ladowanieSiec, 2);
  blisko(r[2].ladowanieSiec, 1);
  blisko(
    r.reduce((s, w) => s + (w.ladowanieSiec * w.cena) / 1000, 0),
    0.4,
  );
  blisko(
    r.reduce((s, w) => s + w.oddane, 0),
    3,
  );
  assert.ok(r.every((w) => w.soc === null));
});
test("mała moc w oknie modelu prostego wymusza zakupy bezpośrednie", () => {
  const r = S.prostyDzien(
    profil([100, 1000], [0, 5]),
    { ...p, godzinyLadowania: 1, mocLadowania: 1 },
    false,
  );
  blisko(r[0].ladowanieSiec, 1);
  blisko(r[1].import, 4);
});
test("model prosty respektuje pojemność DC i sprawność obu kierunków", () => {
  const cfg = { ...p, pojemnosc: 2, sprawnosc: 81, godzinyLadowania: 1 };
  const r = S.prostyDzien(profil([100, 1000], [0, 5]), cfg, false);
  blisko(r[0].ladowanieSiec, 2 / 0.9);
  blisko(r[1].oddane, 1.8);
  blisko(
    r.reduce(
      (s, w) => s + w.import + w.pv - w.zuzycie - w.eksport - w.strata,
      0,
    ),
    0,
  );
});
test("tani wieczór nie zasila drogiego poranka w modelu 2", () => {
  const ceny = Array(24).fill(1000);
  ceny[23] = 100;
  const moce = Array(24).fill(0);
  moce[6] = 2;
  const r = S.symuluj(
    dane(ceny),
    { ...p, godzinyLadowania: 1, mocGodzinowa: moce },
    "2026-01-01",
    "2026-01-01",
  );
  const prosty = r.modeleProste[0],
    bilans = r.warianty.find((v) => v.id === "magazyn");
  blisko(prosty.suma.koszt, 0.2);
  blisko(bilans.suma.koszt, 2);
  blisko(bilans.przebieg[6].import, 2);
  blisko(bilans.przebieg[6].oddane, 0);
});
test("równe tanie okna zaczynają ładowanie dostatecznie wcześnie przy małej mocy", () => {
  const cfg = { ...p, mocLadowania: 2, mocRozladowania: 10 };
  const w = profil([100, 100, 100, 1000], [0, 0, 0, 6]);
  for (let i = 0; i < 3; i++) w[i].okno = true;
  const stan = S.nowyStan(cfg, 0.1);
  const r = w.map((w, i, ws) =>
    S.krok(w, ws.slice(i + 1), cfg, stan, true, false),
  );
  assert.deepEqual(
    r.slice(0, 3).map((w) => w.ladowanieSiec),
    [2, 2, 2],
  );
  blisko(r[3].oddane, 6);
  blisko(r[3].import, 0);
});
test("poza oknem kupuje 6 kWh z góry przed droższymi godzinami", () => {
  const cfg = { ...p, mocLadowania: 10 };
  const w = profil([200, 300, 500], [0, 3, 3]);
  const stan = S.nowyStan(cfg, 0.2);
  const r = w.map((w, i, ws) =>
    S.krok(w, ws.slice(i + 1), cfg, stan, true, false),
  );
  blisko(r[0].ladowanieSiec, 6);
  blisko(r[1].oddane, 3);
  blisko(r[2].oddane, 3);
  assert.match(r[0].powod, /Doładowanie/);
});
test("spadek ceny lub straty bez korzyści nie uzasadniają doładowania", () => {
  for (const ceny of [
    [300, 200],
    [100, 110],
  ]) {
    const cfg = { ...p, sprawnosc: 81 };
    const w = profil(ceny, [0, 3]);
    const r = S.krok(w[0], w.slice(1), cfg, S.nowyStan(cfg, 0.2), true, false);
    blisko(r.ladowanieSiec, 0);
  }
});
test("duży magazyn nie musi dojść do rezerwy w ciągu doby", () => {
  const cfg = {
    ...p,
    startSoc: 100,
    pojemnosc: 100,
    mocGodzinowa: Array(24).fill(1),
  };
  const ceny = Array(24).fill(1000);
  ceny[0] = 0;
  const r = S.symuluj(
    dane(ceny),
    cfg,
    "2026-01-01",
    "2026-01-01",
  ).warianty.find((v) => v.id === "magazyn");
  assert.ok(r.przebieg.every((w) => w.soc > 0));
});
test("oba modele mają identyczne zużycie i osobne interwały DST", () => {
  for (const n of [23, 25]) {
    const godziny = Array.from({ length: 24 }, (_, h) => h);
    if (n === 23) godziny.splice(1, 1);
    else godziny.splice(2, 0, 1);
    const d = {
      data: n === 23 ? "2025-03-30" : "2025-10-26",
      ceny: godziny.map((h, i) => [h, 100 + i]),
    };
    const cfg = { ...p, godzinyLadowania: 24, mocGodzinowa: Array(24).fill(1) };
    const profilDnia = S.profilDnia(d, cfg),
      r = S.prostyDzien(profilDnia, cfg, false);
    blisko(
      profilDnia.reduce((s, w) => s + w.zuzycie, 0),
      n,
    );
    assert.equal(S.najtanszeGodziny(profilDnia, cfg).length, Math.min(24, n));
    assert.equal(r.length, n);
    if (n === 25) assert.notEqual(r[1].nr, r[2].nr);
  }
});
test("PV w modelu prostym i godzinowym nie narusza dobowego bilansu", () => {
  const w = profil([100, 500, 300, 1000], [1, 0, 1, 2]);
  w[1].pv = 8;
  const cfg = { ...p, pv: true, sprawnosc: 88, mocLadowania: 2, pojemnosc: 3 };
  const r = S.prostyDzien(w, cfg, true);
  blisko(
    r.reduce(
      (s, w) => s + w.import + w.pv - w.zuzycie - w.eksport - w.strata,
      0,
    ),
    0,
  );
  for (const w of r) assert.ok(w.ladowaniePV + w.ladowanieSiec <= 2 + 1e-8);
  const stan = S.nowyStan(cfg, 0.1);
  for (let i = 0; i < w.length; i++) {
    const r = S.krok(w[i], w.slice(i + 1), cfg, stan, true, true);
    blisko(
      r.import + r.pv + r.socPrzed,
      r.zuzycie + r.eksport + r.soc + r.strata,
    );
  }
});
test("koszt ładowania obejmuje wszystkie zmienne opłaty i sumuje się do miesięcy", () => {
  const cfg = {
    ...p,
    mocGodzinowa: Array(24).fill(1),
    pv: true,
    vat: 23,
    marza: 0.08,
    dystrybucja: 0.37,
    akcyza: 5,
    stale: 30,
  };
  const ceny = Array.from({ length: 24 }, (_, h) => (h % 2 ? 700 : 100));
  const r = S.symuluj(dane(ceny), cfg, "2026-01-01", "2026-01-01");
  for (const v of [...r.warianty, ...r.modeleProste]) {
    blisko(
      v.suma.kosztLadowania,
      v.przebieg.reduce(
        (s, w) => s + w.ladowanieSiec * S.stawki(w.cena, cfg).razem,
        0,
      ),
    );
    for (const k of Object.keys(v.suma))
      blisko(v.suma[k], v.miesiace["2026-01"][k]);
  }
  assert.equal(S.podsumowanie(r, cfg).length, 3);
});
test("historyczne dane: bilans modelu 1 za każdą dobę i brak nowych wariantów w ROI", () => {
  require("../dane_rdn.js");
  const cfg = {
    ...p,
    mocGodzinowa: Array(24).fill(0.5),
    pv: true,
    sprawnosc: 88,
  };
  const r = S.symuluj(globalThis.DANE_RDN, cfg, "2026-01-01", "2026-01-31");
  for (const v of r.modeleProste) {
    for (const data of [...new Set(v.przebieg.map((w) => w.data))]) {
      const dzien = v.przebieg.filter((w) => w.data === data);
      blisko(
        dzien.reduce(
          (s, w) => s + w.import + w.pv - w.zuzycie - w.eksport - w.strata,
          0,
        ),
        0,
      );
    }
  }
  assert.equal(S.podsumowanie(r, cfg).length, 3);
});

test("doładowanie czeka na tańszą godzinę poza oknem, gdy moc na to pozwala", () => {
  const cfg = { ...p, mocLadowania: 10 };
  const w = profil([300, 200, 1000], [0, 0, 6]);
  const stan = S.nowyStan(cfg, 0.3);
  const r = w.map((w, i, ws) =>
    S.krok(w, ws.slice(i + 1), cfg, stan, true, false),
  );
  blisko(r[0].ladowanieSiec, 0);
  blisko(r[1].ladowanieSiec, 5);
  blisko(r[2].oddane, 5);
  blisko(r[2].import, 1);
});
test("przy małej mocy zaczyna wcześniej i uzupełnia tańszą energią poza oknem", () => {
  const cfg = { ...p, mocLadowania: 2, mocRozladowania: 10 };
  const w = profil([300, 200, 1000], [0, 0, 4]);
  const stan = S.nowyStan(cfg, 0.3);
  const r = w.map((w, i, ws) =>
    S.krok(w, ws.slice(i + 1), cfg, stan, true, false),
  );
  blisko(r[0].ladowanieSiec, 2);
  blisko(r[1].ladowanieSiec, 2);
  blisko(r[2].oddane, 4);
});
