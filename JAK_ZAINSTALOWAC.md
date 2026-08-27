# Instalacja na Androidzie (5 minut)

## Krok 1 — wgraj pliki gdzieś, skąd telefon może je otworzyć przez HTTPS
PWA (i localStorage, na którym stoją notatki) wymaga, żeby strona była serwowana przez **http(s)**, nie otwierana lokalnie jako `file://`. Najprostsze opcje, za darmo, bez konfiguracji serwera:

**Opcja A — Netlify Drop (najszybsza, poleca się)**
1. Wejdź na `app.netlify.com/drop` na komputerze.
2. Przeciągnij **cały folder** (index.html, manifest.json, sw.js, icons/) na stronę.
3. Netlify da Ci adres typu `https://twoja-nazwa.netlify.app` — otwórz go na telefonie.

**Opcja B — GitHub Pages**
1. Załóż repo na GitHub, wrzuć zawartość folderu.
2. Settings → Pages → włącz dla brancha `main`.
3. Adres: `https://twoj-user.github.io/nazwa-repo/`

**Opcja C — dowolny hosting/serwer**, na który masz dostęp (wystarczy zwykły hosting statyczny).

## Krok 2 — zainstaluj na telefonie
1. Otwórz adres w **Chrome na Androidzie**.
2. Chrome pokaże baner „Dodaj Terpeny PL do ekranu głównego" (albo: menu ⋮ → **Zainstaluj aplikację** / **Dodaj do ekranu głównego**).
3. Potwierdź. Ikona pojawi się na ekranie głównym jak zwykła aplikacja, otwiera się w pełnym ekranie, działa offline.

## Ważne o notatkach
- Notatki zapisują się w `localStorage` **tylko na tym telefonie i w tej przeglądarce** — nie synchronizują się między urządzeniami, nie idą na żaden serwer.
- Jeśli wyczyścisz dane przeglądarki/aplikacji w ustawieniach Androida albo odinstalujesz i zainstalujesz od nowa **z innej domeny**, notatki znikną. Rozważ okresowy eksport (mogę dodać przycisk "eksportuj notatki do pliku" jeśli chcesz backupu).
- Dane pacjentów: nawet same inicjały to dane wrażliwe w kontekście medycznym — trzymaj telefon zablokowany PINem/biometrią. To narzędzie nie szyfruje danych w localStorage.

## Rozbudowa na przyszłość
Kod jest w jednym pliku `index.html` — łatwo dopisywać kolejne funkcje. Baza odmian jest teraz osobno, w `strains.json` — aktualizacja bazy to podmiana tego jednego pliku na hostingu, apka sama go wczyta przy następnym otwarciu.

Naturalne następne kroki, o które możesz poprosić:
- Eksport/import notatek do pliku (backup, przenoszenie między telefonami)
- Wyszukiwarka pełnotekstowa po notatkach (np. "znajdź wszystkie notatki z 'HiB'")
- Statystyki: która odmiana ma najwięcej pozytywnych notatek u Twoich pacjentów
- Osobna zakładka "Moi pacjenci" z widokiem wszystkich notatek per pacjent (nie per odmiana)
- Prawdziwy plik .apk przez Capacitor (wymaga Android Studio na Twoim komputerze — mogę przygotować gotowy projekt)

## Sprawdzanie bazy względem oficjalnego rejestru URPL

Dołączony `check_urpl.py` porównuje `strains.json` z Listą Surowców Farmaceutycznych URPL (oficjalny, publiczny rejestr) i mówi, co nowego się pojawiło, co zniknęło (prawdopodobnie wycofane) i gdzie THC/CBD się rozjeżdża. **Nie sprawdza terpenów** — tych URPL nie publikuje, to trzeba nadal weryfikować przez BudCare.pl (ręcznie albo pytając Claude).

Uruchomienie (na komputerze, nie na telefonie):
```bash
pip install -r requirements.txt
python3 check_urpl.py
```

Skrypt nic nie nadpisuje automatycznie — tylko wypisuje raport. Ty decydujesz, co i jak wpisać do `strains.json`. Nie testowałem go na żywym pobraniu z URPL (środowisko, w którym go pisałem, nie miało dostępu do sieci) — logikę dopasowania nazw sprawdziłem na syntetycznych danych, ale przy pierwszym realnym uruchomieniu przejrzyj wynik uważnie. Jeśli skrypt nie znajdzie kolumn w pliku URPL (np. bo zmienili nazewnictwo), wypisze listę dostępnych kolumn — daj mi znać, dopasuję.

Sugerowany rytm: raz na 1–3 miesiące odpal skrypt, i raz na kwartał poproś mnie o pełną weryfikację terpenów względem BudCare (jak teraz).

