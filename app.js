/* Vereinskasse – Konfiguration, Kassenlogik, Darstellung.
   Keine Speicherung (kein localStorage/Cookies), keine Netzwerkzugriffe. Alles liegt im Arbeitsspeicher. */
'use strict';

/* ================= 1. KONFIGURATION (hier Preise und Texte pflegen) ================= */
const KONFIG = {
  version: '1.0',
  preisstand: '01.12.2026',      // Bei jeder Preisänderung anpassen, damit alte Caches auffallen
  pfandCent: 200,                // Pfand pro Stück in Cent
  maxCent: 99999,                // Maximal eingebbarer Betrag: 999,99 €
  schnellwahlCent: [500, 1000, 2000, 5000],
  bereiche: [
    // layout: 'liste' = Produkte untereinander; ohne Angabe = Kacheln nebeneinander
    { id: 'gluehhuette', name: 'Glühhütte/Schneebar', farbe: '#9b1c3a', pfandAktiv: true, produkte: [
      { id: 'gw-rot',   name: 'Glühwein Rot',        cent: 350 },
      { id: 'gw-weiss', name: 'Glühwein Weiß',       cent: 350 },
      { id: 'gw-chard', name: 'Glühwein Chardonnay', cent: 450 },
      { id: 'gw-dorn',  name: 'Glühwein Dornfelder', cent: 550 },
      { id: 'kinder',   name: 'Kinderpunsch',        cent: 300 },
      { id: 'schnaps',  name: 'Schnaps',             cent: 250 },
      { id: 'bier',     name: 'Bier',                cent: 400 },
      { id: 'colamix',  name: 'Cola Mix',            cent: 350 },
      { id: 'schorle',  name: 'Apfelschorle',        cent: 350 },
      { id: 'wasser',   name: 'Wasser',              cent: 300 } ] },
    { id: 'spaetzle', name: 'Spätzlehütte', farbe: '#8f5410', pfandAktiv: false, layout: 'liste', produkte: [
      { id: 'kaesespaetzle', name: 'Käsespätzle', cent: 550 },
      { id: 'churros',       name: 'Churros mit Zimt und Zucker', cent: 500 },
      { id: 'churros-soße',  name: 'Churros mit Schoko oder Biscoffsoße', cent: 600 } ] },
    { id: 'grill', name: 'Grillstand', farbe: '#7a2e12', pfandAktiv: false, layout: 'liste', produkte: [
      { id: 'christkindl', name: 'Christkindl Bratwurstsemmel',        cent: 600 },
      { id: 'krampus',     name: 'Krampus Bratwurstsemmel scharf',     cent: 600 } ] }
  ]
};

/* ================= 2. KASSENLOGIK (reine Funktionen, alle Beträge in ganzen Cent) ================= */
const neuerKorb = () => ({ produkte: {}, pfandAus: 0, pfandRueck: 0 });

// Warenkorbzeilen. Pfand: zwei getrennte Zeilen, Ausgabe +2,00 €, Rückgabe −2,00 € je Stück, keine Verrechnung.
function erstelleZeilen(bereich, korb) {
  const z = [];
  for (const p of bereich.produkte) {
    const m = korb.produkte[p.id] || 0;
    if (m > 0) z.push({ key: p.id, name: p.name, einzel: p.cent, menge: m, summe: p.cent * m });
  }
  if (korb.pfandAus > 0)   z.push({ key: 'pfandAus',   name: 'Pfand-Ausgabe',   art: 'pf-aus',   einzel:  KONFIG.pfandCent, menge: korb.pfandAus,   summe:  KONFIG.pfandCent * korb.pfandAus });
  if (korb.pfandRueck > 0) z.push({ key: 'pfandRueck', name: 'Pfand-Rückgabe',  art: 'pf-rueck', einzel: -KONFIG.pfandCent, menge: korb.pfandRueck, summe: -KONFIG.pfandCent * korb.pfandRueck });
  return z;
}
// Gesamtbetrag darf negativ werden (mehr Rückgaben als Ausgaben) → Auszahlung.
const gesamtCent = zeilen => zeilen.reduce((s, z) => s + z.summe, 0);

// Menge ändern; bei 0 verschwindet die Position. delta = -Infinity entfernt sie ausdrücklich.
function aendere(korb, key, delta) {
  if (key === 'pfandAus' || key === 'pfandRueck') { korb[key] = Math.max(0, korb[key] + delta); return; }
  const m = Math.max(0, (korb.produkte[key] || 0) + delta);
  if (m > 0) korb.produkte[key] = m; else delete korb.produkte[key];
}

// Zifferneingabe als Cent mit automatischem Dezimaltrenner: "1"→0,01 €, "100"→1,00 €, "1234"→12,34 €.
// C löscht die GESAMTE Eingabe. Führende Nullen werden ignoriert. Über dem Maximum wird die Taste nicht übernommen.
function eingabeTaste(eingabe, taste) {
  if (taste === 'C') return '';
  if (eingabe === '' && /^0+$/.test(taste)) return '';
  const neu = eingabe + taste;
  return parseInt(neu, 10) > KONFIG.maxCent ? eingabe : neu;
}
const eingabeCent = e => (e === '' ? 0 : parseInt(e, 10));
const reicht = (gegeben, zahlen) => gegeben >= zahlen;   // nur dann darf abgeschlossen werden
const rueckgeld = (gegeben, zahlen) => gegeben - zahlen; // nie anzeigen, wenn gegeben < zahlen

// Deutsche Darstellung "3,50 €", negativ mit echtem Minuszeichen (U+2212).
function fmt(cent) {
  const a = Math.abs(cent);
  return (cent < 0 ? '\u2212' : '') + Math.floor(a / 100).toLocaleString('de-DE') + ',' + String(a % 100).padStart(2, '0') + '\u00a0€';
}

/* ================= 3. DARSTELLUNG UND ABLAUF ================= */
let S = { screen: 'home', bereich: null, korb: neuerKorb(), eingabe: '', hinweis: '', fertig: null, gesperrt: false };
let dlgFn = null;
const $ = id => document.getElementById(id);
const zeilen = () => (S.bereich ? erstelleZeilen(S.bereich, S.korb) : []);

function viewHome() {
  return `<h2>Verkaufsbereich wählen</h2><div class="start">${KONFIG.bereiche.map(b =>
    `<button class="bereich" style="background:${b.farbe}" data-act="bereich" data-id="${b.id}">${b.name}</button>`).join('')}</div>`;
}

function viewOrder() {
  const b = S.bereich, z = zeilen(), g = gesamtCent(z);
  const prod = b.produkte.map(p => {
    const m = S.korb.produkte[p.id] || 0;
    return `<button class="prod" data-act="add" data-id="${p.id}"><span class="pn">${p.name}</span><span class="pp">${fmt(p.cent)}</span>${m ? `<span class="badge" aria-label="${m} im Warenkorb">${m}</span>` : ''}</button>`;
  }).join('');
  const pfand = b.pfandAktiv ? `<div class="pfand">
      <button class="pf aus" data-act="pfaus">+ Pfand ${fmt(KONFIG.pfandCent)}</button>
      <button class="pf rueck" data-act="pfrueck">\u2212 Pfand ${fmt(KONFIG.pfandCent)}</button></div>` : '';
  const liste = z.length ? `<ul class="cart">${z.map(x => `<li class="zeile ${x.art || ''}">
      <div class="zkopf"><span>${x.name}</span><span>${fmt(x.summe)}</span></div>
      <div class="zdetail">${fmt(x.einzel)} je Stück</div>
      <div class="zknoepfe">
        <button class="qb" data-act="minus" data-id="${x.key}" aria-label="Menge von ${x.name} verringern">\u2212</button>
        <span class="m">${x.menge}</span>
        <button class="qb" data-act="plus" data-id="${x.key}" aria-label="Menge von ${x.name} erhöhen">+</button>
        <button class="del" data-act="del" data-id="${x.key}" aria-label="${x.name} entfernen">Entfernen</button>
      </div></li>`).join('')}</ul>` : '<p class="leer">Noch nichts ausgewählt. Tippe auf ein Produkt.</p>';
  return `<div class="grid ${b.layout === 'liste' ? 'liste' : ''}">${prod}</div>${pfand}
    <h2>Warenkorb ${z.length ? '<button class="linkbtn" data-act="verwerfen">Bestellung verwerfen</button>' : ''}</h2>${liste}
    <button class="linkbtn" data-act="wechseln">Bereich wechseln</button>
    <div class="bar"><div class="sum" aria-live="polite"><span>Gesamt</span><strong>${fmt(g)}</strong></div>
      <button class="go" data-act="kasse" ${z.length ? '' : 'disabled'}>Zur Kasse</button></div>`;
}

function viewPay() {
  const g = gesamtCent(zeilen());
  if (g === 0) return `<div class="gross"><div class="label">Zu zahlen</div><div class="betrag null">Nichts zu zahlen</div></div>
    <div class="aktionen"><button class="sek" data-act="backOrder">Zurück</button><button class="prim" data-act="abschluss">Kauf abschließen</button></div>`;
  if (g < 0) return `<div class="gross"><div class="label">Auszahlung an Kunden</div><div class="betrag aus" aria-live="polite">Auszahlung: ${fmt(-g)}</div></div>
    <div class="aktionen"><button class="sek" data-act="backOrder">Zurück</button><button class="prim" data-act="abschluss">Kauf abschließen</button></div>`;
  const gegeben = eingabeCent(S.eingabe), ok = reicht(gegeben, g);
  const ziffern = ['1','2','3','4','5','6','7','8','9','00','0','C'].map(t =>
    `<button class="${t === 'C' ? 'c' : ''}" data-act="taste" data-val="${t}" ${t === 'C' ? 'aria-label="Alles löschen"' : ''}>${t}</button>`).join('');
  return `<div class="anzeige">
      <div class="zeilea"><span>Zu zahlen</span><span class="w">${fmt(g)}</span></div>
      <div class="zeilea klein"><span>Gegeben</span><span class="w">${fmt(gegeben)}</span></div>
      <div class="zeilea klein" aria-live="polite">${ok
        ? `<span>Rückgeld</span><span class="w ok">${fmt(rueckgeld(gegeben, g))}</span>`
        : `<span class="fehl">Betrag nicht ausreichend</span><span></span>`}</div></div>
    <div class="melde" role="alert">${S.hinweis}</div>
    <div class="schnell"><button data-act="quick" data-val="${g}">Passend</button>${KONFIG.schnellwahlCent.map(c => `<button data-act="quick" data-val="${c}">${c / 100} €</button>`).join('')}</div>
    <div class="tasten">${ziffern}</div>
    <p class="hilfe">Ziffern = Cent (1-2-3-4 ergibt 12,34 €). Die Taste C löscht die gesamte Eingabe.</p>
    <div class="aktionen"><button class="sek" data-act="backOrder">Zurück</button><button class="prim" data-act="abschluss" ${ok ? '' : 'disabled'}>Kauf abschließen</button></div>`;
}

function abschlussDaten() {
  const g = gesamtCent(zeilen()), gegeben = g > 0 ? eingabeCent(S.eingabe) : 0;
  return { g, gegeben, art: g > 0 ? 'rueck' : g < 0 ? 'aus' : 'null', betrag: g > 0 ? rueckgeld(gegeben, g) : Math.abs(g) };
}

function viewConfirm() {
  const d = abschlussDaten();
  const zeile = (l, w, k) => `<div class="zeilea ${k || ''}"><span>${l}</span><span class="w">${w}</span></div>`;
  return `<h2>Kauf prüfen</h2><div class="anzeige">
      ${d.art === 'aus' ? zeile('Auszahlung', fmt(d.betrag))
        : zeile('Zu zahlen', fmt(d.g)) + (d.art === 'rueck' ? zeile('Gegeben', fmt(d.gegeben), 'klein') + zeile('Rückgeld', fmt(d.betrag), 'klein') : '')}</div>
    <div class="aktionen"><button class="sek" data-act="backPay" ${S.gesperrt ? 'disabled' : ''}>Zurück</button>
      <button class="prim" data-act="bestaetigen" ${S.gesperrt ? 'disabled' : ''}>Bestätigen</button></div>`;
}

function viewDone() {
  const f = S.fertig;
  const text = { rueck: ['Rückgeld herausgeben', fmt(f.betrag), ''], aus: ['Auszahlung an Kunden', fmt(f.betrag), 'aus'], null: ['Bezahlt', 'Nichts zu zahlen', 'null'] }[f.art];
  return `<div class="gross"><div class="label">${text[0]}</div><div class="betrag ${text[2]}">${text[1]}</div></div>
    <div class="aktionen" style="grid-template-columns:1fr"><button class="prim" data-act="neu">Neue Bestellung</button></div>`;
}

function render() {
  const a = document.activeElement, d = a && a.dataset && a.dataset.act ? a.dataset : null;
  document.documentElement.style.setProperty('--akzent', S.bereich ? S.bereich.farbe : '#17332c');
  $('titel').textContent = S.bereich ? S.bereich.name : 'Vereinskasse';
  $('app').innerHTML = { home: viewHome, order: viewOrder, pay: viewPay, confirm: viewConfirm, done: viewDone }[S.screen]();
  if (d) { // Fokus nach dem Neuzeichnen wiederherstellen (Tastaturbedienung)
    const el = $('app').querySelector(`[data-act="${d.act}"]${d.id ? `[data-id="${d.id}"]` : ''}${d.val ? `[data-val="${d.val}"]` : ''}`);
    if (el) el.focus();
  }
}

function frage(text, okText, fn) { $('dlgText').textContent = text; $('dlgOk').textContent = okText; dlgFn = fn; $('dlg').showModal(); }

function aktion(act, id, val) {
  switch (act) {
    case 'dlgNo': $('dlg').close(); dlgFn = null; return;
    case 'dlgOk': { $('dlg').close(); const f = dlgFn; dlgFn = null; if (f) f(); return; }
    case 'bereich': S.bereich = KONFIG.bereiche.find(b => b.id === id); S.korb = neuerKorb(); S.screen = 'order'; break;
    case 'add': aendere(S.korb, id, 1); break;
    case 'pfaus': aendere(S.korb, 'pfandAus', 1); break;
    case 'pfrueck': aendere(S.korb, 'pfandRueck', 1); break;
    case 'plus': aendere(S.korb, id, 1); break;
    case 'minus': aendere(S.korb, id, -1); break;
    case 'del': aendere(S.korb, id, -Infinity); break;
    case 'verwerfen': frage('Offene Bestellung wirklich verwerfen?', 'Verwerfen', () => { S.korb = neuerKorb(); render(); }); return;
    case 'wechseln':
      if (zeilen().length) frage('Bestellung verwerfen und Bereich wechseln?', 'Verwerfen', () => { S.bereich = null; S.korb = neuerKorb(); S.screen = 'home'; render(); });
      else { S.bereich = null; S.screen = 'home'; }
      break;
    case 'kasse': if (!zeilen().length) return; S.eingabe = ''; S.hinweis = ''; S.screen = 'pay'; break;
    case 'backOrder': S.screen = 'order'; break;
    case 'backPay': S.screen = 'pay'; break;
    case 'taste': {
      const neu = eingabeTaste(S.eingabe, val);
      S.hinweis = neu === S.eingabe && val !== 'C' && !(S.eingabe === '' && /^0+$/.test(val)) ? 'Maximal ' + fmt(KONFIG.maxCent) : '';
      S.eingabe = neu; break;
    }
    case 'quick': S.eingabe = String(Math.min(parseInt(val, 10), KONFIG.maxCent)); S.hinweis = ''; break;
    case 'abschluss': {
      const g = gesamtCent(zeilen());
      if (g > 0 && !reicht(eingabeCent(S.eingabe), g)) return;   // Schutz: zu wenig gegeben
      S.screen = 'confirm'; break;
    }
    case 'bestaetigen': {
      if (S.gesperrt) return;                                      // Schutz gegen doppelten Abschluss
      const d = abschlussDaten();
      if (d.g > 0 && !reicht(d.gegeben, d.g)) return;
      S.gesperrt = true;
      S.fertig = { art: d.art, betrag: d.betrag };
      S.korb = neuerKorb(); S.eingabe = ''; S.screen = 'done';     // Warenkorb leeren, nichts speichern
      break;
    }
    case 'neu': S.gesperrt = false; S.fertig = null; S.korb = neuerKorb(); S.eingabe = ''; S.screen = 'order'; break; // gleicher Bereich
    default: return;
  }
  render();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  holeWachbleiben();
  aktion(el.dataset.act, el.dataset.id, el.dataset.val);
});

// Bildschirm wach halten (falls vom Browser unterstützt, sonst still ignoriert)
let wake = null;
function holeWachbleiben() {
  if (wake || !('wakeLock' in navigator)) return;
  navigator.wakeLock.request('screen').then(l => { wake = l; l.addEventListener('release', () => { wake = null; }); }).catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') holeWachbleiben(); });

// Zusätzlicher Hinweis beim Neuladen, nur bei offener Bestellung (mobile Browser ignorieren ihn oft; die Fußzeile bleibt maßgeblich)
window.addEventListener('beforeunload', e => { if (zeilen().length) { e.preventDefault(); e.returnValue = ''; } });

/* ================= 4. SELBSTTESTS (Konsole: runSelfTests() oder URL ?test=1) ================= */
function runSelfTests() {
  const erg = [], t = (name, ok) => erg.push({ name, ok: !!ok });
  const erwartet = { 'gw-rot': 350, 'gw-weiss': 350, 'gw-chard': 450, 'gw-dorn': 550, kinder: 300, schnaps: 250, bier: 400, colamix: 350, schorle: 350, wasser: 300, kaesespaetzle: 550, churros: 500, 'churros-soße': 600, christkindl: 600, krampus: 600 };
  const alle = KONFIG.bereiche.flatMap(b => b.produkte);
  t('Alle 15 Produkte vorhanden', alle.length === 15);
  for (const p of alle) t(`Preis ${p.name} = ${fmt(erwartet[p.id])}`, p.cent === erwartet[p.id]);
  for (const b of KONFIG.bereiche) { // Dreifach-Menge je Produkt eines Bereichs
    const k = neuerKorb(); b.produkte.forEach(p => aendere(k, p.id, 3));
    t(`Summe Bereich ${b.name}`, gesamtCent(erstelleZeilen(b, k)) === b.produkte.reduce((s, p) => s + 3 * p.cent, 0));
  }
  const gl = KONFIG.bereiche[0], pk = (aus, rueck) => { const k = neuerKorb(); k.pfandAus = aus; k.pfandRueck = rueck; return gesamtCent(erstelleZeilen(gl, k)); };
  t('Eine Pfand-Ausgabe = +2,00 €', pk(1, 0) === 200);
  t('Eine Pfand-Rückgabe = −2,00 €', pk(0, 1) === -200);
  t('2 Ausgaben, 3 Rückgaben = −2,00 €', pk(2, 3) === -200);
  t('Gesamt 0 bei 1 Ausgabe + 1 Rückgabe', pk(1, 1) === 0);
  const k = neuerKorb(); aendere(k, 'gw-rot', 2); aendere(k, 'gw-rot', -1); aendere(k, 'gw-rot', -1);
  t('Menge 0 entfernt Position', erstelleZeilen(gl, k).length === 0);
  aendere(k, 'kinder', 4); aendere(k, 'kinder', -Infinity);
  t('Löschen entfernt Position', erstelleZeilen(gl, k).length === 0);
  t('Zahlung passend: Rückgeld 0', reicht(1850, 1850) && rueckgeld(1850, 1850) === 0);
  t('Höherer Betrag: Rückgeld 1,50 €', reicht(2000, 1850) && rueckgeld(2000, 1850) === 150);
  t('Zu wenig gegeben: nicht ausreichend', !reicht(1000, 1850));
  const tip = (...ts) => ts.reduce((e, x) => eingabeTaste(e, x), '');
  t('1-2-3-4 = 12,34 €', eingabeCent(tip('1', '2', '3', '4')) === 1234 && fmt(1234).replace(/\u00a0/g, ' ') === '12,34 €');
  t('1-0-0 = 1,00 €', eingabeCent(tip('1', '0', '0')) === 100);
  t('1 = 0,01 €', eingabeCent(tip('1')) === 1);
  t('Taste 00 hängt zwei Nullen an', tip('1', '00') === '100');
  t('00 und 0 bei leerer Eingabe ohne Wirkung', tip('00') === '' && tip('0', '0', '5') === '5');
  t('Maximalbetrag wird nicht überschritten', tip('9', '9', '9', '9', '9', '0') === '99999');
  t('C löscht alles', tip('1', '2', '3', 'C') === '');
  t('Negative Beträge mit Minuszeichen', fmt(-200).startsWith('\u2212'));
  console.table(erg);
  return erg;
}
window.runSelfTests = runSelfTests;

/* ================= 5. PWA: Service Worker (nur App-Dateien, keine Verkaufsdaten) ================= */
// Die Version aus KONFIG hängt am Dateinamen: bei neuer Version wird der alte Cache gelöscht.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js?v=' + encodeURIComponent(KONFIG.version)).catch(() => {});
  });
}

/* ================= Start ================= */
$('fussInfo').textContent = `Version ${KONFIG.version} · Preisstand ${KONFIG.preisstand}`;
render();
if (new URLSearchParams(location.search).get('test') === '1') {
  const r = runSelfTests(), log = $('testlog');
  log.hidden = false;
  log.textContent = `Selbsttest: ${r.filter(x => x.ok).length}/${r.length} bestanden\n` + r.map(x => (x.ok ? 'OK    ' : 'FEHLER ') + x.name).join('\n');
}
