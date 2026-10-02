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
    if (p.profil !== "wlasny") liczba("zuzycie", 0);
    else
      wymagaj(
        Array.isArray(p.mocGodzinowa) &&
          p.mocGodzinowa.length === 24 &&
          p.mocGodzinowa.every(
            (v) => Number.isFinite(v) && v >= 0 && v <= 1000,
          ),
        "Profil musi zawierać 24 wartości od 0 do 1000 kW.",
      );
    for (const id of ["g11", "marza", "dystrybucja", "stale", "akcyza"])
      liczba(id, 0);
    liczba("vat", 0, 100);
    wymagaj(
      ["dom", "plaski", "wlasny"].includes(p.profil),
      "Nieznany profil zużycia.",
    );
    if (p.magazyn) {
      wymagaj(
        Number.isInteger(p.godzinyLadowania ?? 4) &&
          (p.godzinyLadowania ?? 4) >= 1 &&
          (p.godzinyLadowania ?? 4) <= 24,
        "Wybierz od 1 do 24 najtańszych godzin.",
      );
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
      zuzycie:
        p.profil === "wlasny" ? p.mocGodzinowa[h] : (dobowe * wagi[i]) / suma,
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

  // W dobie 25 h powtórzone oznaczenie ma dwa różne numery interwału.
  // Na 23 h przy X=24 wybieramy wszystkie dostępne interwały.
  function najtanszeGodziny(profil, p) {
    return profil
      .map((w, i) => ({ i, cena: stawki(w.cena, p).razem }))
      .sort((a, b) => a.cena - b.cena || a.i - b.i)
      .slice(0, Math.min(p.godzinyLadowania ?? 4, profil.length))
      .map((w) => w.i);
  }

  // Model 1: jeden wirtualny cykl na dobę. Kolejność zdarzeń, początkowy SoC
  // i przenoszenie zapasu są pomijane. Reszta poboru trafia bezpośrednio do sieci.
  function prostyDzien(profil, p, pv) {
    const eta = Math.sqrt(p.sprawnosc / 100);
    const uzyteczna = p.pojemnosc * (1 - p.minSoc / 100);
    const wybrane = najtanszeGodziny(profil, p);
    const wiersze = profil.map((w, i) => {
      const produkcja = pv ? w.pv : 0;
      const bezposrednio = Math.min(w.zuzycie, produkcja);
      return {
        ...w,
        pv: produkcja,
        bezposrednio,
        pobor: w.zuzycie - bezposrednio,
        eksport: produkcja - bezposrednio,
        okno: wybrane.includes(i),
        ladowaniePV: 0,
        ladowanieSiec: 0,
        oddane: 0,
        socPrzed: null,
        soc: null,
        powod: "Model prosty — bez chronologii",
      };
    });
    const pokrywalne = wiersze.map((w) =>
      Math.min(w.pobor, p.mocRozladowania * w.czas),
    );
    const potrzeba = pokrywalne.reduce((a, b) => a + b, 0);
    let brak = Math.min(uzyteczna, potrzeba / eta);
    // Nadwyżki PV zastępują część ładowania z sieci, z limitem mocy i pojemności.
    for (const w of wiersze) {
      w.ladowaniePV = Math.min(w.eksport, p.mocLadowania * w.czas, brak / eta);
      brak = Math.max(0, brak - w.ladowaniePV * eta);
      w.eksport -= w.ladowaniePV;
    }
    for (const i of wybrane) {
      const w = wiersze[i];
      w.ladowanieSiec = Math.min(
        Math.max(0, p.mocLadowania * w.czas - w.ladowaniePV),
        brak / eta,
      );
      brak = Math.max(0, brak - w.ladowanieSiec * eta);
    }
    const dostepne = wiersze.reduce(
      (s, w) => s + (w.ladowanieSiec + w.ladowaniePV) * eta * eta,
      0,
    );
    const udzial = potrzeba > EPS ? Math.min(1, dostepne / potrzeba) : 0;
    return wiersze.map((w, i) => {
      const oddane = pokrywalne[i] * udzial;
      return {
        ...w,
        oddane,
        import: w.pobor - oddane + w.ladowanieSiec,
        strata:
          (w.ladowanieSiec + w.ladowaniePV) * (1 - eta) +
          oddane * (1 / eta - 1),
      };
    });
  }

  // Prognoza zapasu potrzebnego do końca doby, liczona od końca.
  // Późniejsze tańsze okna/PV mogą go uzupełnić, ale tylko z dostępną mocą.
  // Dzięki temu przy kilku równych tanich godzinach nie czekamy do ostatniej,
  // gdy jedna godzina nie wystarczyłaby na przygotowanie energii na szczyt.
  function potrzebnyZapas(przyszle, p, pv, cena) {
    const eta = Math.sqrt(p.sprawnosc / 100);
    const uzyteczna = p.pojemnosc * (1 - p.minSoc / 100);
    let potrzeba = 0;
    for (let i = przyszle.length - 1; i >= 0; i--) {
      const f = przyszle[i];
      const reszta = f.zuzycie - (pv ? f.pv : 0);
      const cenaF = stawki(f.cena, p).razem;
      if (reszta < 0) {
        potrzeba = Math.max(
          0,
          potrzeba - Math.min(-reszta, p.mocLadowania * f.czas) * eta,
        );
      } else if (
        cenaF < cena - EPS ||
        ((f.okno ?? true) && cenaF <= cena + EPS)
      ) {
        potrzeba = Math.max(0, potrzeba - p.mocLadowania * f.czas * eta);
      } else if (cenaF > cena / (eta * eta) + EPS) {
        potrzeba = Math.min(
          uzyteczna,
          potrzeba + Math.min(reszta, p.mocRozladowania * f.czas) / eta,
        );
      }
    }
    return potrzeba;
  }

  // Model 2: najpierw planowane okna, poza nimi doładowanie przy pustym
  // zapasie lub cenie niższej od kosztu zapasu, jeśli późniejsze zużycie
  // uzasadnia zakup po uwzględnieniu strat.
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
      const zapas = Math.max(0, stan.energia - minimum);
      const potrzeba = potrzebnyZapas(przyszle, p, pv, cena);
      const wolnoLadowac =
        (w.okno ?? true) ||
        zapas <= EPS ||
        cena < stan.kosztJednostki * eta - EPS;
      if (
        ladowaniePV <= EPS &&
        nadwyzka <= EPS &&
        wolnoLadowac &&
        potrzeba > zapas + EPS
      ) {
        ladowanieSiec = Math.min(
          p.mocLadowania * w.czas,
          (potrzeba - zapas) / eta,
        );
        dodaj(ladowanieSiec, cena);
      } else if (ladowaniePV <= EPS && cena > stan.kosztJednostki / eta + EPS) {
        oddane = Math.max(
          0,
          Math.min(pobor, p.mocRozladowania * w.czas, zapas * eta),
        );
        stan.energia -= oddane / eta;
        strata += oddane / eta - oddane;
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
      powod:
        ladowaniePV > EPS
          ? "Ładowanie nadwyżką PV"
          : ladowanieSiec > EPS
            ? (w.okno ?? true)
              ? "Ładowanie w wybranym oknie"
              : "Doładowanie przed droższymi godzinami"
            : oddane > EPS
              ? "Zużycie z magazynu"
              : pobor > EPS
                ? "Zakup bezpośredni z sieci"
                : bezposrednio > EPS
                  ? "PV pokrywa zużycie"
                  : "Brak poboru",
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
      ladowanieSiec: 0,
      ladowaniePV: 0,
      kosztLadowania: 0,
      kosztZakupu: 0,
      oddane: 0,
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
    // Wyniki modelu 1 są oddzielone od głównego porównania i oceny inwestycji.
    for (const v of [...definicje])
      if (v.bateria)
        definicje.push({
          ...v,
          id: v.id + "Prosty",
          baza: v.id,
          model: "prosty",
          nazwa: v.nazwa + " — model prosty",
        });
    // Jawne rozliczenie różnicy zapasu: energia oddawalna × pierwsza nieujemna
    // stawka zakupu. Dzięki temu początkowy zapas nie jest darmowym źródłem.
    const odniesienie = Math.max(0, stawki(dni[0].ceny[0][1], p).razem);
    const warianty = definicje.map((v) => ({
      ...v,
      suma: pustaSuma(),
      miesiace: {},
      przebieg: [],
      stan: v.bateria && v.model !== "prosty" ? nowyStan(p, odniesienie) : null,
    }));
    for (const dzien of dni) {
      const surowy = profilDnia(dzien, p);
      const okno = p.magazyn ? najtanszeGodziny(surowy, p) : [];
      const profil = surowy.map((w, i) => ({ ...w, okno: okno.includes(i) }));
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
        const przebieg =
          v.model === "prosty"
            ? prostyDzien(profil, p, v.pv)
            : profil.map((w, i) =>
                krok(w, profil.slice(i + 1), p, v.stan, v.bateria, v.pv),
              );
        for (const w of przebieg) {
          const s = stawki(w.cena, p, v.id === "g11");
          const korekta =
            v.bateria && v.model !== "prosty"
              ? (w.socPrzed - w.soc) *
                Math.sqrt(p.sprawnosc / 100) *
                odniesienie
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
            ladowanieSiec: w.ladowanieSiec,
            ladowaniePV: w.ladowaniePV,
            kosztLadowania: w.ladowanieSiec * s.razem,
            kosztZakupu: w.import * s.razem,
            oddane: w.oddane,
          };
          dodajSume(v.suma, koszty);
          dodajSume(mies, koszty);
          v.przebieg.push({
            ...w,
            koszt: koszty.koszt,
            stawka: s.razem,
            kosztZakupu: koszty.kosztZakupu,
            kosztLadowania: koszty.kosztLadowania,
            korekta,
          });
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
      warianty: warianty.filter((v) => v.model !== "prosty"),
      modeleProste: warianty.filter((v) => v.model === "prosty"),
      godzinyLadowania: p.godzinyLadowania ?? 4,
      rezerwa: p.magazyn ? (p.pojemnosc * p.minSoc) / 100 : 0,
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
    najtanszeGodziny,
    prostyDzien,
    krok,
    symuluj,
    zwrot,
    dniRoku,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Silnik = api;
})(globalThis);
