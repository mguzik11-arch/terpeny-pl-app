/**
 * Arkusze aptek → offers.json (terpeny-pl-app)
 *
 * Osobny projekt Apps Script na koncie dostepnosc.cannabis@gmail.com.
 * NIE zastępuje obecnego skryptu od maili — działa obok niego i zapisuje
 * do innego pliku (offers.json), więc oba automaty nie nadpisują sobie danych.
 *
 * Funkcje do uruchamiania z edytora (menu „Uruchom”):
 *   1. utworzArkusze()        — tworzy arkusz dla każdej apteki z listy APTEKI (pomija istniejące)
 *   2. udostepnijArkusze()    — udostępnia arkusze na adresy e-mail wpisane w APTEKI
 *   3. odczytajArkusze()      — czyta arkusze i zapisuje offers.json do repo (tylko gdy coś się zmieniło)
 *   4. zainstalujWyzwalacz()  — uruchamia odczytajArkusze() automatycznie co 30 minut
 *   5. aktualizujListeOdmian()— dopisuje nowe odmiany z strains.json do istniejących arkuszy (wpisy aptek zostają)
 *   6. pokazLinki()           — wysyła Ci mailem linki do wszystkich arkuszy
 *   7. ustawDostepLekarza()   — (po wdrożeniu jako aplikacja internetowa) wysyła Ci link, który w Twojej
 *                               przeglądarce włącza w apce dokładne liczby opakowań (widoczne tylko dla Ciebie)
 *
 * Ustawienia skryptu (Project Settings → Script Properties):
 *   GITHUB_TOKEN = token GitHub z prawem zapisu do repo (ten sam rodzaj co w obecnym skrypcie)
 */

// ───────────────────────────── KONFIGURACJA ─────────────────────────────

// „nazwa” MUSI być identyczna jak nazwa apteki w apce (PHARMACY_META w index.html).
// „email” = konto Google osoby, która będzie wypełniać arkusz (może być prywatne). Puste = jeszcze nie udostępniamy.
const APTEKI = [
  { kod: 'NR', nazwa: 'Niezapominajka Rzeszów Rejtana',                tytul: 'Apteka Niezapominajka, ul. Rejtana, Rzeszów',        email: '' },
  { kod: 'NM', nazwa: 'Niezapominajka Rzeszów (ul. Mickiewicza 12)',    tytul: 'Apteka Niezapominajka, ul. Mickiewicza 12, Rzeszów', email: '' },
  { kod: 'DM', nazwa: 'Dr.Max (ul. 3-go Maja 16, Rzeszów)',             tytul: 'Apteka Dr.Max, ul. 3-go Maja 16, Rzeszów',            email: '' },
  { kod: 'AG', nazwa: 'Apteki Gemini (ul. Kolejowa, Rzeszów)',          tytul: 'Apteka Gemini, ul. Kolejowa, Rzeszów',                email: '' },
  { kod: 'TL', nazwa: 'Apteka Twoje Leki (ul. Pułaskiego, Rzeszów)',    tytul: 'Apteka Twoje Leki, ul. Pułaskiego, Rzeszów',          email: '' }
];

const REPO = 'mguzik11-arch/terpeny-pl-app';
const BRANCH = 'main';
const OFFERS_PATH = 'offers.json';
const STRAINS_URL = 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/strains.json';
const POWIADOMIENIA = 'mguzik11@gmail.com';     // tu idą linki i alerty o odmianach spoza listy
const APKA_URL = 'https://apka-terpenowa.mguzik11.workers.dev/';
const FOLDER_NAZWA = 'Arkusze aptek — terpeny-pl';
const TEMPLATE_VERSION = 'G1';
const WYKLUCZONE = [['Aurora', 'Delahaze']];      // wycofane z obrotu

const STANY = ['dużo (15+)', 'średnio (5–14)', 'mało (1–4)', 'brak'];
const HDR = 6, R0 = 7;                            // wiersz nagłówka, pierwszy wiersz danych
// kolumny arkusza „Stany i ceny”
const C = { ID: 1, PROD: 2, NAZWA: 3, THC: 4, OPAK: 5, CENA: 6, STAN: 7, LICZBA: 8, NOWOSC: 9, EFEKT: 10 };

// ───────────────────────────── FUNKCJE CZYSTE (testowalne) ─────────────────────────────

function slugPl(s) {
  return String(s).replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .normalize('NFKD').replace(/[^\x00-\x7F]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Wiersze szablonu z strains.json — ta sama logika i te same ID co w tools/build_template.py. */
function zbudujWiersze(strains) {
  const rows = [];
  strains.forEach(function (x) {
    if (WYKLUCZONE.some(function (w) { return w[0] === x.producer && w[1] === x.name; })) return;
    const packs = [];
    (x.prices || []).forEach(function (p) { if (p.package_g && packs.indexOf(p.package_g) === -1) packs.push(p.package_g); });
    packs.sort(function (a, b) { return a - b; });
    const raw = String(x.thc).replace(/%/g, '').trim();
    const thcs = /[–-]/.test(raw) ? raw.split(/[–-]/).map(function (t) { return t.trim(); }) : [raw];
    thcs.forEach(function (thc) {
      (packs.length ? packs : [null]).forEach(function (pk) {
        const klucz = slugPl(x.producer) + '_' + slugPl(x.name) + '_' + slugPl(thc);
        rows.push({ id: klucz + '_' + (pk ? pk : 'x') + 'g', klucz: klucz, producer: x.producer, name: x.name,
                    thc: thc + '%', pack: pk });
      });
    });
  });
  rows.sort(function (a, b) {
    return a.producer.toLowerCase().localeCompare(b.producer.toLowerCase()) ||
           a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
           a.thc.localeCompare(b.thc) || (a.pack || 0) - (b.pack || 0);
  });
  return rows;
}

function stanZLiczby(n) {
  if (n === 0) return 'brak';
  if (n <= 4) return 'mało (1–4)';
  if (n <= 14) return 'średnio (5–14)';
  return 'dużo (15+)';
}

/** Stan efektywny: liczba opakowań (jeśli wpisana) ma pierwszeństwo przed listą. */
function stanEfektywny(stan, liczba) {
  if (typeof liczba === 'number' && liczba >= 0) return stanZLiczby(Math.round(liczba));
  return STANY.indexOf(stan) !== -1 ? stan : '';
}

function doIso(d) {
  if (d instanceof Date && !isNaN(d)) return Utilities.formatDate(d, 'Europe/Warsaw', 'yyyy-MM-dd');
  return '';
}

// ───────────────────────────── TWORZENIE ARKUSZY ─────────────────────────────

function utworzArkusze() {
  const strains = pobierzStrains_();
  const rows = zbudujWiersze(strains);
  const folder = folder_();
  const props = PropertiesService.getScriptProperties();
  const utworzone = [];
  APTEKI.forEach(function (a) {
    if (props.getProperty('SHEET_' + a.kod)) return;
    const ss = SpreadsheetApp.create('Stany i ceny konopi — ' + a.tytul);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    zbudujArkusz_(ss, a, rows);
    props.setProperty('SHEET_' + a.kod, ss.getId());
    utworzone.push(a.kod + ': ' + ss.getUrl());
  });
  Logger.log(utworzone.length ? 'Utworzono:\n' + utworzone.join('\n') : 'Wszystkie arkusze już istnieją.');
  if (utworzone.length) pokazLinki();
}

function zbudujArkusz_(ss, a, rows, nowaZakladka) {
  const ws = nowaZakladka ? ss.insertSheet('Stany i ceny', 0) : ss.getSheets()[0].setName('Stany i ceny');
  const last = R0 + rows.length - 1;
  ws.setHiddenGridlines(true);
  ws.getRange('A1').setValue('Stany i ceny surowców farmaceutycznych konopi').setFontSize(14).setFontWeight('bold').setFontColor('#1F4E78');
  ws.getRange('A2').setValue('Wypełniaj tylko żółte pola. Pusta cena = apteka nie prowadzi tej odmiany. Zmiany zapisują się same.')
    .setFontStyle('italic').setFontColor('#595959');
  ws.getRange('B3:B4').setValues([['Apteka:'], ['Data stanu:']]).setFontWeight('bold').setHorizontalAlignment('right');
  ws.getRange('C3:E3').merge(); ws.getRange('C4:E4').merge();
  ws.getRange('C3').setValue(a.tytul);
  ws.getRange('C4').setValue(new Date()).setNumberFormat('dd.MM.yyyy');
  ws.getRange('C3:E4').setBackground('#FFF2CC').setBorder(true, true, true, true, true, true, '#BFBFBF', null);

  const headers = ['ID (nie zmieniać)', 'Producent', 'Nazwa odmiany', 'THC', 'Opakowanie (g)', 'Cena (zł/op.)',
                   'Stan', 'Liczba op. (opcjonalnie)', 'Nowość', 'stan_efekt'];
  ws.getRange(HDR, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setFontColor('#FFFFFF')
    .setBackground('#1F4E78').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  ws.setRowHeight(HDR, 36);
  [230, 150, 210, 60, 90, 95, 120, 110, 70, 90].forEach(function (w, i) { ws.setColumnWidth(i + 1, w); });

  const data = rows.map(function (r) { return [r.id, r.producer, r.name, r.thc, r.pack || '']; });
  ws.getRange(R0, 1, rows.length, 5).setValues(data).setBackground('#F2F2F2');
  ws.getRange(R0, 1, rows.length, 1).setFontColor('#808080').setFontSize(8);
  ws.getRange(R0, 3, rows.length, 1).setFontWeight('bold');
  ws.getRange(R0, 4, rows.length, 2).setHorizontalAlignment('center');
  ws.getRange(R0, C.CENA, rows.length, 4).setBackground('#FFF2CC').setFontColor('#0000FF').setHorizontalAlignment('center');
  ws.getRange(R0, C.LICZBA, rows.length, 1).setBackground('#FFFBEA');
  ws.getRange(R0, C.CENA, rows.length, 1).setNumberFormat('#,##0.00 "zł"');
  ws.getRange(R0, C.LICZBA, rows.length, 1).setNumberFormat('0');
  ws.getRange(HDR, 1, rows.length + 1, 9).setBorder(true, true, true, true, true, true, '#BFBFBF', null);

  // ukryta kolumna stanu efektywnego (liczba ma pierwszeństwo przed listą) — używa jej „Do druku”
  const f = [];
  for (let n = R0; n <= last; n++) {
    f.push(['=IF(F' + n + '="","",IF(ISNUMBER(H' + n + '),IF(H' + n + '=0,"brak",IF(H' + n + '<=4,"mało (1–4)",' +
            'IF(H' + n + '<=14,"średnio (5–14)","dużo (15+)"))),G' + n + '))']);
  }
  ws.getRange(R0, C.EFEKT, rows.length, 1).setFormulas(f);
  ws.hideColumns(C.EFEKT);

  // walidacja
  const priceRule = SpreadsheetApp.newDataValidation().requireNumberBetween(1, 5000).setAllowInvalid(false)
    .setHelpText('Cena brutto za opakowanie w zł. Puste = apteka nie prowadzi tej odmiany.').build();
  ws.getRange(R0, C.CENA, rows.length, 1).setDataValidation(priceRule);
  const stanRule = SpreadsheetApp.newDataValidation().requireValueInList(STANY, true).setAllowInvalid(false)
    .setHelpText('dużo = 15+ op. · średnio = 5–14 · mało = 1–4 · brak = 0. Zmieniaj, gdy stan przejdzie do innej grupy.').build();
  ws.getRange(R0, C.STAN, rows.length, 1).setDataValidation(stanRule);
  const liczbaRule = SpreadsheetApp.newDataValidation().requireFormulaSatisfied('=OR(H' + R0 + '="",AND(ISNUMBER(H' + R0 + '),H' + R0 + '>=0,H' + R0 + '=INT(H' + R0 + ')))')
    .setAllowInvalid(false).setHelpText('Dla chętnych: dokładna liczba opakowań (wtedy nie trzeba wybierać stanu).').build();
  ws.getRange(R0, C.LICZBA, rows.length, 1).setDataValidation(liczbaRule);
  const nowRule = SpreadsheetApp.newDataValidation().requireValueInList(['TAK'], true).setAllowInvalid(false)
    .setHelpText('TAK = na wydruku pojawi się „★ NOWOŚĆ”.').build();
  ws.getRange(R0, C.NOWOSC, rows.length, 1).setDataValidation(nowRule);
  const packRule = SpreadsheetApp.newDataValidation().requireValueInList(['5', '10', '15'], true).setAllowInvalid(false)
    .setHelpText('Wybierz gramaturę opakowania.').build();
  ws.getRange('C4').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());

  // formatowanie warunkowe
  const cf = [];
  const g = ws.getRange(R0, C.STAN, rows.length, 2);
  cf.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($F' + R0 + '<>"",$G' + R0 + '="",$H' + R0 + '="")')
    .setBackground('#FFC7CE').setFontColor('#9C0006').setRanges([g]).build());
  cf.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(
    '=AND($G' + R0 + '<>"",ISNUMBER($H' + R0 + '),$G' + R0 + '<>IF($H' + R0 + '=0,"brak",IF($H' + R0 + '<=4,"mało (1–4)",IF($H' + R0 + '<=14,"średnio (5–14)","dużo (15+)"))))')
    .setBackground('#FFC7CE').setFontColor('#9C0006').setRanges([g]).build());
  const gs = ws.getRange(R0, C.STAN, rows.length, 1);
  [['dużo', '#C6EFCE', '#006100'], ['średnio', '#E2F0D9', '#38761D'], ['mało', '#FCE4D6', '#C55A11'], ['brak', '#FFEB9C', '#9C5700']]
    .forEach(function (t) {
      cf.push(SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith(t[0]).setBackground(t[1]).setFontColor(t[2])
        .setBold(true).setRanges([gs]).build());
    });
  ws.setConditionalFormatRules(cf);

  ws.setFrozenRows(HDR);
  ws.setFrozenColumns(3);

  // ochrona: apteka edytuje tylko żółte pola
  const unprot = [ws.getRange('C3:C4'), ws.getRange(R0, C.CENA, rows.length, 4)];
  rows.forEach(function (r, i) {
    if (!r.pack) {
      const cell = ws.getRange(R0 + i, C.OPAK);
      cell.setBackground('#FFF2CC').setDataValidation(packRule).setNote('Gramatura nieznana w bazie: wybierz 5, 10 lub 15 g');
      unprot.push(cell);
    }
  });
  zablokuj_(ws.protect().setDescription('Lista odmian (nie zmieniać)').setUnprotectedRanges(unprot));

  zbudujDoDruku_(ss, last);
  zbudujInnaOdmiana_(ss);
  zbudujInstrukcje_(ss);
  const meta = ss.insertSheet('meta');
  meta.getRange('A1:B4').setValues([['template_version', TEMPLATE_VERSION], ['kod_apteki', a.kod],
                                     ['nazwa_apteki', a.nazwa], ['rows', rows.length]]);
  zablokuj_(meta.protect());
  meta.hideSheet();
  ss.setActiveSheet(ws);
}

function zbudujDoDruku_(ss, last) {
  const p = ss.insertSheet('Do druku');
  p.setHiddenGridlines(true);
  const S = "'Stany i ceny'!";
  p.getRange('A1:G1').merge(); p.getRange('A2:G2').merge(); p.getRange('A3:G3').merge();
  p.getRange('A1').setFormula('=IF(' + S + 'C3="","Surowce farmaceutyczne konopi",' + S + 'C3)').setFontSize(16).setFontWeight('bold').setFontColor('#1F4E78');
  p.getRange('A2').setValue('Dostępne surowce farmaceutyczne konopi: ceny i dostępność').setFontColor('#404040');
  p.getRange('A3').setFormula('=IF(' + S + 'C4="","Stan na: —","Stan na: "&TEXT(' + S + 'C4,"dd.mm.yyyy"))').setFontWeight('bold');
  p.getRange('A1:A3').setHorizontalAlignment('center');
  p.getRange('A5:G5').setValues([['Producent', 'Nazwa odmiany', 'THC', 'Opak. (g)', 'Cena (zł/op.)', 'zł/g', 'Dostępność']])
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F4E78').setHorizontalAlignment('center');
  const rg = function (col) { return S + col + R0 + ':' + col + last; };
  const status = 'IF(LEFT(' + rg('J') + ',4)="brak","chwilowy brak",IF(LEFT(' + rg('J') + ',4)="mało","ostatnie sztuki",' +
                 'IF(' + rg('J') + '="","—","dostępna")))';
  p.getRange('A6').setFormula('=IFERROR(ARRAYFORMULA(FILTER({' + rg('B') + ',' + rg('C') + '&IF(' + rg('I') + '="TAK","  ★ NOWOŚĆ",""),' +
    rg('D') + ',' + rg('E') + ',' + rg('F') + ',IF(' + rg('E') + '="","",' + rg('F') + '/' + rg('E') + '),' + status + '},' +
    rg('F') + '<>"")),"")');
  [150, 230, 55, 70, 95, 70, 120].forEach(function (w, i) { p.setColumnWidth(i + 1, w); });
  p.getRange('E6:E200').setNumberFormat('#,##0.00 "zł"');
  p.getRange('F6:F200').setNumberFormat('#,##0.00');
  p.getRange('C6:G200').setHorizontalAlignment('center');
  p.getRange('B6:B200').setFontWeight('bold');
  p.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($B6<>"",ISEVEN(ROW()))').setBackground('#F2F2F2').setRanges([p.getRange('A6:G200')]).build()]);
  zablokuj_(p.protect().setDescription('Wydruk tworzy się sam'));
}

function zbudujInnaOdmiana_(ss) {
  const s = ss.insertSheet('Inna odmiana');
  s.setHiddenGridlines(true);
  s.getRange('A1').setValue('Odmiany spoza listy').setFontSize(14).setFontWeight('bold').setFontColor('#1F4E78');
  s.getRange('A2').setValue('Wpisz tu surowce, których nie ma w arkuszu „Stany i ceny”. Dodam je do listy.').setFontStyle('italic').setFontColor('#595959');
  s.getRange('A4:H4').setValues([['Producent', 'Nazwa odmiany', 'THC', 'Opakowanie (g)', 'Cena (zł/op.)', 'Stan', 'Kod EAN (opcjonalnie)', 'Uwagi']])
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F4E78').setHorizontalAlignment('center').setWrap(true);
  s.getRange('A5:H24').setBackground('#FFF2CC').setFontColor('#0000FF').setBorder(true, true, true, true, true, true, '#BFBFBF', null);
  s.getRange('F5:F24').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STANY, true).build());
  s.getRange('D5:D24').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['5', '10', '15'], true).build());
  s.getRange('E5:E24').setNumberFormat('#,##0.00 "zł"');
  s.getRange('G5:G24').setNumberFormat('@');
  [150, 200, 60, 90, 95, 120, 140, 200].forEach(function (w, i) { s.setColumnWidth(i + 1, w); });
  s.setFrozenRows(4);
}

function zbudujInstrukcje_(ss) {
  const s = ss.insertSheet('Instrukcja', 0);
  s.setHiddenGridlines(true);
  s.setColumnWidth(1, 20); s.setColumnWidth(2, 760);
  const lines = [
    ['Instrukcja wypełniania', 't'], ['', ''],
    ['Wypełniamy tylko żółte pola. Zmiany zapisują się same — nie trzeba niczego wysyłać.', 'b'], ['', ''],
    ['1. W arkuszu „Stany i ceny” sprawdź nazwę apteki i wpisz datę stanu (pola na górze).', ''],
    ['2. Przy każdej odmianie, którą apteka prowadzi, wpisz cenę za opakowanie (zł) i wybierz stan z listy.', ''],
    ['    Dla chętnych: zamiast stanu możesz wpisać dokładną liczbę opakowań.', ''],
    ['3. Odmiany, których apteka nie prowadzi, zostaw puste.', ''],
    ['    Ta sama odmiana w różnych stężeniach THC lub gramaturach ma osobne wiersze: wpisz w wierszu, który się zgadza.', ''],
    ['4. Przy kolejnej aktualizacji zmieniaj tylko to, co się zmieniło. Stan zmieniaj, gdy przejdzie do innej grupy (np. ze „średnio” na „mało”).', ''],
    ['5. Surowiec spoza listy wpisz w arkuszu „Inna odmiana”. Nowość w ofercie oznacz „TAK” w kolumnie Nowość.', ''],
    ['6. Cennik przy kasę: otwórz arkusz „Do druku” → Plik → Drukuj (Ctrl+P) → „Dopasuj do szerokości”.', ''],
    ['7. Chcesz cennik ozdobić po swojemu? W „Do druku” zaznacz tabelę, skopiuj (Ctrl+C) i wklej do Worda lub Dokumentów Google.', ''],
    ['', ''], ['Stany:', 'b'],
    ['•  dużo → 15 i więcej opakowań', ''], ['•  średnio → 5–14 opakowań', ''],
    ['•  mało → 1–4 opakowania (na wydruku: „ostatnie sztuki”)', ''],
    ['•  brak → odmiana w ofercie, chwilowo brak (czekamy na dostawę)', ''],
    ['•  Cena wpisana, a stan i liczba puste → pola podświetlą się na czerwono', ''],
    ['', ''], ['Pytania: lek. Michał Guzik, dostepnosc.cannabis@gmail.com', 'i']
  ];
  s.getRange(1, 2, lines.length, 1).setValues(lines.map(function (l) { return [l[0]]; })).setWrap(true);
  lines.forEach(function (l, i) {
    const c = s.getRange(i + 1, 2);
    if (l[1] === 't') c.setFontSize(14).setFontWeight('bold').setFontColor('#1F4E78');
    if (l[1] === 'b') c.setFontWeight('bold');
    if (l[1] === 'i') c.setFontStyle('italic').setFontColor('#595959');
  });
  zablokuj_(s.protect());
}

function zablokuj_(prot) {
  prot.removeEditors(prot.getEditors());
  if (prot.canDomainEdit()) prot.setDomainEdit(false);
  return prot;
}

// ───────────────────────────── UDOSTĘPNIANIE ─────────────────────────────

function udostepnijArkusze() {
  const props = PropertiesService.getScriptProperties();
  APTEKI.forEach(function (a) {
    const id = props.getProperty('SHEET_' + a.kod);
    if (!id || !a.email) return;
    const ss = SpreadsheetApp.openById(id);
    const juz = ss.getEditors().map(function (u) { return u.getEmail().toLowerCase(); });
    if (juz.indexOf(a.email.toLowerCase()) !== -1) return;
    ss.addEditor(a.email);   // Google wysyła tej osobie zaproszenie mailem
    Logger.log('Udostępniono ' + a.kod + ' → ' + a.email);
  });
}

function pokazLinki() {
  const props = PropertiesService.getScriptProperties();
  const lines = APTEKI.map(function (a) {
    const id = props.getProperty('SHEET_' + a.kod);
    return a.kod + ' — ' + a.tytul + ':\n' + (id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : '(jeszcze nie utworzony)') +
           (a.email ? '\n  udostępniony dla: ' + a.email : '\n  jeszcze nieudostępniony');
  });
  MailApp.sendEmail(POWIADOMIENIA, 'Arkusze aptek — linki', lines.join('\n\n'));
  Logger.log(lines.join('\n\n'));
}

// ───────────────────────────── AKTUALIZACJA LISTY ODMIAN ─────────────────────────────

/** Dopisuje nowe odmiany z strains.json do istniejących arkuszy. Wpisy aptek (cena, stan, liczba, nowość) zostają przy swoich ID. */
function aktualizujListeOdmian() {
  const rows = zbudujWiersze(pobierzStrains_());
  const props = PropertiesService.getScriptProperties();
  APTEKI.forEach(function (a) {
    const id = props.getProperty('SHEET_' + a.kod);
    if (!id) return;
    const ss = SpreadsheetApp.openById(id);
    const ws = ss.getSheetByName('Stany i ceny');
    const n = ws.getLastRow() - R0 + 1;
    const stare = n > 0 ? ws.getRange(R0, 1, n, 9).getValues() : [];
    const wpisy = {};
    stare.forEach(function (r) { if (r[0]) wpisy[r[0]] = { opak: r[4], vals: [r[5], r[6], r[7], r[8]] }; });
    const nowe = rows.filter(function (r) { return !wpisy[r.id]; });
    if (!nowe.length) { Logger.log(a.kod + ': bez zmian'); return; }
    // przebudowujemy zakładki w tym samym pliku (link dla apteki się nie zmienia) i przepisujemy wpisy po ID
    ss.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
    ['Stany i ceny', 'Do druku', 'Inna odmiana', 'Instrukcja', 'meta'].forEach(function (nm) {
      const sh = ss.getSheetByName(nm);
      if (sh && nm !== 'Inna odmiana') { if (nm === 'Stany i ceny') sh.setName('_stary'); else ss.deleteSheet(sh); }
    });
    const inna = ss.getSheetByName('Inna odmiana');
    const innaVals = inna ? inna.getRange('A5:H24').getValues() : null;
    if (inna) ss.deleteSheet(inna);
    const stary = ss.getSheetByName('_stary');
    const c3 = stary.getRange('C3').getValue(), c4 = stary.getRange('C4').getValue();
    zbudujArkusz_(ss, a, rows, true);
    const ws2 = ss.getSheetByName('Stany i ceny');
    ws2.getRange('C3').setValue(c3); ws2.getRange('C4').setValue(c4);
    const out = rows.map(function (r) { return wpisy[r.id] ? wpisy[r.id].vals : ['', '', '', '']; });
    ws2.getRange(R0, C.CENA, out.length, 4).setValues(out);
    rows.forEach(function (r, i) { if (!r.pack && wpisy[r.id] && wpisy[r.id].opak) ws2.getRange(R0 + i, C.OPAK).setValue(wpisy[r.id].opak); });
    if (innaVals) ss.getSheetByName('Inna odmiana').getRange('A5:H24').setValues(innaVals);
    ss.deleteSheet(stary);
    Logger.log(a.kod + ': dodano ' + nowe.length + ' odmian');
  });
}

// ───────────────────────────── ODCZYT → offers.json ─────────────────────────────

function odczytajArkusze() {
  const props = PropertiesService.getScriptProperties();
  const apteki = [];
  const inneAlert = [];
  APTEKI.forEach(function (a) {
    const id = props.getProperty('SHEET_' + a.kod);
    if (!id) return;
    const ss = SpreadsheetApp.openById(id);
    const ws = ss.getSheetByName('Stany i ceny');
    const n = ws.getLastRow() - R0 + 1;
    if (n <= 0) return;
    const vals = ws.getRange(R0, 1, n, 9).getValues();
    const oferty = [];
    vals.forEach(function (r) {
      const id_ = r[0], cena = r[5];
      if (!id_ || typeof cena !== 'number' || cena <= 0) return;
      const opak = Number(r[4]) || null;
      const stan = stanEfektywny(r[6], r[7] === '' ? null : r[7]);
      oferty.push({ id: id_, klucz: String(id_).replace(/_[^_]+g$/, ''), cena: cena, opak_g: opak,
                    cena_g: opak ? Math.round(cena / opak * 100) / 100 : null,
                    stan: stan || null, nowosc: r[8] === 'TAK' });
      // UWAGA: dokładna liczba opakowań NIE trafia do offers.json (plik jest publiczny).
      // Lekarz widzi ją w apce przez prywatny endpoint doGet() poniżej (klucz tylko w jego przeglądarce).
    });
    const c4 = ws.getRange('C4').getValue();
    const zmieniono = DriveApp.getFileById(id).getLastUpdated();
    apteki.push({ kod: a.kod, nazwa: a.nazwa, data_stanu: doIso(c4) || doIso(zmieniono),
                  zmieniono: Utilities.formatDate(zmieniono, 'Europe/Warsaw', "yyyy-MM-dd'T'HH:mm"), oferty: oferty });
    const inna = ss.getSheetByName('Inna odmiana');
    if (inna) inna.getRange('A5:H24').getValues().forEach(function (r) {
      if (r[0] || r[1]) inneAlert.push(a.kod + ': ' + r.slice(0, 6).join(' | '));
    });
  });

  const tresc = { schema: 1, apteki: apteki };
  const json = JSON.stringify(tresc, null, 2);
  const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, json, Utilities.Charset.UTF_8));
  if (props.getProperty('OFFERS_HASH') !== hash) {
    zapiszNaGitHub_(OFFERS_PATH, json + '\n', 'Auto-update stanów z arkuszy aptek (' + doIso(new Date()) + ')');
    props.setProperty('OFFERS_HASH', hash);
    Logger.log('offers.json zaktualizowany');
  } else {
    Logger.log('Bez zmian w arkuszach — nic nie commituję.');
  }

  // alert o odmianach spoza listy (tylko gdy lista się zmieniła)
  const innaHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, inneAlert.join('\n'), Utilities.Charset.UTF_8));
  if (inneAlert.length && props.getProperty('INNE_HASH') !== innaHash) {
    MailApp.sendEmail(POWIADOMIENIA, 'Arkusze aptek — odmiany spoza listy do dodania',
      'Apteki wpisały odmiany, których nie ma w strains.json:\n\n' + inneAlert.join('\n') +
      '\n\n(Producent | Nazwa | THC | Opakowanie | Cena | Stan)');
  }
  props.setProperty('INNE_HASH', innaHash);
}

function zainstalujWyzwalacz() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'odczytajArkusze') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('odczytajArkusze').timeBased().everyMinutes(30).create();
  Logger.log('Wyzwalacz ustawiony: odczytajArkusze co 30 minut.');
}

// ───────────────────────────── POMOCNICZE ─────────────────────────────

function pobierzStrains_() {
  const res = UrlFetchApp.fetch(STRAINS_URL + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Nie udało się pobrać strains.json: HTTP ' + res.getResponseCode());
  return JSON.parse(res.getContentText()).strains;
}

function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAZWA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAZWA);
}

function zapiszNaGitHub_(path, content, message) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Brak GITHUB_TOKEN w Ustawieniach projektu → Właściwości skryptu.');
  const url = 'https://api.github.com/repos/' + REPO + '/contents/' + path;
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
  const get = UrlFetchApp.fetch(url + '?ref=' + BRANCH, { headers: headers, muteHttpExceptions: true });
  const body = { message: message, branch: BRANCH,
                 content: Utilities.base64Encode(content, Utilities.Charset.UTF_8) };
  if (get.getResponseCode() === 200) body.sha = JSON.parse(get.getContentText()).sha;
  const put = UrlFetchApp.fetch(url, { method: 'put', headers: headers, contentType: 'application/json',
                                      payload: JSON.stringify(body), muteHttpExceptions: true });
  if (put.getResponseCode() >= 300) throw new Error('GitHub: HTTP ' + put.getResponseCode() + ' ' + put.getContentText().slice(0, 300));
}

// ───────────────────────────── DOSTĘP LEKARZA: dokładne liczby opakowań ─────────────────────────────
// Aplikacja internetowa (Wdróż → Nowe wdrożenie → Aplikacja internetowa, „Wykonaj jako: Ja”, „Dostęp: Każdy”).
// Bez poprawnego klucza zwraca błąd i żadnych danych. Liczby czytane są na żywo z arkuszy.

function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const klucz = props.getProperty('LICZBY_KEY');
  const out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  if (!klucz || !e || !e.parameter || e.parameter.key !== klucz) return out({ error: 'unauthorized' });
  const apteki = {};
  APTEKI.forEach(function (a) {
    const id = props.getProperty('SHEET_' + a.kod);
    if (!id) return;
    const ws = SpreadsheetApp.openById(id).getSheetByName('Stany i ceny');
    const n = ws.getLastRow() - R0 + 1;
    if (n <= 0) return;
    const m = {};
    ws.getRange(R0, 1, n, 9).getValues().forEach(function (r) {
      if (r[0] && typeof r[5] === 'number' && typeof r[7] === 'number') m[r[0]] = r[7];
    });
    apteki[a.nazwa] = m;
  });
  return out({ wygenerowano: Utilities.formatDate(new Date(), 'Europe/Warsaw', "yyyy-MM-dd'T'HH:mm"), apteki: apteki });
}

/** Tworzy (lub zmienia) prywatny klucz i wysyła Ci link włączający liczby w apce. Uruchom PO wdrożeniu aplikacji internetowej. */
function ustawDostepLekarza() {
  const url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('Najpierw wdróż skrypt jako aplikację internetową (Wdróż → Nowe wdrożenie → Aplikacja internetowa).');
  const klucz = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('LICZBY_KEY', klucz);
  const link = APKA_URL + '?klucz=' + klucz + '&zrodlo=' + encodeURIComponent(url);
  MailApp.sendEmail(POWIADOMIENIA, 'Apka terpenowa — włączenie dokładnych liczb opakowań',
    'Otwórz ten link na każdym swoim urządzeniu (telefon, komputer), na którym chcesz widzieć dokładne liczby:\n\n' + link +
    '\n\nLink zapisuje klucz tylko w tej przeglądarce. Nie przesyłaj go nikomu.\n' +
    'Żeby unieważnić stare linki, uruchom ustawDostepLekarza() ponownie — dostaniesz nowy.');
  Logger.log('Wysłano link na ' + POWIADOMIENIA);
}

// eksport dla testów w Node (w Apps Script ignorowane)
if (typeof module !== 'undefined') module.exports = { slugPl: slugPl, zbudujWiersze: zbudujWiersze, stanEfektywny: stanEfektywny };
