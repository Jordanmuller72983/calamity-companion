// server/mmsPages.ts
import { HTMLElement, parse } from "node-html-parser";

// server/mms.ts
var MMS_BASE = "http://metservice.intnet.mu";
var MMS_PAGES = {
  home: `${MMS_BASE}/index.php`,
  cycloneEn: `${MMS_BASE}/cyclone-bulletin-english-mauritius.php`,
  rain: `${MMS_BASE}/warning-bulletin-torrential-rain-warning.php`,
  special: `${MMS_BASE}/warning-bulletin-special-weather.php`,
  latest: `${MMS_BASE}/latest-weather-data.php`,
  forecastEn: `${MMS_BASE}/forecast-bulletin-english-mauritius.php`,
  forecastFr: `${MMS_BASE}/forecast-bulletin-french-mauritius.php`
};
var ENTITIES = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  deg: "\xB0",
  eacute: "\xE9",
  egrave: "\xE8",
  ecirc: "\xEA",
  agrave: "\xE0",
  acirc: "\xE2",
  ccedil: "\xE7",
  ocirc: "\xF4",
  icirc: "\xEE",
  ucirc: "\xFB",
  ugrave: "\xF9",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ndash: "\u2013",
  mdash: "\u2014"
};
function decodeEntities(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}
function fixMojibake(s) {
  if (!/[ÃÂ][\u0080-ÿ]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);
    const fixed = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return fixed;
  } catch {
    return s;
  }
}
function htmlToLines(html) {
  const text = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h\d|li|tr)>/gi, "\n").replace(/<[^>]+>/g, " ");
  return fixMojibake(decodeEntities(text)).split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean);
}
function parseBanner(html) {
  const block = html.match(/<div class="warning">([\s\S]*?)<\/div>\s*<!-- END CYCLONE WARNING -->/i)?.[1];
  if (!block) return [];
  const marquee = block.replace(/<!--[\s\S]*?-->/g, "").match(/<marquee[^>]*>([\s\S]*?)<\/marquee>/i)?.[1];
  if (!marquee) return [];
  const items = [];
  for (const m of marquee.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = htmlToLines(m[2]).join(" ").trim();
    if (text) items.push({ text, href: m[1].trim() });
  }
  if (!items.length) {
    const text = htmlToLines(marquee).join(" ").trim();
    if (text) items.push({ text });
  }
  return items;
}
var ROMAN = { i: 1, ii: 2, iii: 3, iv: 4 };
function classNumber(token2) {
  const t = token2.toLowerCase();
  return ROMAN[t] ?? (/^[1-4]$/.test(t) ? Number(t) : void 0);
}
var isRodriguesOnly = (t) => /rodrigues/i.test(t) && !/mauritius|maurice|moris/i.test(t);
function cycloneFromText(text) {
  if (isRodriguesOnly(text)) return void 0;
  const t = text.toLowerCase();
  if (/safety bulletin|bulletin de s[ée]curit[ée]/.test(t)) return "safetyBulletin";
  if (/terminat|fin de (tous les )?avis|tous les avis.*lev[ée]s/.test(t)) return "terminated";
  const m = t.match(/cyclone warning class\s+(iv|i{1,3}|[1-4])\b/) ?? t.match(/avertissement de cyclone de classe\s+(iv|i{1,3}|[1-4])\b/) ?? t.match(/avis de cyclone (?:de )?classe\s+(iv|i{1,3}|[1-4])\b/);
  const n = m && classNumber(m[1]);
  if (n && !/(has been|is) (lifted|removed)|lev[ée]/.test(t)) return `class${n}`;
  return void 0;
}
function rainFromText(text) {
  if (isRodriguesOnly(text)) return void 0;
  const t = text.toLowerCase();
  if (/(lifted|terminated|removed|lev[ée])/.test(t)) return void 0;
  if (/torrential rain warning|avis de pluies torrentielles|avertissement de pluies torrentielles/.test(t))
    return { level: "torrentialRainWarning" };
  const warn = text.match(/heavy rain warning(?: for| in)? ([^.|]+)/i);
  if (warn) return { level: "heavyRainWarning", area: cleanArea(warn[1]) };
  if (/avis de fortes pluies|avertissement de fortes pluies/.test(t)) return { level: "heavyRainWarning" };
  if (/heavy rain watch|veille de fortes pluies/.test(t)) return { level: "heavyRainWatch" };
  return void 0;
}
function cleanArea(s) {
  const a = s.replace(/\s+(is|remains) in force.*/i, "").trim();
  return a && !/^mauritius$/i.test(a) ? a : void 0;
}
var RAIN_RANK = { none: 0, heavyRainWatch: 1, heavyRainWarning: 2, torrentialRainWarning: 3 };
var CYCLONE_RANK = {
  none: 0,
  terminated: 1,
  safetyBulletin: 2,
  class1: 3,
  class2: 4,
  class3: 5,
  class4: 6
};
function classify(items, bulletinTexts = []) {
  let cyclone = "none";
  let rain = "none";
  let rainArea;
  const others = [];
  const consider = (text, item) => {
    const c = cycloneFromText(text);
    const r = rainFromText(text);
    if (c && CYCLONE_RANK[c] > CYCLONE_RANK[cyclone]) cyclone = c;
    if (r && RAIN_RANK[r.level] > RAIN_RANK[rain]) {
      rain = r.level;
      rainArea = r.area;
    }
    if (item && !c && !r) others.push(item);
  };
  for (const item of items) consider(item.text, item);
  for (const text of bulletinTexts) consider(text);
  return { cyclone, rain, rainArea, others };
}
var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function parseIssued(text) {
  const m = text.match(/issued at (\d{1,2})h(\d{2})[^\d]*?(\d{1,2}) (\w+) (\d{4})/i);
  if (!m) return void 0;
  const month = MONTHS.indexOf(m[4].toLowerCase());
  if (month < 0) return void 0;
  const utc = Date.UTC(Number(m[5]), month, Number(m[3]), Number(m[1]) - 4, Number(m[2]));
  return new Date(utc).toISOString();
}
function parseBulletin(html) {
  const left = html.match(/<div class="left_content">([\s\S]*?)<div id="footer_main">/i)?.[1];
  if (!left) return void 0;
  const afterSep = left.split(/<div class="sep"><\/div>/i)[1] ?? "";
  const h1 = afterSep.match(/<h1>([\s\S]*?)(?:<\/h1>|$)/i);
  const title = h1 ? htmlToLines(h1[1]).join(" ") : "";
  const body = h1 ? afterSep.slice((h1.index ?? 0) + h1[0].length) : afterSep;
  const lines = htmlToLines(body);
  const deduped = lines.filter((l, i) => l !== lines[i - 1]);
  if (!deduped.length) return void 0;
  return { title, lines: deduped, issuedAt: parseIssued(deduped.join(" ")) };
}
function parseStations(html, viewId) {
  const start = html.indexOf(`<div id="${viewId}">`);
  if (start < 0) return void 0;
  const nextView = html.indexOf('<div id="view', start + 10);
  const view = html.slice(start, nextView > 0 ? nextView : void 0);
  const rows = [];
  for (const block of view.split('class="station"').slice(1)) {
    const name = block.match(/^\s*title="([^"]+)"/)?.[1];
    const end = block.indexOf("</div>");
    const values = [...block.slice(0, end > 0 ? end : void 0).matchAll(/<p[^>]*>\s*(-?[\d.]+)\s*<\/p>/g)].map((m) => Number(m[1]));
    if (!name || !values.length) continue;
    const station = decodeEntities(name).trim();
    if (!rows.some((s) => s.station === station)) rows.push({ station, values });
  }
  const caption = view.match(/class="weatherinfo">\s*<p[^>]*>([\s\S]*?)<\/p>/i);
  return { period: caption ? htmlToLines(caption[1]).join(" ") : "", rows };
}
function parseStationView(html, viewId) {
  const s = parseStations(html, viewId);
  return s && { period: s.period, stations: s.rows.map((r) => ({ station: r.station, mm: r.values[0] })) };
}
function parseStationExtras(html) {
  const t = parseStations(html, "view3");
  const w = parseStations(html, "view4");
  const h = parseStations(html, "view5");
  return {
    tempPeriod: t?.period,
    temp: (t?.rows ?? []).map((r) => ({ station: r.station, max: r.values[0], min: r.values[1] })),
    windPeriod: w?.period,
    wind: (w?.rows ?? []).map((r) => ({ station: r.station, kmh: r.values[0] })),
    humidityPeriod: h?.period,
    humidity: (h?.rows ?? []).map((r) => ({ station: r.station, pct: r.values[0] }))
  };
}
function parseRainfall(html) {
  return { last24h: parseStationView(html, "view1"), last3h: parseStationView(html, "view2") };
}
function parseConditions(html) {
  const out = [];
  const blocks = html.split("<h3>Current conditions</h3>").slice(1);
  for (const b of blocks) {
    const place = b.match(/class="vacoas_plaisance">([\s\S]*?)<\/p>/)?.[1];
    if (!place) continue;
    const temp = b.match(/class="temperature">\s*(-?\d+)/)?.[1];
    out.push({
      place: htmlToLines(place).join(" "),
      sky: htmlToLines(b.match(/class="conditions">([\s\S]*?)<\/p>/)?.[1] ?? "").join(" "),
      tempC: temp ? Number(temp) : void 0,
      wind: htmlToLines(b.match(/Wind:<\/strong>\s*<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "").join(" ") || void 0,
      humidity: htmlToLines(b.match(/Humidity:<\/strong>\s*<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "").join(" ") || void 0
    });
  }
  return out.filter((c, i) => out.findIndex((o) => o.place === c.place) === i);
}
function parseForecast(html) {
  const b = parseBulletin(html);
  if (!b) return void 0;
  const issued = b.lines.find((l) => /issued at|émis à|emis a|publiées? à/i.test(l)) ?? b.lines[0] ?? "";
  const i = b.lines.findIndex((l) => /forecast for the next 24 hours|prévisions? pour les prochaines 24 heures/i.test(l));
  const end = b.lines.findIndex((l, j) => j > i && /^(high tides|low tides|sunrise|marées?|lever du soleil|pleine mer|basse mer)/i.test(l));
  const next24h = i >= 0 ? b.lines.slice(i + 1, end > 0 ? end : void 0) : [];
  return { issued, next24h };
}

// server/mmsPages.ts
var TEXT_TTL = 5 * 60 * 1e3;
var INFO_TTL = 6 * 60 * 60 * 1e3;
var MENU_TTL = 24 * 60 * 60 * 1e3;
async function fetchText(url2) {
  const res = await fetch(url2, {
    headers: { "User-Agent": "CalamityCompanion/0.1 (personal public-safety project)" },
    signal: AbortSignal.timeout(15e3)
  });
  if (!res.ok) throw new Error(`${url2} \u2192 HTTP ${res.status}`);
  return new TextDecoder("utf-8").decode(await res.arrayBuffer());
}
var clean = (s) => fixMojibake(decodeEntities(s)).replace(/[\s ]+/g, " ").trim();
var toPath = (url2) => url2.replace(/^https?:\/\/metservice\.intnet\.mu\/?/i, "");
var abs = (src) => new URL(src.trim(), `${MMS_BASE}/`).href;
var proxied = (src) => `/api/mms/image?src=${encodeURIComponent(abs(src))}`;
function labelFor(path, title) {
  const m = path.match(/^cyclone-bulletin-(english|french|creole)-(mauritius|rodrigues)\.php$/);
  if (!m) return title;
  const lang = { english: "English", french: "French", creole: "Kreol" }[m[1]];
  return `Cyclone bulletin ${m[2] === "mauritius" ? "Mauritius" : "Rodrigues"} (${lang})`;
}
function parseMenu(homeHtml) {
  const root = parse(homeHtml);
  const sections = [];
  for (const main of root.querySelectorAll("a.main")) {
    const li = main.parentNode;
    const pages = [];
    for (const a of li.querySelectorAll("ul a")) {
      const href = a.getAttribute("href") ?? "";
      if (!/^https?:\/\/metservice\.intnet\.mu\//i.test(href) || !/\.php$/.test(href)) continue;
      const path = toPath(href);
      if (!pages.some((p) => p.path === path)) pages.push({ path, title: labelFor(path, clean(a.text)) });
    }
    if (pages.length) sections.push({ title: clean(main.text), pages });
  }
  return sections;
}
var menuCache;
async function getMenu() {
  if (menuCache && Date.now() - menuCache.at < MENU_TTL) return menuCache.menu;
  const menu = parseMenu(await fetchText(`${MMS_BASE}/index.php`));
  if (menu.length) menuCache = { at: Date.now(), menu };
  return menu;
}
async function isAllowedPath(path) {
  const menu = await getMenu();
  return menu.some((s) => s.pages.some((p) => p.path === path));
}
function contentRoot(html) {
  const root = parse(html, { comment: false });
  const left = root.querySelector(".left_content");
  if (!left) return void 0;
  left.querySelectorAll(".warning, script, style").forEach((n) => n.remove());
  left.querySelectorAll('a[href*="myt.mu"]').forEach((n) => n.remove());
  return left;
}
function tableRows(table) {
  const rows = table.querySelectorAll("tr").filter((tr) => tr.closest("table") === table);
  return rows.map((tr) => tr.querySelectorAll("td, th").filter((c) => c.closest("tr") === tr).map((c) => clean(c.text))).filter((r) => r.some(Boolean));
}
function walk(node, out) {
  for (const child of node.childNodes) {
    if (!(child instanceof HTMLElement)) {
      const text = clean(child.rawText);
      if (text.length > 1) out.push({ type: "p", text });
      continue;
    }
    const tag2 = child.tagName?.toLowerCase();
    if (tag2 === "h1") continue;
    if (/^h[2-6]$/.test(tag2)) {
      const text = clean(child.text);
      if (text) out.push({ type: "h", text });
      continue;
    }
    if (tag2 === "table") {
      const inner = child.querySelectorAll("table");
      const target = inner.length && tableRows(child).length <= 2 ? inner[inner.length - 1] : child;
      const rows = tableRows(target);
      if (rows.length) out.push({ type: "table", rows });
      continue;
    }
    if (tag2 === "img") {
      const src = child.getAttribute("src");
      if (src && !/icons-|banner/.test(src)) out.push({ type: "img", src: proxied(src), alt: child.getAttribute("title") ?? void 0 });
      continue;
    }
    if (tag2 === "iframe") {
      const src = child.getAttribute("src");
      if (src) out.push({ type: "link", href: abs(src), text: "Open on MMS website" });
      continue;
    }
    if (tag2 === "a") {
      const href = child.getAttribute("href") ?? "";
      const text = clean(child.text);
      if (/\.pdf$/i.test(href)) out.push({ type: "link", href: abs(href), text: text || "PDF" });
      else if (child.querySelector("img")) walk(child, out);
      else if (text) out.push({ type: "p", text });
      continue;
    }
    if (tag2 === "p" || tag2 === "li" || tag2 === "span" || tag2 === "strong") {
      if (child.querySelector("table, img, iframe, div, h1, h2, h3")) walk(child, out);
      else {
        const text = clean(child.text);
        if (text) out.push({ type: tag2 === "strong" ? "h" : "p", text });
      }
      continue;
    }
    walk(child, out);
  }
}
function parseContent(html) {
  const left = contentRoot(html);
  if (!left) return { title: "", blocks: [] };
  const h1 = left.querySelector("h1");
  const title = h1 ? clean(h1.text) : "";
  const blocks = [];
  walk(left, blocks);
  const out = blocks.filter((b, i) => {
    const prev = blocks[i - 1];
    if (b.type === "p" && /^[-–|•\s]*$/.test(b.text)) return false;
    return !(prev && "text" in prev && "text" in b && prev.type === b.type && prev.text === b.text);
  });
  return { title, blocks: out };
}
function parseFrames(html) {
  const urls = [...html.matchAll(/["'](https?:\/\/metservice\.intnet\.mu\/mmsimages\/[^"']+\.(?:jpe?g|png|gif))["']/gi)].map((m) => m[1]);
  return [...new Set(urls)].map(proxied);
}
function parseIconMap(html) {
  const root = parse(html);
  const bgDiv = root.querySelectorAll("div").find((d) => /background-image:url\('([^']+)'\)/.test(d.getAttribute("style") ?? ""));
  const style = bgDiv?.getAttribute("style") ?? "";
  const bg = style.match(/background-image:url\('([^']+)'\)/)?.[1];
  const width = Number(style.match(/width:(\d+)px/)?.[1] ?? 658);
  const height = Number(style.match(/height:(\d+)px/)?.[1] ?? 511);
  const icons = (bgDiv?.querySelectorAll(":scope > div") ?? []).flatMap((d) => {
    const s = d.getAttribute("style") ?? "";
    const top = Number(s.match(/top:\s*(\d+)px/)?.[1]);
    const left = Number(s.match(/left:\s*(\d+)px/)?.[1]);
    const img = d.querySelector("img");
    if (!img || Number.isNaN(top) || Number.isNaN(left)) return [];
    return [{ x: left / width, y: top / height, title: img.getAttribute("title") ?? "", src: proxied(img.getAttribute("src") ?? "") }];
  });
  return { background: bg ? proxied(bg) : "", width, height, icons };
}
function parseSevenDay(html) {
  return html.split('class="fdaynew"').slice(1).map((chunk) => {
    const text = (re) => {
      const m = chunk.match(re);
      return m ? clean(m[1].replace(/<[^>]+>/g, " ")) : void 0;
    };
    const temps = [...chunk.matchAll(/class="ftemp">\s*(-?\d+)/g)].map((m) => Number(m[1]));
    const icon = chunk.match(/class="weather_icon"><img src="([^"]+)"/)?.[1];
    return {
      date: text(/^>([^<]*)</) ?? "",
      condition: text(/class="fconditionnew">([\s\S]*?)<\/p>/) ?? "",
      icon: icon ? proxied(icon) : void 0,
      maxC: temps[0],
      minC: temps[1],
      probability: text(/Prob:\s*<span class="fgrey">([\s\S]*?)<\/span>/),
      detail: text(/<p><span class="fgrey">([\s\S]*?)<\/span><\/p>/)
    };
  }).filter((d) => d.date);
}
var pageCache = /* @__PURE__ */ new Map();
var isInfoPage = (path) => /\/|climate|sun-moon|names|system|precautions/.test(path) && !/bulletin/.test(path);
async function getPage(path) {
  const ttl = isInfoPage(path) ? INFO_TTL : TEXT_TTL;
  const hit2 = pageCache.get(path);
  if (hit2 && Date.now() - hit2.at < ttl) return hit2.page;
  const url2 = `${MMS_BASE}/${path}`;
  const html = await fetchText(url2);
  const { title, blocks } = parseContent(html);
  if (path === "maps.php") {
    const periods = await Promise.all(
      [
        ["Morning", "morning-new.php"],
        ["Afternoon", "afternoon-new.php"],
        ["Night", "night-new.php"]
      ].map(async ([name, p]) => {
        try {
          return { name, ...parseIconMap(await fetchText(`${MMS_BASE}/${p}`)) };
        } catch {
          return void 0;
        }
      })
    );
    const ok = periods.filter((p) => !!p && p.icons.length > 0);
    blocks.length = 0;
    if (ok.length)
      blocks.push({
        type: "iconmap",
        background: ok[0].background,
        width: ok[0].width,
        height: ok[0].height,
        periods: ok.map((p) => ({ name: p.name, icons: p.icons }))
      });
  }
  if (path === "probabilistic-forecast.php") {
    const days = parseSevenDay(html);
    if (days.length) blocks.splice(0, blocks.length, { type: "days", days });
  }
  for (const [i, b] of blocks.entries()) {
    if (b.type === "link" && /(satellite|radar)-images\.php$/.test(b.href)) {
      const frames = parseFrames(await fetchText(b.href).catch(() => ""));
      blocks[i] = frames.length ? { type: "animation", frames, label: /radar/.test(b.href) ? "Radar" : "Satellite" } : { type: "empty", text: "MMS is not publishing images for this animation right now." };
    }
  }
  if (!blocks.some((b) => b.type !== "h")) blocks.push({ type: "empty", text: "Nothing is published on this page right now." });
  const page = { path, title: title || path, url: url2, fetchedAt: (/* @__PURE__ */ new Date()).toISOString(), blocks };
  pageCache.set(path, { at: Date.now(), page });
  return page;
}

// src/data/disruptions.ts
var MU_OFFSET_MS = 4 * 3600 * 1e3;
var mauritiusDate = (ms) => new Date(ms + MU_OFFSET_MS).toISOString().slice(0, 10);

// server/disruptions.ts
var MAX_AGE_HOURS = 72;
var SERVICE = {
  metro: /metro express|\bm[ée]tro\b|light rail/i,
  bus: /autobus|\bbus\b|\bnlta\b/i,
  // "classe" alone is too loose ("cyclone de classe 2"): only in phrases about lessons.
  school: /écoles?\b|ecoles?\b|\bclasses\b|pas de classe\b|établissements scolaires|élèves|collèges?|universit/i,
  curfew: /couvre-feu|curfew/i
};
var STATES = [
  ["stopped", /pas de service|pas de classes?\b|pas d.école|ne circule(ra)? pas|à l.arrêt|reprise (des opérations )?prévue|reprendra (dans|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|la semaine)/i],
  // "Les derniers autobus à 19 heures…, reprise à 5 heures": an early stop tonight, whatever restarts after.
  ["early", /derni(er|ère)s? (autobus|bus|métros?|trams?|rames?)[^,]* à \d+ ?(h|heures)/i],
  // Whole words only: "entreprises" contains "reprise".
  ["resumed", /\breprise\b|\breprend(ront)?\b|\brouvr|réouverture|de nouveau en service|retour à la normale|levée du couvre-feu|praticables/i],
  ["early", /(prendront fin|cesseront|s.arrêteront|arrêt de tous les services[^,]*) à \d+ ?(h|heures)/i],
  ["stopped", /à l.arrêt|\barrêt\b|suspendu|suspension|pas opérationnel|n.est pas opérationnel|ne circule|cesseront|prendront fin|fin des services|fermée?s?\b|\bfermeture\b|pas de classes?\b|pas d.école|interrompu|paralysé/i],
  ["limited", /au ralenti|perturbé|perturbation|réduit|partiel|limité/i],
  ["active", /prolongé|reconduit|maintenu|mainteni|dès \d+ ?h|instauré|décrété|en vigueur/i]
];
var IGNORE = /pakistan|inde\b|france|réunion|madagascar|procès|tribunal|\bcour\b|arrêtée?s?\b|arrestations?|poursuivi|détention|infractions|non-respect/i;
var stateOf = (text) => STATES.find(([, re]) => re.test(text))?.[0];
var WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
var MONTHS2 = ["janvier", "f\xE9vrier", "mars", "avril", "mai", "juin", "juillet", "ao\xFBt", "septembre", "octobre", "novembre", "d\xE9cembre"];
var DAY_RE = new RegExp(`\\b(demain|${WEEKDAYS.join("|")})(?:\\s+(\\d{1,2})(?:\\s+(${MONTHS2.join("|")}))?)?`, "gi");
var RESUME_RE = /\breprise\b|\breprend(ra|ront)?\b|\brouvr|réouverture|de nouveau en service/i;
var NORMAL_RE = /retour à la normale/i;
var DAY_MS = 864e5;
var addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
function datesIn(text, publishedAt) {
  const pub = mauritiusDate(Date.parse(publishedAt));
  const pubDay = /* @__PURE__ */ new Date(pub + "T00:00:00Z");
  const out = [];
  for (const m of text.matchAll(DAY_RE)) {
    const word = m[1].toLowerCase();
    if (word === "demain") {
      out.push(addDays(pub, 1));
    } else if (m[2]) {
      const month = m[3] ? MONTHS2.indexOf(m[3].toLowerCase()) : pubDay.getUTCMonth();
      const year = pubDay.getUTCFullYear() + (m[3] && month < pubDay.getUTCMonth() - 6 ? 1 : 0);
      let d = Date.UTC(year, month, Number(m[2]));
      if (!m[3] && d < pubDay.getTime() - 7 * DAY_MS) d = Date.UTC(year, month + 1, Number(m[2]));
      out.push(new Date(d).toISOString().slice(0, 10));
    } else {
      out.push(addDays(pub, (WEEKDAYS.indexOf(word) - pubDay.getUTCDay() + 7) % 7));
    }
  }
  return out;
}
function datesOf(title, publishedAt) {
  const firstDayAfter = (re) => {
    const m = title.match(re);
    return m ? datesIn(title.slice(m.index + m[0].length), publishedAt)[0] : void 0;
  };
  const resumesOn = firstDayAfter(RESUME_RE);
  if (resumesOn) {
    const normalOn = firstDayAfter(NORMAL_RE);
    return normalOn && normalOn > resumesOn ? { resumesOn, normalOn } : { resumesOn };
  }
  const days = datesIn(title, publishedAt).sort();
  return days.length ? { until: days[days.length - 1] } : {};
}
function classifyDisruption(title) {
  if (IGNORE.test(title)) return [];
  const services = Object.keys(SERVICE).filter((s) => SERVICE[s].test(title));
  const parts = title.split(/\s*[,;:|]\s*|\s+[–-]\s+/);
  const out = [];
  for (const service of services) {
    const own = parts.filter((p) => SERVICE[service].test(p)).map(stateOf).find(Boolean);
    let state = own ?? (services.length === 1 ? stateOf(title) : void 0);
    if (!state && service === "curfew") state = "active";
    if (!state) continue;
    if (service === "curfew" && (state === "stopped" || state === "early")) state = "resumed";
    if (service !== "curfew" && state === "active") continue;
    out.push({ service, state });
  }
  return out;
}
var two = (n) => (n ?? "00").padStart(2, "0");
var HOURS_RE = /\b(\d{1,2}) ?h(?:eures?)? ?(\d{2})?(?!\d)\D{0,20}?\s(?:à|a|ek|-|–)\s+(\d{1,2}) ?h(?:eures?)? ?(\d{2})?(?!\d)/i;
var UNTIL_RE = /jusqu.(?:à|au)\s/i;
var WEEKEND_RE = /\bweek-?end\b/i;
function curfewFacts(title, publishedAt) {
  const out = {};
  const h = title.match(HOURS_RE);
  if (h && Number(h[1]) < 24 && Number(h[3]) < 24) out.hours = `${two(h[1])}:${two(h[2])}\u2013${two(h[3])}:${two(h[4])}`;
  const u = title.match(UNTIL_RE);
  const day = u ? datesIn(title.slice(u.index + u[0].length), publishedAt)[0] : void 0;
  if (day) out.until = day;
  else if (WEEKEND_RE.test(title)) out.until = datesIn("dimanche", publishedAt)[0];
  return out;
}
var CURFEW_DECISION = /maintenu|mainteni|prolongé|reconduit|étendu|instauré|décrété|en vigueur|horaires|zones concernées|définitiv|supprimé|abrogé/i;
var CURFEW_SIDE = /spectacle|concert|report[ée]|économie|vie nocturne|commer|\bloi\b|législation|sanctions|renforcement|business|entreprises|immersion|mobilis|incidents|autobus|passagers|recettes|\[live\]/i;
var CURFEW_WINDOW_HOURS = 48;
function pickCurfew(found) {
  const informative = (d) => !!d.hours || !!d.until || CURFEW_DECISION.test(d.title);
  const tiers = [
    found.filter((d) => informative(d) && !CURFEW_SIDE.test(d.title)),
    found.filter((d) => informative(d) && CURFEW_SIDE.test(d.title)),
    found.filter((d) => !informative(d))
  ].flat();
  const first = tiers[0];
  if (!first) return [];
  const adds = (d) => !first.hours && !!d.hours || !first.until && !!d.until;
  const second = tiers.find((d) => d !== first && adds(d)) ?? tiers.find((d) => d !== first);
  return second ? [first, second] : [first];
}
function findDisruptions(items, now = Date.now()) {
  const since = now - MAX_AGE_HOURS * 3600 * 1e3;
  const curfewSince = now - CURFEW_WINDOW_HOURS * 3600 * 1e3;
  const out = [];
  const curfew = [];
  for (const i of [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    const at = new Date(i.publishedAt).getTime();
    if (at < since) continue;
    for (const c of classifyDisruption(i.title)) {
      const base = { ...c, title: i.title, url: i.url, source: i.source, publishedAt: i.publishedAt };
      if (c.service === "curfew") {
        if (at >= curfewSince) curfew.push({ ...base, ...curfewFacts(i.title, i.publishedAt) });
        continue;
      }
      if (out.some((d) => d.service === c.service)) continue;
      out.push({ ...base, ...datesOf(i.title, i.publishedAt) });
    }
  }
  return [...out, ...pickCurfew(curfew)];
}
var KEY = new RegExp(
  [
    // An actual cut, not any story naming the CWA or CEB.
    "coupures? d.eau|pas d.eau|eau coup\xE9e|interruption (de la )?(distribution|fourniture) d.eau",
    "coupures? (de courant|d.\xE9lectricit\xE9)|pannes? (de courant|d.\xE9lectricit\xE9)|black-?out|d\xE9lestage",
    "routes? (ferm\xE9e|bloqu\xE9e|coup\xE9e|inond\xE9e)s?|d\xE9viation|circulation (interdite|bloqu\xE9e|perturb\xE9e)",
    "avis de (cyclone|fortes pluies|pluies torrentielles)|cyclone de classe|avertissement|bulletin de s\xE9curit\xE9|vigilance",
    "\xE9vacu|centres? de refuge|\\bgr\xE8ve\\b|cong\xE9 public|jour f\xE9ri\xE9|\xE9tat d.urgence|confinement"
  ].join("|"),
  "i"
);
var KEY_MAX_AGE_HOURS = 24;
function keyHeadlines(items, now = Date.now()) {
  const since = now - KEY_MAX_AGE_HOURS * 3600 * 1e3;
  return [...items].filter((i) => new Date(i.publishedAt).getTime() >= since && KEY.test(i.title) && !IGNORE.test(i.title)).filter((i) => !Object.values(SERVICE).some((re) => re.test(i.title))).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3);
}

// server/news.ts
var TTL = 10 * 60 * 1e3;
var MAX_AGE_DAYS = 4;
var googleNews = (q) => "https://news.google.com/rss/search?hl=fr&gl=MU&ceid=MU:fr&q=" + encodeURIComponent(q);
var FEEDS = [
  { source: "Defimedia", url: "https://defimedia.info/rss.xml" },
  {
    source: "L'Express",
    url: googleNews('site:lexpress.mu (cyclone OR classe OR "pluies torrentielles" OR "fortes pluies" OR inondation OR m\xE9t\xE9o OR avertissement OR CWA OR r\xE9servoir) when:4d')
  },
  {
    source: "L'Express",
    url: googleNews('site:lexpress.mu (metro OR m\xE9tro OR autobus OR NLTA OR couvre-feu OR \xE9coles OR "transport public" OR coupure OR CEB OR gr\xE8ve OR \xE9vacuation OR "cong\xE9 public") when:3d')
  }
];
var WEATHER = /cyclone|classe\s*(1|2|3|4|i{1,3}|iv)\b|avertissement|avis de|pluies? torrentielles?|fortes pluies|averses|inondation|inond[ée]|crue|météo|meteo|\bmms\b|vents? violents?|rafales|houle|bulletin de sécurité|intempéries|glissement de terrain|réservoir|cwa|sécheresse|coupure d.eau/i;
var TOPICS = {
  school: /école|écoles|scolaire|élèves|collèges?|établissements? (scolaires|d.enseignement)|ministère de l.éducation|universités?|classes? suspendues/i,
  work: /travail|travailleurs|employés|bureaux|secteur privé|fonction publique|employeurs|congé|workers'? rights/i,
  transport: /autobus|\bbus\b|metro|métro|transport|\bnta\b|circulation|routes?|autoroute|aéroport|vols?\b/i,
  warning: /cyclone|classe|avertissement|pluies torrentielles|fortes pluies|avis de|bulletin|mms|météo/i,
  water: /cwa|réservoir|eau potable|coupure d.eau|distribution d.eau|sécheresse|mare.aux.vacoas/i
};
var FR_DAYS = { lun: "Mon", mar: "Tue", mer: "Wed", jeu: "Thu", ven: "Fri", sam: "Sat", dim: "Sun" };
function parseRssDate(s) {
  const en = s.trim().replace(new RegExp("^(\\p{L}+)\\.?,", "u"), (_, d) => `${FR_DAYS[d.toLowerCase().slice(0, 3)] ?? d},`);
  const t = Date.parse(en);
  return Number.isNaN(t) ? void 0 : new Date(t).toISOString();
}
var tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "")).trim() : void 0;
};
function parseRssAll(xml, source) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    let title = tag(m[1], "title") ?? "";
    const url2 = tag(m[1], "link") ?? "";
    const publishedAt = parseRssDate(tag(m[1], "pubDate") ?? "");
    if (!title || !url2 || !publishedAt) continue;
    title = title.replace(/\s+-\s+lexpress\.mu$/i, "");
    if (/^(recherche|lexpress\.mu)\b/i.test(title)) continue;
    items.push({ title, url: url2.replace(/^http:\/\/defimedia/, "https://defimedia"), source, publishedAt });
  }
  return items;
}
function weatherItems(items) {
  return items.filter((i) => WEATHER.test(i.title)).map((i) => ({ ...i, topics: Object.keys(TOPICS).filter((k) => TOPICS[k].test(i.title)) }));
}
var cache;
async function getNews() {
  if (cache && Date.now() - cache.at < TTL) return cache.status;
  const errors = [];
  const lists = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, {
          headers: { "User-Agent": "CalamityCompanion/0.1 (personal public-safety project)" },
          signal: AbortSignal.timeout(2e4)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return parseRssAll(await res.text(), f.source);
      } catch (e) {
        errors.push(`${f.source}: ${e.message}`);
        return [];
      }
    })
  );
  const since = Date.now() - MAX_AGE_DAYS * 864e5;
  const seen = /* @__PURE__ */ new Set();
  const all = lists.flat().filter((i) => new Date(i.publishedAt).getTime() > since).filter((i) => {
    const k = i.title.toLowerCase().replace(/\W+/g, " ").slice(0, 60);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const status = {
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    items: weatherItems(all).slice(0, 30),
    disruptions: findDisruptions(all),
    key: keyHeadlines(all).map((i) => ({ ...i, topics: [] })),
    errors
  };
  cache = { at: Date.now(), status };
  return status;
}

// server/reports.ts
import { randomUUID } from "node:crypto";

// src/data/liveTypes.ts
var REPORT_KINDS = ["flood", "tree", "power", "landslide", "water", "blocked", "other"];

// server/store.ts
import { Redis } from "@upstash/redis";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
var url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
var token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
var redis = url && token ? new Redis({ url, token }) : void 0;
var isServerless = !!process.env.VERCEL;
var DIR = join(process.cwd(), "server", "data");
var file = (key) => join(DIR, `${key.replace(/[^a-z0-9._-]/gi, "_")}.json`);
async function getJson(key) {
  if (redis) return await redis.get(key) ?? void 0;
  if (isServerless) return void 0;
  try {
    return JSON.parse(readFileSync(file(key), "utf8"));
  } catch {
    return void 0;
  }
}
async function setJson(key, value, ttlSeconds) {
  if (redis) {
    await (ttlSeconds ? redis.set(key, value, { ex: ttlSeconds }) : redis.set(key, value));
    return;
  }
  if (isServerless) throw new Error("No storage configured: add Upstash Redis to this Vercel project.");
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(file(key), JSON.stringify(value));
}
async function del(key) {
  if (redis) {
    await redis.del(key);
    return;
  }
  if (isServerless) return;
  try {
    const { rmSync } = await import("node:fs");
    rmSync(file(key), { force: true });
  } catch {
  }
}
async function hit(key, windowSeconds) {
  if (redis) {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSeconds);
    return n;
  }
  const now = Date.now();
  const hits = (memoryHits.get(key) ?? []).filter((t) => now - t < windowSeconds * 1e3);
  hits.push(now);
  memoryHits.set(key, hits);
  return hits.length;
}
var memoryHits = /* @__PURE__ */ new Map();

// server/reports.ts
var KEEP_HOURS = 72;
var MAX_PHOTO_BYTES = 9e5;
var LIMIT_PER_HOUR = 10;
var LIST_KEY = "reports";
var inMauritius = (lat, lon) => lat >= -20.6 && lat <= -19.9 && lon >= 57.2 && lon <= 57.9 || lat >= -19.85 && lat <= -19.6 && lon >= 63.3 && lon <= 63.55;
var recent = (reports) => {
  const since = Date.now() - KEEP_HOURS * 3600 * 1e3;
  return reports.filter((r) => new Date(r.createdAt).getTime() > since);
};
var isTestReport = (r) => r.warning.startsWith("demo:");
async function listReports(scope = "live") {
  return recent(await getJson(LIST_KEY) ?? []).filter((r) => scope === "demo" ? isTestReport(r) : !isTestReport(r)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function deleteReport(id) {
  const all = await getJson(LIST_KEY) ?? [];
  const keep = all.filter((r) => r.id !== id);
  if (keep.length === all.length) return false;
  await setJson(LIST_KEY, keep);
  await del(`photo:${id}`);
  return true;
}
var ReportError = class extends Error {
  status;
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
};
async function addReport(body, ip, warning) {
  if (await hit(`ratelimit:${ip}`, 3600) > LIMIT_PER_HOUR) throw new ReportError("Too many reports from this device. Try again later.", 429);
  const b = body ?? {};
  const kind = String(b.kind);
  const lat = Number(b.lat);
  const lon = Number(b.lon);
  if (!REPORT_KINDS.includes(kind)) throw new ReportError("Unknown report type.");
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inMauritius(lat, lon)) throw new ReportError("The location must be in Mauritius or Rodrigues.");
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : void 0;
  const id = randomUUID();
  let photo;
  if (typeof b.photo === "string" && b.photo.startsWith("data:image/jpeg;base64,")) {
    const base64 = b.photo.slice(23);
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > MAX_PHOTO_BYTES) throw new ReportError("Photo is too large.");
    if (bytes[0] !== 255 || bytes[1] !== 216) throw new ReportError("Photo must be a JPEG image.");
    await setJson(`photo:${id}`, base64, KEEP_HOURS * 3600);
    photo = `/api/reports/photo/${id}.jpg`;
  }
  const report = { id, kind, lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)), note: note || void 0, photo, createdAt: (/* @__PURE__ */ new Date()).toISOString(), warning };
  const all = recent(await getJson(LIST_KEY) ?? []);
  await setJson(LIST_KEY, [report, ...all].slice(0, 2e3));
  return report;
}
async function getPhoto(name) {
  const id = name.match(/^([0-9a-f-]{36})\.jpg$/)?.[1];
  if (!id) return void 0;
  const base64 = await getJson(`photo:${id}`);
  return base64 ? Buffer.from(base64, "base64") : void 0;
}

// server/status.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join2 } from "node:path";

// server/cyclone.ts
var GDACS = "https://www.gdacs.org/gdacsapi/api";
var MAURITIUS = { lat: -20.16, lon: 57.5 };
var COMPASS = ["north", "north-northeast", "northeast", "east-northeast", "east", "east-southeast", "southeast", "south-southeast", "south", "south-southwest", "southwest", "west-southwest", "west", "west-northwest", "northwest", "north-northwest"];
function bearingFromWord(word) {
  const w = word.toLowerCase().replace(/erly$|ly$/, "").replace(/-?wards?$/, "").replace(/\s+/g, "-");
  const norm = w.replace(/^(north|south)-(east|west)$/, "$1$2").replace(/-(north|south)-(east|west)$/, "-$1$2");
  const i = COMPASS.indexOf(norm);
  return i >= 0 ? i * 22.5 : void 0;
}
var INTENSITY = /(very intense tropical cyclone|intense tropical cyclone|tropical cyclone|severe tropical storm|moderate tropical storm|tropical storm|tropical depression|tropical disturbance|zone of disturbed weather|remnant low|filling low)/i;
function parsePosition(lines) {
  const text = lines.join(" ").replace(/\s+/g, " ");
  const pos = text.match(/latitude\s+([\d.]+)\s*degrees?\s+south\s+and\s+longitude\s+([\d.]+)\s*degrees?\s+east/i);
  if (!pos) return void 0;
  const lat = -Number(pos[1]);
  const lon = Number(pos[2]);
  const nameMatch = text.match(new RegExp(`${INTENSITY.source}\\s+([A-Z][a-zA-Z'-]+)`, "i"));
  const move = text.match(/moving in an? (?:general )?([a-z-]+(?:\s[a-z-]+)?) direction at (?:a speed of )?(?:about |around )?(\d+) km\/?h/i);
  const where = text.match(/centred at (?:about )?([^.]*?)(?: near latitude)/i)?.[1];
  const at = text.match(/At (\d{1,2}h\d{2})/)?.[1];
  return {
    name: nameMatch?.[2],
    intensity: nameMatch?.[1] ? nameMatch[1].replace(/\b\w/g, (c) => c.toUpperCase()) : void 0,
    lat,
    lon,
    movement: move ? { towards: move[1].toLowerCase(), bearing: bearingFromWord(move[1]), speedKmh: Number(move[2]) } : void 0,
    where: where?.trim(),
    at
  };
}
function distanceKm(a, b = MAURITIUS) {
  const r = (d) => d * Math.PI / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}
function centroid(coords) {
  const ring = coords[0];
  const [x, y] = ring.reduce(([sx, sy], [px, py]) => [sx + px, sy + py], [0, 0]);
  return [Number((x / ring.length).toFixed(3)), Number((y / ring.length).toFixed(3))];
}
function simplifyGdacs(geo) {
  const features = [];
  for (const f of geo.features) {
    const cls = String(f.properties.Class ?? "");
    const name = String(f.properties.eventname ?? "");
    if (cls.startsWith("Line_Line")) {
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: { kind: "track", forecast: f.properties.forecast === true, category: String(f.properties.polygonlabel ?? ""), name }
      });
    } else if (cls.startsWith("Point_Polygon")) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: centroid(f.geometry.coordinates) },
        properties: { kind: "point", label: String(f.properties.polygonlabel ?? ""), name }
      });
    } else if (cls === "Poly_Cones") {
      features.push({ type: "Feature", geometry: f.geometry, properties: { kind: "cone", name } });
    } else if (/^Poly_(Green|Orange|Red)$/.test(cls)) {
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: { kind: "wind", level: cls.slice(5).toLowerCase(), label: String(f.properties.polygonlabel ?? ""), name }
      });
    }
  }
  return { type: "FeatureCollection", features };
}
var inSwio = ([lon, lat]) => lon >= 30 && lon <= 100 && lat <= -2 && lat >= -45;
var listCache;
var LIST_TTL = 15 * 60 * 1e3;
async function getActiveTracks() {
  if (listCache && Date.now() - listCache.at < LIST_TTL) return listCache.tracks;
  const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
  const res = await fetch(`${GDACS}/events/geteventlist/SEARCH?eventlist=TC&fromDate=${day(-10)}&toDate=${day(1)}&alertlevel=green;orange;red`, {
    signal: AbortSignal.timeout(2e4)
  });
  if (!res.ok) throw new Error(`GDACS \u2192 HTTP ${res.status}`);
  const list = await res.json();
  const recent2 = Date.now() - 36 * 3600 * 1e3;
  const active = list.features.filter(
    (f) => inSwio(f.geometry.coordinates) && (/* @__PURE__ */ new Date(String(f.properties.todate) + "Z")).getTime() > recent2
  );
  const tracks = await Promise.all(
    active.map(async (f) => {
      const url2 = f.properties.url.geometry;
      const g = await fetch(url2, { signal: AbortSignal.timeout(2e4) }).then((r) => r.json());
      return simplifyGdacs(g);
    })
  );
  listCache = { at: Date.now(), tracks };
  return tracks;
}

// server/status.ts
var CACHE_MS = 5 * 60 * 1e3;
var TIMEOUT_MS = 15e3;
async function fetchPage(url2) {
  const res = await fetch(url2, {
    headers: { "User-Agent": "CalamityCompanion/0.1 (personal public-safety project)" },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`${url2} \u2192 HTTP ${res.status}`);
  return new TextDecoder("utf-8").decode(await res.arrayBuffer());
}
var placeKey = (name) => name.toLowerCase().replace(/\s*\(.*\)/, "").replace(/[^a-z]/g, "");
function buildAreas(rain, x, conditions) {
  const areas = /* @__PURE__ */ new Map();
  const get = (name) => {
    const k = placeKey(name);
    if (!areas.has(k)) areas.set(k, { name: name.replace(/\s*\(.*\)/, "") });
    return areas.get(k);
  };
  for (const r of rain.last24h?.stations ?? []) get(r.station).rain24h = r.mm;
  for (const r of rain.last3h?.stations ?? []) get(r.station).rain3h = r.mm;
  for (const w of x.wind) get(w.station).windMaxKmh = w.kmh;
  for (const t of x.temp) Object.assign(get(t.station), { tempMax: t.max, tempMin: t.min });
  for (const h of x.humidity) get(h.station).humidity = h.pct;
  for (const c of conditions) Object.assign(get(c.place), { sky: c.sky, tempNow: c.tempC, windNow: c.wind });
  const score = (a) => (a.rain3h ?? 0) * 4 + (a.rain24h ?? 0) + (a.windMaxKmh ?? 0) / 10;
  return [...areas.values()].sort((a, b) => score(b) - score(a));
}
var lastState;
var previous;
function build(pages, fetchedAt, source, errors, tracks = []) {
  const cycloneBulletin = pages.cycloneEn ? parseBulletin(pages.cycloneEn) : void 0;
  const rainBulletin = pages.rain ? parseBulletin(pages.rain) : void 0;
  const banner = parseBanner(pages.home ?? pages.cycloneEn ?? "");
  const c = classify(banner, [...cycloneBulletin?.lines.slice(0, 3) ?? [], ...rainBulletin?.lines.slice(0, 3) ?? []]);
  if (source === "live") {
    if (lastState && (lastState.cyclone !== c.cyclone || lastState.rain !== c.rain)) {
      previous = { cyclone: lastState.cyclone, rain: lastState.rain, changedAt: fetchedAt };
    }
    if (!lastState || lastState.cyclone !== c.cyclone || lastState.rain !== c.rain) {
      lastState = { cyclone: c.cyclone, rain: c.rain, since: fetchedAt };
    }
  }
  const bulletin = c.cyclone !== "none" && cycloneBulletin ? { ...cycloneBulletin, url: MMS_PAGES.cycloneEn } : c.rain !== "none" && rainBulletin ? { ...rainBulletin, url: MMS_PAGES.rain } : void 0;
  const pos = c.cyclone !== "none" && cycloneBulletin ? parsePosition(cycloneBulletin.lines) : void 0;
  const cyclone = pos && { ...pos, distanceKm: distanceKm(pos), source: "mms" };
  const forecast = pages.forecastEn ? parseForecast(pages.forecastEn) : void 0;
  const rainfall = pages.latest ? parseRainfall(pages.latest) : {};
  const extras = pages.latest ? parseStationExtras(pages.latest) : { wind: [], temp: [], humidity: [] };
  const conditions = parseConditions(pages.home ?? "");
  const forecastFr = pages.forecastFr ? parseForecast(pages.forecastFr) : void 0;
  return {
    source,
    fetchedAt,
    snapshot: {
      cyclone: c.cyclone,
      rain: c.rain,
      rainArea: c.rainArea,
      issuedAt: bulletin?.issuedAt ?? fetchedAt,
      fetchedAt,
      previous: source === "live" ? previous : void 0
    },
    bulletin,
    cyclone,
    tracks,
    notices: c.others,
    rainfall,
    conditions,
    areas: buildAreas(rainfall, extras, conditions),
    areaPeriods: { rain3h: rainfall.last3h?.period, rain24h: rainfall.last24h?.period, wind: extras.windPeriod },
    forecast: forecast && { ...forecast, url: MMS_PAGES.forecastEn },
    forecastFr: forecastFr && forecastFr.next24h.length ? { ...forecastFr, url: MMS_PAGES.forecastFr } : void 0,
    errors
  };
}
var cache2;
var inflight;
async function getLiveStatus() {
  if (cache2 && Date.now() - cache2.at < CACHE_MS) return cache2.status;
  inflight ??= (async () => {
    let trackError;
    const keys = Object.keys(MMS_PAGES);
    const [results, tracks] = await Promise.all([
      Promise.allSettled(keys.map((k) => fetchPage(MMS_PAGES[k]))),
      getActiveTracks().catch((e) => {
        trackError = `GDACS: ${e.message}`;
        return [];
      })
    ]);
    const errors = trackError ? [trackError] : [];
    const pages = Object.fromEntries(
      keys.map((k, i) => {
        const r = results[i];
        if (r.status === "rejected") errors.push(`${k}: ${String(r.reason?.message ?? r.reason)}`);
        return [k, r.status === "fulfilled" ? r.value : void 0];
      })
    );
    if (!pages.home && !pages.cycloneEn && cache2) {
      return { ...cache2.status, errors };
    }
    const saved = await getJson("warning-state").catch(() => void 0);
    if (saved) ({ lastState, previous } = saved);
    const before = JSON.stringify(lastState);
    const status = build(pages, (/* @__PURE__ */ new Date()).toISOString(), "live", errors, tracks);
    if (JSON.stringify(lastState) !== before) await setJson("warning-state", { lastState, previous }).catch(() => void 0);
    cache2 = { at: Date.now(), status };
    return status;
  })().finally(() => {
    inflight = void 0;
  });
  return inflight;
}
function fixturesDir() {
  const candidates = [
    join2(process.cwd(), "server", "fixtures"),
    join2(process.cwd(), "app", "server", "fixtures"),
    join2(import.meta.dirname ?? "", "..", "server", "fixtures"),
    join2(import.meta.dirname ?? "", "fixtures")
  ];
  return candidates.find((d) => existsSync2(d)) ?? candidates[0];
}
function getBelalArchiveStatus() {
  const f = (name) => readFileSync2(join2(fixturesDir(), name), "utf8");
  const belal = f("2024-01-16-belal-cyclone-en.html");
  const status = build(
    {
      home: belal,
      cycloneEn: belal,
      rain: void 0,
      special: void 0,
      latest: void 0,
      // no archived rainfall for that day
      forecastEn: void 0,
      forecastFr: void 0
    },
    "2024-01-16T00:20:00.000Z",
    "archive-belal",
    [],
    [JSON.parse(f("2024-01-belal-gdacs-track.json"))]
  );
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return { ...status, fetchedAt: now, snapshot: { ...status.snapshot, fetchedAt: now } };
}

// server/towns.ts
var TTL2 = 15 * 60 * 1e3;
var TOWNS = [
  { name: "Grand Baie", region: "north", lat: -20.0128, lon: 57.5808 },
  { name: "Triolet", region: "north", lat: -20.0575, lon: 57.5503 },
  { name: "Goodlands", region: "north", lat: -20.0369, lon: 57.6436 },
  { name: "Centre de Flacq", region: "east", lat: -20.1897, lon: 57.7144 },
  { name: "Bel Air", region: "east", lat: -20.2578, lon: 57.7497 },
  { name: "Mah\xE9bourg", region: "south", lat: -20.4081, lon: 57.7 },
  { name: "Souillac", region: "south", lat: -20.5167, lon: 57.5167 },
  { name: "Le Morne", region: "west", lat: -20.455, lon: 57.33 },
  { name: "Flic-en-Flac", region: "west", lat: -20.2742, lon: 57.3711 },
  { name: "Rose-Hill", region: "centre", lat: -20.2397, lon: 57.4697 },
  { name: "Quatre Bornes", region: "centre", lat: -20.2654, lon: 57.4791 },
  { name: "Moka", region: "centre", lat: -20.219, lon: 57.496 },
  { name: "Curepipe", region: "centre", lat: -20.3186, lon: 57.5263 }
];
var MORE_PLACES = [
  { name: "Pamplemousses", region: "north", lat: -20.1039, lon: 57.5703 },
  { name: "Cap Malheureux", region: "north", lat: -19.9842, lon: 57.6142 },
  { name: "P\xE9reyb\xE8re", region: "north", lat: -19.9988, lon: 57.5885 },
  { name: "Trou aux Biches", region: "north", lat: -20.033, lon: 57.5503 },
  { name: "Grand Gaube", region: "north", lat: -20.0064, lon: 57.6608 },
  { name: "Rivi\xE8re du Rempart", region: "north", lat: -20.1031, lon: 57.6847 },
  { name: "Poudre d\u2019Or", region: "north", lat: -20.06, lon: 57.6767 },
  { name: "Terre Rouge", region: "north", lat: -20.1283, lon: 57.5312 },
  { name: "Mapou", region: "north", lat: -20.0758, lon: 57.6014 },
  { name: "Belle Mare", region: "east", lat: -20.1996, lon: 57.7786 },
  { name: "Poste de Flacq", region: "east", lat: -20.1631, lon: 57.7306 },
  { name: "Lalmatie", region: "east", lat: -20.1897, lon: 57.6611 },
  { name: "Bon Accueil", region: "east", lat: -20.175, lon: 57.672 },
  { name: "Trou d\u2019Eau Douce", region: "east", lat: -20.234, lon: 57.7945 },
  { name: "Quatre Cocos", region: "east", lat: -20.2015, lon: 57.7745 },
  { name: "Grande Rivi\xE8re Sud Est", region: "east", lat: -20.2861, lon: 57.7758 },
  { name: "Montagne Blanche", region: "east", lat: -20.2854, lon: 57.6587 },
  { name: "Rose Belle", region: "south", lat: -20.4003, lon: 57.5967 },
  { name: "New Grove", region: "south", lat: -20.4086, lon: 57.6136 },
  { name: "Plaine Magnien", region: "south", lat: -20.4297, lon: 57.6697 },
  { name: "Blue Bay", region: "south", lat: -20.441, lon: 57.7191 },
  { name: "Grand Bois", region: "south", lat: -20.4189, lon: 57.5442 },
  { name: "Rivi\xE8re des Anguilles", region: "south", lat: -20.493, lon: 57.563 },
  { name: "Saint Aubin", region: "south", lat: -20.496, lon: 57.55 },
  { name: "Surinam", region: "south", lat: -20.5097, lon: 57.5053 },
  { name: "Chemin Grenier", region: "south", lat: -20.493, lon: 57.469 },
  { name: "Bel Ombre", region: "south", lat: -20.5022, lon: 57.4061 },
  { name: "Baie du Cap", region: "south", lat: -20.491, lon: 57.378 },
  { name: "Albion", region: "west", lat: -20.2081, lon: 57.4077 },
  { name: "Petite Rivi\xE8re", region: "west", lat: -20.1955, lon: 57.4459 },
  { name: "Bambous", region: "west", lat: -20.2567, lon: 57.4061 },
  { name: "Cascavelle", region: "west", lat: -20.2869, lon: 57.4072 },
  { name: "Tamarin", region: "west", lat: -20.3256, lon: 57.3706 },
  { name: "Grande Rivi\xE8re Noire", region: "west", lat: -20.3603, lon: 57.3661 },
  { name: "Chamarel", region: "west", lat: -20.425, lon: 57.391 },
  { name: "La Gaulette", region: "west", lat: -20.4279, lon: 57.3608 },
  { name: "Pailles", region: "centre", lat: -20.1927, lon: 57.4883 },
  { name: "Saint Pierre", region: "centre", lat: -20.2215, lon: 57.5343 },
  { name: "R\xE9duit", region: "centre", lat: -20.2344, lon: 57.4939 },
  { name: "Eb\xE8ne", region: "centre", lat: -20.2449, lon: 57.4916 },
  { name: "Quartier Militaire", region: "centre", lat: -20.2479, lon: 57.5974 },
  { name: "Phoenix", region: "centre", lat: -20.2867, lon: 57.5022 },
  { name: "Flor\xE9al", region: "centre", lat: -20.3094, lon: 57.5008 },
  { name: "La Marie", region: "centre", lat: -20.335, lon: 57.485 },
  { name: "Nouvelle France", region: "centre", lat: -20.3706, lon: 57.5611 }
];
var SETS = { main: TOWNS, more: MORE_PLACES };
var caches = {};
async function getTowns(set = "main") {
  const places = SETS[set];
  const cache4 = caches[set];
  if (cache4 && Date.now() - cache4.at < TTL2) return cache4.status;
  const url2 = "https://api.open-meteo.com/v1/forecast?" + new URLSearchParams({
    latitude: places.map((t) => t.lat).join(","),
    longitude: places.map((t) => t.lon).join(","),
    current: "temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,relative_humidity_2m,is_day",
    timezone: "Indian/Mauritius"
  });
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url2, { signal: AbortSignal.timeout(2e4) }).catch(() => void 0);
    if (res?.ok) break;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  if (!res?.ok) {
    if (cache4) return cache4.status;
    throw new Error(`Open-Meteo \u2192 HTTP ${res?.status ?? "no response"}`);
  }
  const data = await res.json();
  const towns = data.map((d, i) => ({
    name: places[i].name,
    region: places[i].region,
    tempC: Math.round(d.current.temperature_2m),
    code: d.current.weather_code,
    windKmh: Math.round(d.current.wind_speed_10m),
    gustKmh: Math.round(d.current.wind_gusts_10m),
    rainMm: d.current.precipitation,
    humidity: d.current.relative_humidity_2m,
    isDay: d.current.is_day === 1
  }));
  const status = { fetchedAt: (/* @__PURE__ */ new Date()).toISOString(), modelTime: data[0]?.current.time, towns };
  caches[set] = { at: Date.now(), status };
  return status;
}

// server/water.ts
import { extractText, getDocumentProxy } from "unpdf";

// src/data/reservoirs.ts
var DEFIMEDIA_2OCT = {
  name: "Defimedia, 2 Oct 2026",
  url: "https://defimedia.info/mare-aux-vacoas-sous-pression-la-cwa-veut-eviter-le-seuil-critique-de-20-dici-fin-novembre"
};
var LEXPRESS_6OCT = {
  name: "L'Express via AllAfrica, 6 Oct 2026 (CWA figures)",
  url: "https://fr.allafrica.com/stories/202610060344.html"
};
var LEMAURICIEN_10OCT = {
  name: "Le Mauricien, 10 Oct 2026",
  url: "https://www.lemauricien.com/actualites/societe/mare-aux-vacoas-a-357-30-000-m%C2%B3-deau-supplementaires-attendus-dici-fin-octobre/719924/"
};
var RESERVOIRS = [
  {
    id: "mare-aux-vacoas",
    name: "Mare-aux-Vacoas",
    capacityMm3: 25.89,
    serves: "Plaines Wilhems and the centre of the island",
    readings: [
      { date: "2026-10-02", pct: 36.8, approx: true, source: DEFIMEDIA_2OCT },
      { date: "2026-10-05", pct: 36.2, source: LEXPRESS_6OCT },
      { date: "2026-10-08", pct: 35.7, source: LEMAURICIEN_10OCT }
    ]
  },
  {
    id: "mare-longue",
    name: "Mare Longue",
    readings: [{ date: "2026-10-05", pct: 79.3, approx: true, source: LEXPRESS_6OCT }]
  }
];
var ALL_RESERVOIRS = {
  date: "2026-10-08",
  pct: 57.1,
  lastYearPct: 87.4,
  source: LEMAURICIEN_10OCT
};
var OUTLOOK = {
  text: "The Water Resources Commission expects Mare-aux-Vacoas could reach the critical 20% level around the end of November 2026.",
  source: DEFIMEDIA_2OCT
};

// server/water.ts
var CWA = "https://cwa.govmu.org/cwa";
var ARCGIS = "https://gis.cwa.mu/arcgis/rest/services/Website/Map_For_Website/MapServer/2/query";
var TTL3 = 6 * 60 * 60 * 1e3;
var ALIASES = [
  [/mare[\s-]+aux[\s-]+vacoas/i, "mare-aux-vacoas", "Mare-aux-Vacoas"],
  [/mare[\s-]+longue/i, "mare-longue", "Mare Longue"],
  [/la\s+nicoli[eè]re/i, "la-nicoliere", "La Nicoli\xE8re"],
  [/midlands/i, "midlands", "Midlands Dam"],
  [/la\s+ferme/i, "la-ferme", "La Ferme"],
  [/piton\s+du\s+milieu/i, "piton-du-milieu", "Piton du Milieu"],
  [/bagatelle/i, "bagatelle", "Bagatelle Dam"],
  [/eau\s+bleue/i, "eau-bleue", "Eau Bleue"],
  [/tamarind\s+falls/i, "tamarind-falls", "Tamarind Falls"],
  [/diamamouve/i, "diamamouve", "Cascade Diamamouve"],
  [/valetta/i, "valetta", "Valetta"],
  [/dagoti[eè]re/i, "dagotiere", "Dagoti\xE8re"]
];
var idFor = (name) => ALIASES.find(([re]) => re.test(name));
var FALLBACK_GEO = {
  "mare-aux-vacoas": { lon: 57.5034, lat: -20.373, capacity: "25.89 Mm\xB3", purpose: "Domestic" },
  midlands: { lon: 57.5868, lat: -20.3236, capacity: "25.5 Mm\xB3", purpose: "Domestic, irrigation" },
  bagatelle: { lon: 57.5228, lat: -20.2495, capacity: "14 Mm\xB3", purpose: "" },
  "la-ferme": { lon: 57.4322, lat: -20.2566, capacity: "11.52 Mm\xB3", purpose: "Irrigation" },
  "mare-longue": { lon: 57.4582, lat: -20.3789, capacity: "6.28 Mm\xB3", purpose: "Hydropower, irrigation" },
  "la-nicoliere": { lon: 57.6163, lat: -20.1585, capacity: "5.26 Mm\xB3", purpose: "Domestic, irrigation" },
  diamamouve: { lon: 57.6598, lat: -20.3114, capacity: "4.30 Mm\xB3", purpose: "Hydropower" },
  "eau-bleue": { lon: 57.603, lat: -20.3482, capacity: "4.10 Mm\xB3", purpose: "Hydropower" },
  "piton-du-milieu": { lon: 57.5781, lat: -20.2928, capacity: "2.99 Mm\xB3", purpose: "Domestic" },
  "tamarind-falls": { lon: 57.4617, lat: -20.3598, capacity: "2.30 Mm\xB3", purpose: "Hydropower, irrigation" },
  valetta: { lon: 57.5722, lat: -20.2595, capacity: "2.0 Mm\xB3", purpose: "Mill, irrigation" },
  dagotiere: { lon: 57.5643, lat: -20.2415, capacity: "0.60 Mm\xB3", purpose: "Mill, irrigation" }
};
async function getJson2(url2) {
  const res = await fetch(url2, { signal: AbortSignal.timeout(25e3), headers: { "User-Agent": "CalamityCompanion/0.1" } });
  if (!res.ok) throw new Error(`${url2} \u2192 HTTP ${res.status}`);
  return await res.json();
}
async function reservoirGeo() {
  const q = `${ARCGIS}?where=1%3D1&outFields=NAME,CAPACITY,PURPOSE&outSR=4326&geometryPrecision=4&f=json`;
  const data = await getJson2(q);
  const out = {};
  for (const f of data.features) {
    const hit2 = idFor(f.attributes.NAME ?? "");
    const ring = f.geometry?.rings?.flat();
    if (!hit2 || !ring?.length) continue;
    const [x, y] = ring.reduce(([a, b], [px, py]) => [a + px, b + py], [0, 0]);
    const purpose = (f.attributes.PURPOSE ?? "").trim().toLowerCase().replace(/hydropoer/, "hydropower").replace(/\s*,\s*/g, ", ");
    out[hit2[1]] = {
      lon: Number((x / ring.length).toFixed(4)),
      lat: Number((y / ring.length).toFixed(4)),
      capacity: (f.attributes.CAPACITY ?? "").trim(),
      purpose: purpose.charAt(0).toUpperCase() + purpose.slice(1)
    };
  }
  return Object.keys(out).length ? out : FALLBACK_GEO;
}
var RELEVANT = /r[ée]servoir|remplissage|niveau|s[ée]cheresse|distribution d.eau|fourniture d.eau|coupure|restriction|horaires|dry season|water supply/i;
function percentagesFromText(text) {
  const out = {};
  const flat = text.replace(/\s+/g, " ");
  for (const [re, id] of ALIASES) {
    const m = flat.match(new RegExp(`${re.source}[^%]{0,90}?(\\d{1,3}(?:[.,]\\d{1,2})?)\\s?%`, "i"));
    if (m) {
      const v = Number(m[1].replace(",", "."));
      if (v >= 0 && v <= 100) out[id] = v;
    }
  }
  return out;
}
async function pdfText(url2) {
  const res = await fetch(url2, { signal: AbortSignal.timeout(3e4) });
  if (!res.ok) throw new Error(`${url2} \u2192 HTTP ${res.status}`);
  const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
var cache3;
async function getWater() {
  if (cache3 && Date.now() - cache3.at < TTL3) return cache3.status;
  const errors = [];
  const geo = await reservoirGeo().catch((e) => {
    errors.push(`CWA GIS: ${e.message}`);
    return FALLBACK_GEO;
  });
  const posts = await getJson2(`${CWA}/?rest_route=/wp/v2/posts&per_page=30&_fields=date,link,title,content`).catch((e) => {
    errors.push(`CWA posts: ${e.message}`);
    return [];
  });
  const notices = posts.map((p) => ({ title: decodeEntities(p.title.rendered).trim(), date: p.date.slice(0, 10), url: p.link })).filter((n) => RELEVANT.test(n.title)).slice(0, 6);
  const live = {};
  const since = Date.now() - 120 * 864e5;
  for (const p of posts.filter((p2) => RELEVANT.test(p2.title.rendered) && new Date(p2.date).getTime() > since)) {
    const pdfs = [...(p.content?.rendered ?? "").matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => new URL(m[1], CWA + "/").href);
    for (const pdf of pdfs.slice(0, 2)) {
      try {
        const found = percentagesFromText(await pdfText(pdf));
        for (const [id, pct] of Object.entries(found)) {
          if (!live[id] || live[id].date < p.date.slice(0, 10))
            live[id] = { pct, date: p.date.slice(0, 10), source: { name: `CWA communiqu\xE9, ${p.date.slice(0, 10)}`, url: pdf } };
        }
      } catch (e) {
        errors.push(`PDF ${pdf}: ${e.message}`);
      }
    }
  }
  const reservoirs = Object.entries(geo).map(([id, g]) => {
    const name = ALIASES.find(([, i]) => i === id)?.[2] ?? id;
    const published = RESERVOIRS.find((r) => r.id === id);
    const readings = [
      ...published?.readings.map((r) => ({ date: r.date, pct: r.pct, approx: r.approx, source: r.source, from: "press" })) ?? [],
      ...live[id] ? [{ ...live[id], from: "cwa" }] : []
    ].sort((a, b) => a.date.localeCompare(b.date));
    return { id, name, ...g, readings };
  });
  const status = {
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    reservoirs: reservoirs.sort((a, b) => parseFloat(b.capacity) - parseFloat(a.capacity)),
    all: ALL_RESERVOIRS,
    outlook: OUTLOOK,
    notices,
    errors
  };
  cache3 = { at: Date.now(), status };
  return status;
}

// server/api.ts
var cdn = (seconds) => `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`;
function json(res, status, body, cache4 = "no-store") {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", status === 200 ? cache4 : "no-store");
  res.end(JSON.stringify(body));
}
async function readBody(req, limit = 15e5) {
  const pre = req.body;
  if (pre !== void 0) return typeof pre === "string" ? JSON.parse(pre) : pre;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new ReportError("Request too large.", 413);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
var clientIp = (req) => String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
var ACTIVE_CYCLONE = /^class[1-4]$|^safetyBulletin$/;
async function handleApi(req, res) {
  if (!req.url?.startsWith("/api/")) return false;
  const url2 = new URL(req.url, "http://x");
  try {
    switch (url2.pathname) {
      case "/api/status":
        if (url2.searchParams.get("archive") === "belal") return json(res, 200, getBelalArchiveStatus(), cdn(60)), true;
        return json(res, 200, await getLiveStatus(), cdn(120)), true;
      case "/api/towns":
        if (url2.searchParams.get("set") === "more") return json(res, 200, await getTowns("more"), cdn(1800)), true;
        return json(res, 200, await getTowns(), cdn(900)), true;
      case "/api/news":
        return json(res, 200, await getNews(), cdn(600)), true;
      case "/api/water":
        return json(res, 200, await getWater(), cdn(3600)), true;
      case "/api/mms/menu":
        return json(res, 200, await getMenu(), cdn(86400)), true;
      case "/api/mms/page": {
        const path = url2.searchParams.get("path") ?? "";
        if (!await isAllowedPath(path)) return json(res, 404, { error: "Not an MMS menu page." }), true;
        return json(res, 200, await getPage(path), cdn(300)), true;
      }
      case "/api/mms/image": {
        const src = new URL(url2.searchParams.get("src") ?? "");
        if (src.hostname !== "metservice.intnet.mu") return json(res, 400, { error: "Only MMS images." }), true;
        const upstream = await fetch(src, { signal: AbortSignal.timeout(2e4) });
        const type = upstream.headers.get("content-type") ?? "";
        if (!upstream.ok || !type.startsWith("image/")) return json(res, 502, { error: "Image unavailable." }), true;
        res.setHeader("Content-Type", type);
        res.setHeader("Cache-Control", cdn(600));
        res.end(Buffer.from(await upstream.arrayBuffer()));
        return true;
      }
      case "/api/reports": {
        if (req.method === "GET") return json(res, 200, await listReports(url2.searchParams.get("scope") === "demo" ? "demo" : "live"), cdn(30)), true;
        if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." }), true;
        const body = await readBody(req);
        const status = await getLiveStatus();
        const demo = body.demo === true;
        if (!demo && !ACTIVE_CYCLONE.test(status.snapshot.cyclone))
          return json(res, 403, { error: "Reporting opens when a cyclone warning is in force." }), true;
        const warning = demo ? `demo:${String(body.demoWarning ?? "")}` : status.snapshot.cyclone;
        return json(res, 201, await addReport(body, clientIp(req), warning)), true;
      }
    }
    const del2 = url2.pathname.match(/^\/api\/reports\/([0-9a-f-]{36})$/);
    if (del2 && req.method === "DELETE") {
      const key = process.env.ADMIN_KEY;
      if (!key) return json(res, 403, { error: "Deleting is off: set ADMIN_KEY in the server settings." }), true;
      if (req.headers["x-admin-key"] !== key) return json(res, 401, { error: "Wrong admin key." }), true;
      return json(res, await deleteReport(del2[1]) ? 200 : 404, { ok: true }), true;
    }
    if (url2.pathname.startsWith("/api/reports/photo/")) {
      const photo = await getPhoto(url2.pathname.split("/").pop() ?? "");
      if (!photo) return json(res, 404, { error: "Not found." }), true;
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.end(photo);
      return true;
    }
    return json(res, 404, { error: "Unknown API route." }), true;
  } catch (e) {
    const status = e instanceof ReportError ? e.status : 502;
    return json(res, status, { error: e.message }), true;
  }
}

// server/vercel.ts
var config = { maxDuration: 60 };
async function handler(req, res) {
  const url2 = new URL(req.url ?? "/", "http://x");
  const path = url2.searchParams.get("__path");
  if (path !== null) {
    url2.searchParams.delete("__path");
    url2.searchParams.delete("route");
    req.url = `/api/${path}${url2.search}`;
  }
  const handled = await handleApi(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.end("Not found");
  }
}
export {
  config,
  handler as default
};
