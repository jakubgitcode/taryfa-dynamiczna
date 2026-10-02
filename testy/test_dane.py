"""Regresje eksportu i parserów na małych danych bez połączeń z siecią."""
import calendar
from contextlib import chdir
import csv
import tempfile
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import eksportuj_dane as eksport
import pobierz_dane as pobierz
from konwertuj_excel import parse_excel_file
from waliduj_dane import HEADER, expected_hours, validate


class EksportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def miesiac(self, rok=2025, miesiac=1, pomin=(), pusta=None, nan=False):
        plik = Path(self.tmp.name) / f"tge_rdn_hourly_{rok}-{miesiac:02d}.csv"
        with plik.open('w', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            w.writerow(HEADER)
            for d in range(1, calendar.monthrange(rok, miesiac)[1] + 1):
                if d in pomin:
                    continue
                data = date(rok, miesiac, d)
                godziny = list(range(24))
                if expected_hours(data) == 25:
                    godziny.insert(2, 1)
                for i, h in enumerate(godziny):
                    cena = d * 10 + i / 100
                    if (expected_hours(data) == 23 and h == 1) or (d, h) == pusta:
                        cena = ''
                    if nan and d == 1 and h == 0:
                        cena = 'nan'
                    w.writerow([data.isoformat(), h, h + 1, cena, ''])
        return plik

    def test_ceny_zachowuja_precyzje_i_eksport_jest_deterministyczny(self):
        plik = self.miesiac()
        dane = eksport.eksportuj([plik])
        self.assertEqual(dane['dni'][0]['ceny'][1], [1, 10.01])
        self.assertEqual(eksport.tekst(dane), eksport.tekst(eksport.eksportuj([plik])))

    def test_zmiana_czasu_bez_interpolacji_i_usredniania(self):
        for m, d, n in [(3, 30, 23), (10, 26, 25)]:
            dane = eksport.eksportuj([self.miesiac(miesiac=m)])
            ceny = dane['dni'][d - 1]['ceny']
            self.assertEqual(len(ceny), n)
            if n == 25:
                self.assertEqual(ceny[1][0], ceny[2][0])
                self.assertNotEqual(ceny[1][1], ceny[2][1])
            else:
                self.assertNotIn(1, [h for h, _ in ceny])

    def test_tylko_konkretny_znany_brak_jest_dozwolony(self):
        dane = eksport.eksportuj([self.miesiac(miesiac=9, pomin=(30,))])
        self.assertEqual(dane['braki'], ['2025-09-30'])
        with self.assertRaises(ValueError):
            eksport.eksportuj([self.miesiac(miesiac=9, pomin=(29, 30))])

    def test_brak_calego_miesiaca_jest_bledem(self):
        with self.assertRaises(ValueError):
            eksport.eksportuj([self.miesiac(miesiac=1), self.miesiac(miesiac=3)])

    def test_pusta_cena_i_nan_blokuja_eksport(self):
        for opcje in [{'pusta': (1, 0)}, {'nan': True}]:
            with self.assertRaises(ValueError):
                eksport.eksportuj([self.miesiac(**opcje)])

    def test_nieznany_uklad_dst_blokuje_eksport(self):
        plik = self.miesiac(miesiac=10)
        tekst = plik.read_text().replace('2025-10-26,1,2,260.02', '2025-10-26,2,3,260.02')
        plik.write_text(tekst)
        with self.assertRaises(ValueError):
            eksport.eksportuj([plik])

    def test_blad_eksportu_nie_nadpisuje_poprzedniego_wyniku(self):
        self.miesiac(pusta=(1, 0))
        wynik = Path(self.tmp.name) / 'dane_rdn.js'
        wynik.write_text('poprzedni poprawny wynik')
        with chdir(self.tmp.name), patch('sys.argv', ['eksportuj_dane.py']):
            self.assertEqual(eksport.main(), 1)
        self.assertEqual(wynik.read_text(), 'poprzedni poprawny wynik')

    def test_zrodla(self):
        self.assertEqual(eksport.zrodlo('2025-09-29'), 'fixing1')
        self.assertEqual(eksport.zrodlo('2025-11-17'), 'xlsx')
        self.assertEqual(eksport.zrodlo('2025-11-18'), 'tgebase')

    def test_walidator_wykrywa_kopie(self):
        plik = self.miesiac()
        tekst = plik.read_text()
        for i in range(24):
            tekst = tekst.replace(f'2025-01-02,{i},{i+1},{20+i/100}', f'2025-01-02,{i},{i+1},{10+i/100}')
        plik.write_text(tekst)
        self.assertTrue(any('kopie' in e for e in validate(str(plik))[0]))


class ParserTest(unittest.TestCase):
    def strona(self, naglowek='dla dostawy w dniu 01-01-2025', cena='123,45'):
        # Mały kontrakt HTML odtwarzający istotny fragment odpowiedzi TGE.
        rows = ''.join(f'<tr><td>{h}-{h+1}</td><td>{cena}</td><td>1 000,5</td></tr>' for h in range(24))
        return SimpleNamespace(content=f'<h2>{naglowek}</h2><table id="footable_kontrakty_godzinowe"><tbody>{rows}</tbody></table>'.encode())

    def test_liczby(self):
        self.assertEqual(pobierz.pl_number_to_float('3\xa0759,20'), 3759.2)
        self.assertEqual(pobierz.pl_number_to_float('-10,25'), -10.25)
        self.assertIsNone(pobierz.pl_number_to_float('-'))

    def test_data_dostawy_i_sesji(self):
        with patch.object(pobierz, 'get', return_value=self.strona()) as get:
            r = pobierz.fetch_day(date(2025, 1, 1), pobierz.URL_OLD, True)
        self.assertIn('2024-12-31', get.call_args.args[0])
        self.assertEqual(r[0], (0, 1, 123.45, 1000.5))

    def test_bledny_naglowek(self):
        with patch.object(pobierz, 'get', return_value=self.strona('dla dostawy w dniu 02-01-2025')):
            with self.assertRaises(RuntimeError):
                pobierz.fetch_day(date(2025, 1, 1), pobierz.URL_OLD, True)

    def test_tgebase_bez_naglowka(self):
        with patch.object(pobierz, 'get', return_value=self.strona('')):
            self.assertEqual(len(pobierz.fetch_day(date(2026, 1, 1), pobierz.URL_NEW, False)), 24)

    def test_same_kreski(self):
        with patch.object(pobierz, 'get', return_value=self.strona(cena='-')):
            with self.assertRaises(pobierz.BrakDanych):
                pobierz.fetch_day(date(2025, 1, 1), pobierz.URL_OLD, True)

    def test_archiwum_h02a(self):
        plik = Path('archiwum/Raport_RDN_dzie_dostawy_delivery_day_2025_10_26.xlsx')
        dane = parse_excel_file(plik)
        self.assertEqual(len(dane), 25)
        powtorzone = [c for d, h, c in dane if h == 2]
        self.assertEqual(len(powtorzone), 2)
        self.assertNotEqual(*powtorzone)


if __name__ == '__main__':
    unittest.main()
