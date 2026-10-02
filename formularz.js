// Formularz i prezentacja; obliczenia pozostają w silnik.js.
"use strict";
const formularz = document.getElementById("konfiguracja");
const statusZapisu = document.getElementById("status");
const klucz = "taryfa-dynamiczna:konfiguracja:v1";
const pola = [...formularz.querySelectorAll("input, select")];
const liczba = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });
const wartosc = (id) => document.getElementById(id).valueAsNumber;
const wlaczone = (id) => document.getElementById(id).checked;
let wynik = null;
let rewizja = 0;
const przycisk = formularz.querySelector("button[type=submit]");
const dane = globalThis.DANE_RDN;
const silnik = globalThis.Silnik;
if (dane && silnik) {
  const poczatek = dane.do.slice(0, 4) + "-01-01";
  for (const id of ["od", "do"]) {
    const pole = document.getElementById(id);
    pole.min = dane.od;
    pole.max = dane.do;
    pole.defaultValue =
      id === "od" ? (poczatek < dane.od ? dane.od : poczatek) : dane.do;
  }
  document.getElementById("zakres-danych").textContent =
    `${dane.dni.length} dni dostawy: ${dane.od} – ${dane.do}. Dane lokalne, bez połączenia z serwerem.`;
} else {
  przycisk.disabled = true;
  document.getElementById("zakres-danych").textContent =
    "Brak pliku danych lub silnika. Umieść dane_rdn.js i silnik.js obok index.html.";
}

function komunikat(tekst, blad = false) {
  statusZapisu.textContent = tekst;
  statusZapisu.classList.toggle("blad", blad);
}
function nieaktualne() {
  rewizja++;
  if (wynik) {
    document.getElementById("stan-wynikow").textContent =
      "Ustawienia zmienione — poniższe wyniki są nieaktualne. Oblicz ponownie.";
    document.getElementById("wyniki").classList.add("nieaktualne");
  }
}
function konfiguracja() {
  const p = Object.fromEntries(
    pola.map((p) => [
      p.id,
      p.type === "checkbox"
        ? p.checked
        : p.type === "number"
          ? p.valueAsNumber
          : p.value,
    ]),
  );
  p.mocGodzinowa = Array.from({ length: 24 }, (_, h) => wartosc("moc-" + h));
  return p;
}

function odswiez() {
  const wlasny = document.getElementById("profil").value === "wlasny";
  document.getElementById("pola-profil").disabled = !wlasny;
  document.getElementById("pola-profil").hidden = !wlasny;
  document.getElementById("zuzycie").disabled = wlasny;
  for (const id of ["magazyn", "pv", "sasiad"]) {
    const grupa = document.getElementById("pola-" + id);
    grupa.disabled = !wlaczone(id);
    grupa.hidden = !wlaczone(id);
  }
  const doDnia = document.getElementById("do");
  doDnia.setCustomValidity(
    doDnia.value < document.getElementById("od").value
      ? "Koniec okresu nie może być przed początkiem."
      : "",
  );
  const start = document.getElementById("startSoc");
  start.setCustomValidity(
    wartosc("startSoc") < wartosc("minSoc")
      ? "Początkowy poziom energii nie może być niższy niż minimalny."
      : "",
  );
  for (const pole of pola) {
    pole.setAttribute(
      "aria-invalid",
      String(pole.willValidate && !pole.validity.valid),
    );
  }
  const poprawne = (ids) =>
    ids.every((id) => document.getElementById(id).validity.valid);
  const pokaz = (id, v, jednostka) => {
    document.getElementById("s-" + id).textContent = Number.isFinite(v)
      ? liczba.format(v) + " " + jednostka
      : "—";
  };
  const moce = Array.from({ length: 24 }, (_, h) => wartosc("moc-" + h));
  const profilPoprawny = poprawne(moce.map((_, h) => "moc-" + h));
  const dobowe = profilPoprawny ? moce.reduce((a, b) => a + b, 0) : NaN;
  document.getElementById("suma-profilu").textContent = Number.isFinite(dobowe)
    ? `${liczba.format(dobowe)} kWh w zwykłej dobie 24 h. Orientacyjnie ${liczba.format(dobowe * 365)} kWh w 365 takich dobach.`
    : "Uzupełnij 24 poprawne wartości mocy.";
  const zuzycie = wlasny
    ? dobowe * 365
    : poprawne(["zuzycie"])
      ? wartosc("zuzycie")
      : NaN;
  pokaz("zuzycie", zuzycie, "kWh");
  pokaz("doba", zuzycie / 365, "kWh");
  pokaz(
    "magazyn",
    wlaczone("magazyn")
      ? poprawne(["pojemnosc", "minSoc"])
        ? wartosc("pojemnosc") * (1 - wartosc("minSoc") / 100)
        : NaN
      : 0,
    "kWh",
  );
  pokaz(
    "pv",
    wlaczone("pv") ? (poprawne(["kwp"]) ? wartosc("kwp") : NaN) : 0,
    "kWp",
  );
  const koszt =
    (wlaczone("magazyn")
      ? poprawne(["kosztMagazynu", "kosztInwertera"])
        ? wartosc("kosztMagazynu") + wartosc("kosztInwertera")
        : NaN
      : 0) +
    (wlaczone("pv") ? (poprawne(["kosztPV"]) ? wartosc("kosztPV") : NaN) : 0);
  pokaz("koszt", koszt, "zł");
}
const profilPrzykladowy = [
  2,
  ...Array(9).fill(0.3),
  2,
  2,
  0.6,
  0.6,
  0.6,
  0.3,
  0.3,
  0.3,
  0.3,
  ...Array(5).fill(2),
];
for (const przycisk of document.querySelectorAll("[data-preset]")) {
  przycisk.addEventListener("click", () => {
    const mnoznik = { przyklad: 1, zima: 1.2, lato: 0.75 }[
      przycisk.dataset.preset
    ];
    for (let h = 0; h < 24; h++)
      document.getElementById("moc-" + h).value = (
        profilPrzykladowy[h] * mnoznik
      ).toFixed(3);
    odswiez();
    nieaktualne();
    komunikat("Wczytano przykładowy profil. Możesz poprawić każdą godzinę.");
  });
}
formularz.addEventListener("input", () => {
  odswiez();
  nieaktualne();
  komunikat("Masz niezapisane zmiany.");
});
formularz.addEventListener("submit", (event) => {
  event.preventDefault();
  odswiez();
  if (!formularz.reportValidity() || !silnik || !dane) return;
  const p = konfiguracja();
  try {
    silnik.waliduj(p);
  } catch (e) {
    komunikat(e.message, true);
    return;
  }
  const zapis = Object.fromEntries(
    pola.map((p) => [p.id, p.type === "checkbox" ? p.checked : p.value]),
  );
  let zapisano = true;
  try {
    localStorage.setItem(klucz, JSON.stringify({ wersja: 1, pola: zapis }));
  } catch {
    zapisano = false;
  }
  komunikat("Obliczanie…");
  przycisk.disabled = true;
  const wersja = rewizja;
  setTimeout(() => {
    try {
      const nowy = silnik.symuluj(dane, p, p.od, p.do);
      if (rewizja !== wersja) {
        komunikat(
          "Parametry zmieniły się podczas obliczania. Oblicz ponownie.",
        );
        return;
      }
      wynik = nowy;
      pokazWyniki(p);
      komunikat(
        zapisano
          ? "Parametry zapisane. Obliczenia gotowe."
          : "Obliczenia gotowe. Przeglądarka nie pozwala zapisać ustawień.",
      );
    } catch (e) {
      nieaktualne();
      komunikat(e.message, true);
    } finally {
      przycisk.disabled = false;
    }
  }, 0);
});
formularz.addEventListener("reset", () => {
  setTimeout(() => {
    odswiez();
    nieaktualne();
    komunikat(
      "Przywrócono przykładowe wartości. Kliknij „Zapisz i oblicz”, aby zachować zmianę.",
    );
  }, 0);
});
try {
  const zapis = JSON.parse(localStorage.getItem(klucz));
  if (zapis?.wersja === 1 && zapis.pola && typeof zapis.pola === "object") {
    for (const pole of pola) {
      const v = zapis.pola[pole.id];
      if (pole.type === "checkbox" && typeof v === "boolean") pole.checked = v;
      else if (
        pole.type === "number" &&
        typeof v === "string" &&
        v.trim() &&
        Number.isFinite(Number(v))
      )
        pole.value = v;
      else if (
        pole.type === "date" &&
        typeof v === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(v)
      )
        pole.value = v;
      else if (
        pole.tagName === "SELECT" &&
        [...pole.options].some((o) => o.value === v)
      )
        pole.value = v;
    }
    statusZapisu.textContent = "Wczytano zapisane parametry.";
  }
} catch {
  statusZapisu.textContent =
    "Zapis ustawień jest niedostępny. Używasz przykładowych wartości.";
}
odswiez();

// Wstawiamy tekst przez textContent, także dla etykiet danych i komunikatów.
function wiersz(tbody, wartosci) {
  const tr = document.createElement("tr");
  for (const v of wartosci) {
    const td = document.createElement("td");
    td.textContent = v;
    tr.append(td);
  }
  tbody.append(tr);
  return tr;
}
const kwota = (v) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(
    v,
  );
const energia = (v) => liczba.format(v);
function opcje(id, lista) {
  const select = document.getElementById(id);
  select.replaceChildren();
  for (const [value, text] of lista) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    select.append(o);
  }
}
function pokazModele() {
  const proste = wynik.modeleProste || [];
  document.getElementById("porownanie-modeli").hidden = proste.length === 0;
  const tabela = document.getElementById("modele");
  tabela.replaceChildren();
  const roznice = [];
  for (const prosty of proste) {
    const bilans = wynik.warianty.find((v) => v.id === prosty.baza);
    for (const [v, nazwa] of [
      [prosty, "1 — prosty"],
      [bilans, "2 — bilans godzinowy"],
      ...wynik.warianty
        .filter((v) => v.sasiad && v.baza === bilans.id)
        .map((v) => [v, "3 — podlicznik G11"]),
    ]) {
      const s = v.suma;
      wiersz(tabela, [
        bilans.nazwa,
        nazwa,
        energia(s.ladowanieSiec),
        kwota(s.kosztLadowania),
        s.ladowanieSiec > 1e-8
          ? kwota(s.kosztLadowania / s.ladowanieSiec)
          : "—",
        kwota(s.kosztZakupu),
        kwota(s.kosztSasiada),
        kwota(s.korekta),
        kwota(s.koszt),
      ]);
    }
    roznice.push(
      `${bilans.nazwa}: model 2 minus model 1 = ${kwota(bilans.suma.koszt - prosty.suma.koszt)}.`,
    );
  }
  document.getElementById("roznica-modeli").textContent = roznice.join(" ");
}
function pokazWyniki(p) {
  const sekcja = document.getElementById("wyniki");
  sekcja.hidden = false;
  sekcja.classList.remove("nieaktualne");
  document.getElementById("stan-wynikow").textContent =
    "Wyniki zgodne z zatwierdzonymi parametrami.";
  document.getElementById("opis-wynikow").textContent =
    `${wynik.od} – ${wynik.do} · ${wynik.dni} dni · ${wynik.godziny} godzin. Źródła: ${wynik.zrodla.map((s) => dane.zrodla[s] || s).join(", ")}. Wycena zapasu: ${kwota(wynik.odniesienie)}/kWh oddawalnej. Eksport bez przychodu.`;
  pokazModele();
  const bazowy = wynik.warianty[0].suma.koszt;
  const tabela = document.getElementById("porownanie");
  tabela.replaceChildren();
  const skladniki = document.getElementById("skladniki");
  skladniki.replaceChildren();
  for (const v of wynik.warianty) {
    wiersz(tabela, [
      v.nazwa,
      kwota(v.suma.koszt),
      kwota(bazowy - v.suma.koszt),
      energia(v.suma.import),
      energia(v.suma.eksport),
      energia(v.suma.strata),
    ]);
    wiersz(skladniki, [
      v.nazwa,
      ...[
        "energia",
        "dystrybucja",
        "akcyza",
        "vat",
        "stale",
        "kosztSasiada",
        "korekta",
      ].map((k) => kwota(v.suma[k])),
    ]);
  }
  const samSasiad = wynik.warianty.find((v) => v.id === "sasiad");
  document.getElementById("wynik-sasiada").textContent = samSasiad
    ? wynik.warianty
        .filter((v) => v.sasiad)
        .map(
          (v) =>
            `${v.nazwa}: zakup od sąsiada ${energia(v.suma.importSasiad)} kWh za ${kwota(v.suma.kosztSasiada)}; oszczędność względem samego podlicznika: ${kwota(samSasiad.suma.koszt - v.suma.koszt)}.${v.bateria ? " Zwrot nakładów: " + silnik.zwrot(p.kosztMagazynu + p.kosztInwertera + (v.pv ? p.kosztPV : 0), samSasiad.suma.koszt - v.suma.koszt, wynik.pelnyRok) + "." : ""}`,
        )
        .join(" ")
    : "";
  const zwroty = [];
  for (const [id, baza, koszt, etykieta] of [
    [
      "magazyn",
      "dynamiczna",
      p.kosztMagazynu + p.kosztInwertera,
      "Sam magazyn względem dynamicznej",
    ],
    ["pv", "dynamiczna", p.kosztPV, "PV względem dynamicznej"],
    [
      "magazynPV",
      "pv",
      p.kosztMagazynu + p.kosztInwertera,
      "Dołożenie magazynu do PV",
    ],
  ]) {
    const v = wynik.warianty.find((w) => w.id === id),
      b = wynik.warianty.find((w) => w.id === baza);
    if (v && b) {
      const oszczednosc = b.suma.koszt - v.suma.koszt;
      zwroty.push(
        `${etykieta}: ${kwota(oszczednosc)} oszczędności w okresie. Prosty zwrot: ${silnik.zwrot(koszt, oszczednosc, wynik.pelnyRok)}.`,
      );
    }
  }
  document.getElementById("zwrot").textContent = zwroty.join(" ");
  const ocena = {
    oplaca: "Opłaca się",
    granica: "Na granicy",
    nie: "Nie opłaca się",
    brak: "Brak oszczędności",
  };
  const pozycje = silnik.podsumowanie(wynik, p);
  const lata = (poz) =>
    poz.lata === null ? "brak oszczędności" : liczba.format(poz.lata) + " lat";
  const tabelaZwrotow = document.getElementById("zwroty");
  tabelaZwrotow.replaceChildren();
  for (const poz of pozycje) {
    const tr = document.createElement("tr");
    const komorki = [
      poz.etykieta,
      kwota(poz.koszt),
      kwota(poz.oszczednoscRok),
      poz.lata === null ? "—" : lata(poz),
      ocena[poz.werdykt],
    ];
    komorki.forEach((tekst, i) => {
      const td = document.createElement("td");
      td.textContent = tekst;
      if (i === komorki.length - 1) td.className = "ocena-" + poz.werdykt;
      tr.append(td);
    });
    tabelaZwrotow.append(tr);
  }
  document.getElementById("werdykt").textContent = pozycje.length
    ? pozycje
        .map(
          (poz) =>
            `${poz.etykieta}: ${lata(poz)} — ${ocena[poz.werdykt].toLowerCase()}.`,
        )
        .join(" ")
    : "Włącz magazyn albo fotowoltaikę, żeby zobaczyć, czy inwestycja się zwraca.";
  document.getElementById("zwrot-zalozenia").textContent = pozycje.length
    ? `Przyjęta żywotność: ${pozycje
        .map((poz) => `${poz.etykieta.toLowerCase()} ${poz.zycie} lat`)
        .join(", ")}.${
        pozycje[0].przeliczone
          ? ` Oszczędność roczna przeliczona z ${wynik.dni} dni okresu.`
          : ""
      } Prosty zwrot, bez kosztu kapitału, degradacji i zmian cen.`
    : "";
  const miesiace = document.getElementById("miesiace");
  miesiace.replaceChildren();
  const caption = document.createElement("caption");
  caption.textContent = "Wyłącznie dni wybranego okresu";
  miesiace.append(caption);
  const head = document.createElement("thead"),
    tr = document.createElement("tr");
  for (const t of ["Miesiąc", ...wynik.warianty.map((v) => v.nazwa)]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = t;
    tr.append(th);
  }
  head.append(tr);
  miesiace.append(head);
  const body = document.createElement("tbody");
  miesiace.append(body);
  for (const m of Object.keys(wynik.warianty[0].miesiace)) {
    const tr = wiersz(body, [
      m,
      ...wynik.warianty.map((v) => kwota(v.miesiace[m].koszt)),
    ]);
    const otworz = document.createElement("button");
    otworz.type = "button";
    otworz.className = "drugorzedny";
    otworz.textContent = m + " · szczegóły";
    otworz.addEventListener("click", () => {
      document.getElementById("dzien-wykresu").value =
        wynik.warianty[0].przebieg.find((w) => w.data.startsWith(m)).data;
      const szczegoly = document.getElementById("szczegoly-dnia");
      szczegoly.open = true;
      pokazDzien();
      document.getElementById("dzien-wykresu").focus();
    });
    tr.firstChild.replaceChildren(otworz);
  }
  opcje(
    "dzien-wykresu",
    [...new Set(wynik.warianty[0].przebieg.map((w) => w.data))].map((d) => [
      d,
      d,
    ]),
  );
  opcje(
    "wariant-wykresu",
    wynik.warianty.map((v) => [v.id, v.nazwa]),
  );
  document.getElementById("wariant-wykresu").value = wynik.warianty.at(-1).id;
  document.getElementById("model-wykresu").value = "bilans";
  pokazDzien();
}
function pokazDzien() {
  if (!wynik) return;
  const bazowy = wynik.warianty.find(
    (v) => v.id === document.getElementById("wariant-wykresu").value,
  );
  const wybor = document.getElementById("model-wykresu");
  wybor.disabled = !bazowy.bateria || bazowy.sasiad;
  if (!bazowy.bateria || bazowy.sasiad) wybor.value = "bilans";
  const prosty = wybor.value === "prosty";
  const v = prosty
    ? wynik.modeleProste.find((v) => v.baza === bazowy.id)
    : bazowy;
  const wiersze = v.przebieg.filter(
    (w) => w.data === document.getElementById("dzien-wykresu").value,
  );
  const body = document.getElementById("bilans");
  body.replaceChildren();
  for (const w of wiersze) {
    const tr = wiersz(body, [
      w.nr,
      `${w.godzina}–${w.godzina + 1}`,
      bazowy.bateria && w.okno ? "Tak" : "—",
      energia(w.cena),
      kwota(w.stawka),
      ...[
        w.zuzycie,
        w.pv,
        w.import,
        w.eksport,
        w.ladowanieSiec,
        w.ladowaniePV,
        w.oddane,
      ].map(energia),
      w.soc === null ? "—" : energia(w.soc),
      kwota(w.kosztZakupu),
      kwota(w.korekta),
      kwota(w.koszt),
      w.powod +
        (bazowy.sasiad
          ? `; podlicznik: ${energia(w.importSasiad)} kWh / ${kwota(w.kosztSasiada)}`
          : ""),
    ]);
    tr.classList.toggle("w-oknie", bazowy.bateria && w.okno);
  }
  const suma = (klucz) => wiersze.reduce((s, w) => s + w[klucz], 0);
  const etykieta = (w) => `${w.godzina}–${w.godzina + 1} (#${w.nr})`;
  const okna = wiersze.filter((w) => w.okno);
  const opis = [
    `Zużycie: ${energia(suma("zuzycie"))} kWh. Zakupy z sieci: ${kwota(suma("kosztZakupu"))} (bez opłat stałych).`,
  ];
  if (bazowy.bateria) {
    opis.push(
      `Wybrane ${okna.length} najtańszych godzin: ${okna.map(etykieta).join(", ")}.`,
      `Ładowanie z sieci: ${energia(suma("ladowanieSiec"))} kWh za ${kwota(suma("kosztLadowania"))}.`,
    );
    if (prosty)
      opis.push(
        "Model prosty pomija kolejność zdarzeń i zapas między dobami. Nie wyznacza momentu wyczerpania magazynu.",
      );
    else {
      const doladowania = wiersze.filter(
        (w) => !w.okno && w.ladowanieSiec > 1e-8,
      );
      opis.push(
        doladowania.length
          ? `Doładowanie poza oknem: ${energia(doladowania.reduce((s, w) => s + w.ladowanieSiec, 0))} kWh, godziny ${doladowania.map(etykieta).join(", ")}.`
          : "Brak doładowania poza oknem.",
      );
      const wyczerpanie = wiersze.find(
        (w) => w.oddane > 1e-8 && w.soc <= wynik.rezerwa + 1e-8,
      );
      opis.push(
        wyczerpanie
          ? `Pierwsze dojście do rezerwy: koniec interwału ${etykieta(wyczerpanie)}.`
          : "W tej dobie rozładowanie nie doprowadziło do rezerwy.",
      );
      opis.push(
        `Zapas na początku: ${energia(wiersze[0].socPrzed)} kWh, na końcu: ${energia(wiersze.at(-1).soc)} kWh.`,
      );
    }
  }
  if (bazowy.sasiad)
    opis.push(
      `Stawka w tabeli dotyczy własnego przyłącza dynamicznego; podlicznik rozliczony osobno w kolumnie działania. Wycena zapasu: ${kwota(v.odniesienie)}/kWh oddawalnej.`,
    );
  document.getElementById("opis-dnia").textContent = opis.join(" ");
  const svg = document.getElementById("wykres-soc");
  svg.replaceChildren();
  const el = (tag, attrs, text) => {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text) e.textContent = text;
    svg.append(e);
    return e;
  };
  el("text", { x: 20, y: 24 }, "Battery state of charge (kWh)");
  if (prosty) {
    el(
      "text",
      { x: 20, y: 100 },
      "Daily approximation — no chronological state of charge",
    );
    return;
  }
  if (!v.bateria) {
    el("text", { x: 20, y: 100 }, "No battery in this scenario");
    return;
  }
  const wartosci = [wiersze[0].socPrzed, ...wiersze.map((w) => w.soc)];
  const max = Math.max(...wartosci, 1);
  el("line", { x1: 50, y1: 165, x2: 780, y2: 165, stroke: "#cdd7cc" });
  el("text", { x: 8, y: 55 }, energia(max));
  el("text", { x: 20, y: 165 }, "0");
  el("polyline", {
    points: wartosci
      .map(
        (s, i) =>
          `${50 + (i / (wartosci.length - 1)) * 730},${165 - (s / max) * 115}`,
      )
      .join(" "),
    fill: "none",
    stroke: "#21634c",
    "stroke-width": 2,
  });
  el("text", { x: 50, y: 188 }, "Start");
  el("text", { x: 640, y: 188 }, "Delivery intervals →");
}
for (const id of ["dzien-wykresu", "wariant-wykresu", "model-wykresu"])
  document.getElementById(id).addEventListener("change", pokazDzien);
