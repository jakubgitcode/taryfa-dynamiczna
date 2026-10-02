/* Silnik bez DOM i zależności. Etykiety godzin pochodzą z TGE, nie są UTC. */
(function (root) {
  "use strict";
  const EPS = 1e-8;
  const PROFIL = [
    0.55, 0.45, 0.4, 0.4, 0.45, 0.65, 1.1, 1.45, 1.1, 0.8, 0.7, 0.7, 0.8, 0.8,
    0.8, 0.9, 1.15, 1.5, 1.8, 1.8, 1.6, 1.3, 0.95, 0.7,
  ];
  const PV_MIESIAC = [2, 3, 7, 10, 13, 14, 14, 12, 10, 8, 4, 3];

  function wymagaj(warunek, opis) {
    if (!warunek) throw new Error(opis);
  }
  function dniRoku(rok) {
    return new Date(Date.UTC(rok, 1, 29)).getUTCMonth() === 1 ? 366 : 365;
  }
  function dniMiesiaca(data) {
    return new Date(
      Date.UTC(Number(data.slice(0, 4)), Number(data.slice(5, 7)), 0),
    ).getUTCDate();
  }
  function nastepnyDzien(data) {
    return new Date(Date.parse(data + "T12:00:00Z") + 86400000)
      .toISOString()
      .slice(0, 10);
  }
  function poprawnaData(data) {
    return (
      typeof data === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(data) &&
      Number.isFinite(Date.parse(data + "T12:00:00Z")) &&
      new Date(data + "T12:00:00Z").toISOString().slice(0, 10) === data
    );
  }

  function waliduj(p) {
    wymagaj(p && typeof p === "object", "Brak konfiguracji.");
    const liczba = (klucz, min, max = Infinity) =>
      wymagaj(
        Number.isFinite(p[klucz]) && p[klucz] >= min && p[klucz] <= max,
        `Niepoprawny parametr: ${klucz}.`,
      );
    for (const id of ["magazyn", "pv"])
      wymagaj(typeof p[id] === "boolean", `Niepoprawny wybór: ${id}.`);
    liczba("zuzycie", 0);
    for (const id of ["g11", "marza", "dystrybucja", "stale", "akcyza"])
      liczba(id, 0);
    liczba("vat", 0, 100);
    wymagaj(["dom", "plaski"].includes(p.profil), "Nieznany profil zużycia.");
    if (p.magazyn) {
      for (const id of ["pojemnosc", "mocLadowania", "mocRozladowania"])
        liczba(id, 0.001);
      liczba("minSoc", 0, 99);
      liczba("startSoc", p.minSoc, 100);
      liczba("sprawnosc", 1, 100);
      liczba("kosztMagazynu", 0);
      liczba("kosztInwertera", 0);
    }
    if (p.pv) {
      liczba("kwp", 0);
      liczba("uzysk", 0);
      liczba("kosztPV", 0);
    }
    return p;
  }

  function stawki(cenaMwh, p, g11 = false) {
    const energia = g11 ? p.g11 : cenaMwh / 1000 + p.marza;
    const akcyza = p.akcyza / 1000;
    const dystrybucja = p.dystrybucja;
    const vat = ((energia + akcyza + dystrybucja) * p.vat) / 100;
    return {
      energia,
      akcyza,
      dystrybucja,
      vat,
      razem: energia + akcyza + dystrybucja + vat,
    };
  }

  function wybierzDni(dane, od, doDnia) {
    wymagaj(
      dane?.wersja === 1 && Array.isArray(dane.dni),
      "Niepoprawna wersja danych.",
    );
    wymagaj(
      poprawnaData(od) && poprawnaData(doDnia) && od <= doDnia,
      "Niepoprawny zakres dat.",
    );
    wymagaj(
      od >= dane.od && doDnia <= dane.do,
      "Wybrany okres wykracza poza dostępne dane.",
    );
    const dni = dane.dni.filter((d) => d.data >= od && d.data <= doDnia);
    let oczekiwany = od;
    for (const d of dni) {
      wymagaj(
        d.data === oczekiwany,
        `Brak danych dostawy ${oczekiwany}. Wybierz ciągły okres bez tej luki.`,
      );
      wymagaj(
        Array.isArray(d.ceny) && [23, 24, 25].includes(d.ceny.length),
        `${d.data}: niepoprawna liczba godzin.`,
      );
      for (const w of d.ceny)
        wymagaj(
          Array.isArray(w) &&
            Number.isInteger(w[0]) &&
            w[0] >= 0 &&
            w[0] <= 23 &&
            Number.isFinite(w[1]),
          `${d.data}: niepoprawna cena lub godzina.`,
        );
      oczekiwany = nastepnyDzien(d.data);
    }
    wymagaj(
      oczekiwany === nastepnyDzien(doDnia),
      `Brak danych dostawy ${oczekiwany}. Wybierz krótszy okres.`,
    );
    return dni;
  }

  function profilDnia(dzien, p) {
    const m = Number(dzien.data.slice(5, 7)) - 1;
    const wagi = dzien.ceny.map(([h]) => (p.profil === "dom" ? PROFIL[h] : 1));
    const dlugoscDnia = 12 + 4 * Math.sin(((m - 2) / 12) * 2 * Math.PI);
    const pvWagi = dzien.ceny.map(([h]) =>
      Math.max(
        0,
        Math.sin((Math.PI * (h + 0.5 - (12 - dlugoscDnia / 2))) / dlugoscDnia),
      ),
    );
    const suma = wagi.reduce((a, b) => a + b, 0);
    const sumaPV = pvWagi.reduce((a, b) => a + b, 0);
    const dobowe = p.zuzycie / dniRoku(Number(dzien.data.slice(0, 4)));
    const dobowePV = p.pv
      ? (p.kwp * p.uzysk * PV_MIESIAC[m]) / 100 / dniMiesiaca(dzien.data)
      : 0;
    return dzien.ceny.map(([h, cena], i) => ({
      data: dzien.data,
      nr: i + 1,
      godzina: h,
      czas: 1,
      cena,
      zuzycie: (dobowe * wagi[i]) / suma,
      pv: (dobowePV * pvWagi[i]) / sumaPV,
    }));
  }

  function nowyStan(p, odniesienie) {
    const eta = Math.sqrt(p.sprawnosc / 100);
    return {
      energia: (p.pojemnosc * p.startSoc) / 100,
      kosztJednostki: odniesienie * eta,
    };
  }

  // Prosta strategia: ładuj na droższe godziny tej samej doby, do kolejnej
  // tańszej godziny lub nadwyżki PV. Nie jest to optymalizator globalny.
  function krok(w, przyszle, p, stan, bateria, pv) {
    wymagaj(
      Number.isFinite(w.czas) && w.czas > 0 && w.czas <= 1,
      "Niepoprawny czas interwału.",
    );
    for (const id of ["zuzycie", "pv"])
      wymagaj(
        Number.isFinite(w[id]) && w[id] >= 0,
        `Niepoprawna energia: ${id}.`,
      );
    const cena = stawki(w.cena, p).razem;
    const produkcja = pv ? w.pv : 0;
    const bezposrednio = Math.min(produkcja, w.zuzycie);
    const pobor = w.zuzycie - bezposrednio;
    const nadwyzka = produkcja - bezposrednio;
    const przed = stan?.energia || 0;
    let ladowaniePV = 0,
      ladowanieSiec = 0,
      oddane = 0,
      strata = 0;
    if (bateria) {
      const eta = Math.sqrt(p.sprawnosc / 100);
      const minimum = (p.pojemnosc * p.minSoc) / 100;
      const dodaj = (energiaAC, kosztAC) => {
        const wewnetrzna = energiaAC * eta;
        const dostepne = Math.max(0, stan.energia - minimum);
        if (wewnetrzna > EPS)
          stan.kosztJednostki =
            (dostepne * stan.kosztJednostki + energiaAC * kosztAC) /
            (dostepne + wewnetrzna);
        stan.energia += wewnetrzna;
        strata += energiaAC - wewnetrzna;
      };
      ladowaniePV = Math.max(
        0,
        Math.min(
          nadwyzka,
          p.mocLadowania * w.czas,
          (p.pojemnosc - stan.energia) / eta,
        ),
      );
      dodaj(ladowaniePV, 0);
      if (ladowaniePV <= EPS && cena > stan.kosztJednostki / eta + EPS) {
        oddane = Math.max(
          0,
          Math.min(
            pobor,
            p.mocRozladowania * w.czas,
            (stan.energia - minimum) * eta,
          ),
        );
        stan.energia -= oddane / eta;
        strata += oddane / eta - oddane;
      }
      if (ladowaniePV <= EPS && oddane <= EPS && nadwyzka <= EPS) {
        let potrzeba = 0;
        for (const f of przyszle) {
          const cenaF = stawki(f.cena, p).razem;
          if (cenaF <= cena + EPS || (pv && f.pv > f.zuzycie)) break;
          if (cenaF > cena / (eta * eta) + EPS) {
            potrzeba +=
              Math.min(
                Math.max(0, f.zuzycie - (pv ? f.pv : 0)),
                p.mocRozladowania * f.czas,
              ) / eta;
          }
        }
        const brak = Math.max(
          0,
          Math.min(p.pojemnosc - minimum, potrzeba) - (stan.energia - minimum),
        );
        ladowanieSiec = Math.min(p.mocLadowania * w.czas, brak / eta);
        dodaj(ladowanieSiec, cena);
      }
    }
    return {
      ...w,
      pv: produkcja,
      bezposrednio,
      import: pobor - oddane + ladowanieSiec,
      eksport: nadwyzka - ladowaniePV,
      ladowaniePV,
      ladowanieSiec,
      oddane,
      strata,
      socPrzed: przed,
      soc: stan?.energia || 0,
    };
  }

  function pustaSuma() {
    return {
      energia: 0,
      dystrybucja: 0,
      akcyza: 0,
      vat: 0,
      stale: 0,
      korekta: 0,
      koszt: 0,
      import: 0,
      eksport: 0,
      strata: 0,
      zuzycie: 0,
      pv: 0,
    };
  }
  function dodajSume(cel, skladniki) {
    for (const k of Object.keys(cel)) cel[k] += skladniki[k] || 0;
  }

  function symuluj(dane, p, od, doDnia) {
    waliduj(p);
    const dni = wybierzDni(dane, od, doDnia);
    const definicje = [
      { id: "g11", nazwa: "G11", bateria: false, pv: false },
      { id: "dynamiczna", nazwa: "Dynamiczna", bateria: false, pv: false },
    ];
    if (p.magazyn)
      definicje.push({
        id: "magazyn",
        nazwa: "Dynamiczna + magazyn",
        bateria: true,
        pv: false,
      });
    if (p.pv)
      definicje.push({
        id: "pv",
        nazwa: "Dynamiczna + PV",
        bateria: false,
        pv: true,
      });
    if (p.magazyn && p.pv)
      definicje.push({
        id: "magazynPV",
        nazwa: "Dynamiczna + magazyn + PV",
        bateria: true,
        pv: true,
      });
    // Jawne rozliczenie różnicy zapasu: energia oddawalna × pierwsza nieujemna
    // stawka zakupu. Dzięki temu początkowy zapas nie jest darmowym źródłem.
    const odniesienie = Math.max(0, stawki(dni[0].ceny[0][1], p).razem);
    const warianty = definicje.map((v) => ({
      ...v,
      suma: pustaSuma(),
      miesiace: {},
      przebieg: [],
      stan: v.bateria ? nowyStan(p, odniesienie) : null,
    }));
    for (const dzien of dni) {
      const profil = profilDnia(dzien, p);
      const miesiac = dzien.data.slice(0, 7);
      for (const v of warianty) {
        const mies = (v.miesiace[miesiac] ||= pustaSuma());
        const staleNetto = p.stale / dniMiesiaca(dzien.data);
        const oplata = {
          stale: staleNetto,
          vat: (staleNetto * p.vat) / 100,
          koszt: staleNetto * (1 + p.vat / 100),
        };
        dodajSume(v.suma, oplata);
        dodajSume(mies, oplata);
        for (let i = 0; i < profil.length; i++) {
          const w = krok(
            profil[i],
            profil.slice(i + 1),
            p,
            v.stan,
            v.bateria,
            v.pv,
          );
          const s = stawki(w.cena, p, v.id === "g11");
          const korekta = v.bateria
            ? (w.socPrzed - w.soc) * Math.sqrt(p.sprawnosc / 100) * odniesienie
            : 0;
          const koszty = {
            energia: w.import * s.energia,
            dystrybucja: w.import * s.dystrybucja,
            akcyza: w.import * s.akcyza,
            vat: w.import * s.vat,
            korekta,
            koszt: w.import * s.razem + korekta,
            import: w.import,
            eksport: w.eksport,
            strata: w.strata,
            zuzycie: w.zuzycie,
            pv: w.pv,
          };
          dodajSume(v.suma, koszty);
          dodajSume(mies, koszty);
          v.przebieg.push({ ...w, koszt: koszty.koszt });
        }
      }
    }
    const pelnyRok =
      od.slice(0, 4) === doDnia.slice(0, 4) &&
      od.endsWith("-01-01") &&
      doDnia.endsWith("-12-31");
    return {
      od,
      do: doDnia,
      dni: dni.length,
      godziny: dni.reduce((s, d) => s + d.ceny.length, 0),
      pelnyRok,
      zrodla: [...new Set(dni.map((d) => d.zrodlo))],
      odniesienie,
      warianty,
    };
  }

  function zwrot(koszt, oszczednosc, pelnyRok) {
    if (!pelnyRok) return "Wymaga pełnego roku";
    if (oszczednosc <= EPS) return "Brak zwrotu";
    return (koszt / oszczednosc).toFixed(1) + " lat";
  }

  // Przyjęta żywotność instalacji — do oceny, czy inwestycja zdąży się zwrócić.
  const ZYCIE = { magazyn: 15, pv: 25, magazynPV: 20 };

  // Podsumowanie inwestycji: oszczędność z okresu przeliczona na rok i prosty
  // zwrot. Bez DOM — prezentacja jest po stronie formularza.
  function podsumowanie(wynik, p, zycie = ZYCIE) {
    const baza = wynik.warianty.find((v) => v.id === "dynamiczna");
    const magazyn = (p.kosztMagazynu || 0) + (p.kosztInwertera || 0);
    const pozycje = [];
    for (const [id, etykieta, koszt] of [
      ["magazyn", "Sam magazyn", magazyn],
      ["pv", "Sama fotowoltaika", p.kosztPV || 0],
      ["magazynPV", "Magazyn i fotowoltaika", magazyn + (p.kosztPV || 0)],
    ]) {
      const v = wynik.warianty.find((w) => w.id === id);
      if (!v || !baza || koszt <= 0 || wynik.dni <= 0) continue;
      const oszczednoscOkres = baza.suma.koszt - v.suma.koszt;
      const oszczednoscRok = (oszczednoscOkres * 365) / wynik.dni;
      const lata = oszczednoscRok > EPS ? koszt / oszczednoscRok : null;
      pozycje.push({
        id,
        etykieta,
        koszt,
        oszczednoscOkres,
        oszczednoscRok,
        lata,
        zycie: zycie[id],
        przeliczone: !wynik.pelnyRok,
        werdykt:
          lata === null
            ? "brak"
            : lata <= zycie[id] / 2
              ? "oplaca"
              : lata <= zycie[id]
                ? "granica"
                : "nie",
      });
    }
    return pozycje;
  }
  const api = {
    waliduj,
    stawki,
    podsumowanie,
    wybierzDni,
    profilDnia,
    nowyStan,
    krok,
    symuluj,
    zwrot,
    dniRoku,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Silnik = api;
})(globalThis);
