# Terpeny PL — filtr terpenowy (narzędzie kliniczne)

PWA do doboru odmian medycznej marihuany dostępnych w polskich aptekach: filtrowanie po terpenach (logika OR/AND), profile THC/CBD/terpeny, notatki kliniczne per odmiana (localStorage, tylko na urządzeniu), ceny i dostępność w aptekach w Rzeszowie.
Cloudflare Worker `apka-terpenowa` (statyczne assets z katalogu głównego). Repo publiczne.

## Właściciel i styl pracy
- Właściciel: lek. Michał Guzik (rezydent onkologii, Rzeszów). Nie jest programistą: tłumacz krótko, po polsku, bez wstępów.
- Na końcu pracy podaj: co się zmieniło, co ma sprawdzić w aplikacji, punkty „do weryfikacji” (zwłaszcza treści medyczne).
- Treści medyczne: nie rozstrzygaj po cichu niejednoznaczności, oznacz je „do weryfikacji”.

## Wdrożenie
- Hosting: **wyłącznie Cloudflare** (Workers + Workers Builds). **Nigdy Netlify.**
- Push na `main` = automatyczny deploy w ~30–60 s. Nie trzeba niczego wgrywać ręcznie.
- Po zmianie plików aplikacji podbij wersję cache w service workerze (patrz niżej), inaczej telefony zostaną na starej wersji.
- Przed pushem: `node --check` dla zmienionych plików JS i szybki test lokalny.
- Nie commituj sekretów. Sekrety ustawia się w Cloudflare → Worker → Settings → Variables and Secrets.
- Commity po polsku, krótko, w trybie rozkazującym („Dodaj…”, „Popraw…”).

## Architektura
- `index.html` — cała aplikacja (jeden plik). Wczytuje `strains.json` z `cache: 'no-store'`.
- `strains.json` — baza: `meta` (`last_updated`, źródła, legenda `verified`) + `strains`. Aktualizacja bazy = edycja tego pliku + zmiana `meta.last_updated`.
  - `verified: true` = % terpenów potwierdzone na BudCare.pl; `'partial'` = obecność potwierdzona bez wiarygodnych %; `false` = niepotwierdzone.
  - Źródła cen: NR (Niezapominajka Rejtana), DM (Dr.Max 3-go Maja), NM (Niezapominajka Mickiewicza).
- `check_urpl.py` — porównanie bazy z Listą Surowców Farmaceutycznych URPL (nowe, wycofane, rozbieżności THC/CBD). Tylko raport, nic nie nadpisuje.
- `offers.json` — ceny i stany (dużo/średnio/mało/brak) z arkuszy Google aptek. Zapisuje go WYŁĄCZNIE Apps Script `tools/apps-script/Arkusze.gs` (konto dostepnosc.cannabis, co 30 min). Nie edytuj ręcznie. `index.html` (`applyOffers`) dla apteki obecnej w offers.json z niepustą listą ofert nadpisuje jej ceny/dostępność ze `strains.json`; dopasowanie po kluczu producent_nazwa_thc (`slugPl`, identyczny jak w generatorze). Dokładna liczba opakowań nie trafia do offers.json (plik publiczny).
- `tools/build_template.py` — generator szablonu XLSX dla aptek (ceny, stan dużo/średnio/mało/brak, arkusz „Do druku”) z `strains.json`. Po zmianie listy odmian wygeneruj ponownie i podbij `template_version`. Katalog `tools/` nie jest publikowany (`.assetsignore`).
- `sw.js` — `CACHE_NAME` (np. `terpeny-pl-v1`) podbijaj po zmianach `index.html`.
- `.assetsignore` — pliki nie publikowane jako strona.
- Z `strains.json` korzysta też repo `dzienniczek-terapii` (`public/catalog.js`).

## Uwagi
- `JAK_ZAINSTALOWAC.md` — instrukcja dla użytkownika (hosting, instalacja na Androidzie, skrypt URPL).
- Nazwa w `wrangler.jsonc` (`apkaterpenowa`) różni się od nazwy Workera w Cloudflare (`apka-terpenowa`); deploy działa — nie zmieniaj bez potrzeby.
- Plik `1` w katalogu głównym to prawdopodobnie śmieć (1 bajt).
