// Seat finder studio: 4-step setup wizard, "ready" page, and the guest-facing seat lookup.
// Published data lives in Supabase (see schema.sql). Only the unfinished form is kept in localStorage.

const KEY = "seatfinder_studio";
const FREE_LIMIT = 300;
const STEPS = ["Couple", "Guests", "Theme", "Publish"];
const PALETTES = [
  ["Baby Blue", "#7b86a3"], ["Champagne Rose", "#9c7f6d"], ["Sage & Ivory", "#6f7f69"],
  ["Dusty Mauve", "#80626f"], ["Midnight & Gold", "#3b4459"], ["Blush & Gold", "#c9a24d"],
  ["Terracotta & Cream", "#a65d4b"], ["Emerald & Ivory", "#2f6354"], ["Lavender Mist", "#7b6aa8"],
  ["Coastal Navy", "#2d3a5f"], ["Burgundy & Blush", "#7a2e3d"], ["Pampas Neutral", "#7f705f"],
];
const ICONS = {
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  left: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  right: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  link: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};

const S = {
  n1: "", n2: "", email: "", date: "", tbd: false,
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  photo: "", guests: [], chairs: 10, diff: "", arrive: false,
  pal: 5, dark: false, slug: "", token: "",
};
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

const app = document.getElementById("app");
let step = 0;
let V = null; // public details of the wedding being viewed on the guest page

const sb = window.supabase && window.SUPABASE_URL && !window.SUPABASE_URL.includes("YOUR-PROJECT")
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

/* ---------- Helpers ---------- */

// h("div", {class: "x", onclick: fn}, child, "text", ...) builds an element.
function h(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node[k] = v;
    else if (v != null && v !== false) node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(kid));
  return node;
}
function ic(name, size = 16) {
  const span = h("span");
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  return span.firstChild;
}
const pal = () => PALETTES[S.pal];
const names = () => `${S.n1 || "Name"} & ${S.n2 || "Name"}`;
const copyText = (text, button) => {
  navigator.clipboard?.writeText(text).then(() => (button.lastChild.textContent = " Copied"));
};

/* ---------- Guest list logic ---------- */

const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

// CSV/TSV text -> guests (first, last, table, optional area). A header row is skipped.
function parseCsv(text) {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/)
    .map((line) => line.split(/\t|,|;/).map((c) => c.replace(/^"|"$/g, "").trim()))
    .filter((r, i) => r.length >= 2 && r[0] && !(i === 0 && /first/i.test(r[0])))
    .map((r) => ({ first: r[0], last: r[1] || "", table: r[2] || "", area: r[3] || "" }));
}

// Every typed word must start a name word, or be within one typo of it.
function findGuests(query) {
  const terms = norm(query).split(" ").filter(Boolean);
  if (!terms.length || norm(query).length < 2) return null;
  const hits = [];
  for (const guest of S.guests) {
    const words = norm(`${guest.first} ${guest.last}`).split(" ");
    let score = 0;
    const ok = terms.every((term) => {
      let best = Infinity;
      for (const w of words) {
        if (w.startsWith(term)) best = 0;
        else if (term.length >= 4 && editDistance(w, term) <= 1) best = Math.min(best, 1);
      }
      score += best;
      return best !== Infinity;
    });
    if (ok) hits.push({ guest, score });
  }
  return hits.sort((a, b) => a.score - b.score).map((x) => x.guest);
}

// Chairs at a table: the "different number" overrides ("3: 6, Top table: 8"), else the default.
function capacity(table) {
  const key = (t) => norm(t).replace(/^table /, "");
  for (const part of S.diff.split(",")) {
    const [name, n] = part.split(":");
    if (n && key(name) === key(table)) return Number(n) || S.chairs;
  }
  return S.chairs;
}

// Guests with a blank table get the next table that still has a free chair.
function seatOnArrival(guest) {
  if (guest.table || !S.arrive) return;
  const counts = {};
  S.guests.forEach((g) => g.table && (counts[g.table] = (counts[g.table] || 0) + 1));
  const tables = Object.keys(counts).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  guest.table = tables.find((t) => counts[t] < capacity(t)) || String(tables.length + 1);
  save();
}

/* ---------- Guest-facing site (used by the live preview and the real page) ---------- */

function openSeatModal(guest, D, live) {
  if (!live) seatOnArrival(guest); // on the live site the database does this
  const previous = document.activeElement;
  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); previous?.focus(); };
  const onKey = (e) => e.key === "Escape" && close();
  const closeBtn = h("button", { class: "x", "aria-label": "Close", onclick: close }, ic("x", 18));
  const share = h("button", { class: "sh" }, "Share your experience");
  share.onclick = () => (navigator.share ? navigator.share({ title: `${D.n1} & ${D.n2}`, url: location.href }) : copyText(location.href, share));

  const overlay = h("div", { class: "ov", onclick: (e) => { if (e.target === overlay) close(); } },
    h("div", { class: "dlg", role: "dialog", "aria-modal": "true", "aria-label": "Your seat" },
      closeBtn,
      h("p", null, `Welcome ${guest.first}, to`),
      h("div", { class: "big" }, `${D.n1} & ${D.n2}`, h("i", null, "’s")),
      h("div", { class: "wd" }, "wedding", ic("heart", 15)),
      h("p", null, "Your seat is ready and waiting for you."),
      h("div", { class: "res" },
        h("div", null, `${guest.first} ${guest.last}`, guest.area ? h("div", { class: "ar" }, guest.area) : null),
        h("div", null, h("small", null, "TABLE"), h("div", { class: "tb" }, guest.table || "—"))),
      h("p", { class: "help" }, "If you need any help getting there, please speak to a member of staff."),
      share));
  overlay.style.setProperty("--acc", PALETTES[D.pal][1]);
  document.body.append(overlay);
  document.addEventListener("keydown", onKey);
  closeBtn.focus();
}

// Preview: the guest is already in memory. Live: ask the database for just this guest's seat.
async function showSeat(guest, D, preview) {
  if (preview) return openSeatModal(guest, D, false);
  const { data, error } = await sb.rpc("get_seat", { p_slug: D.slug, p_guest: guest.id });
  if (error || !data) return alert("Sorry, we couldn’t load your seat. Please ask a member of staff.");
  openSeatModal({ first: data.first, last: data.last, table: data.tbl, area: data.area }, D, true);
}

// D = the wedding to show: the form in progress (preview) or the wedding loaded from the database (live page).
function renderSite(preview, D = S) {
  const locale = preview ? "en-GB" : "en-US";
  const date = D.date && !D.tbd ? new Date(D.date + "T12:00:00").toLocaleDateString(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "Date to be confirmed";
  const photo = h("div", { class: "circ" }, D.photo ? null : ic("image", 22));
  if (D.photo) photo.style.backgroundImage = `url(${D.photo})`;

  const input = h("input", { id: preview ? "pq" : "gq", type: "text", autocomplete: "off", placeholder: "Type your first or last name" });
  const results = h("div", { "aria-live": "polite" });
  let timer;
  // List matches; a single match (or Enter / the search button) opens the seat pop-up.
  const search = async (openIfSingle) => {
    const query = input.value;
    if (norm(query).length < 2) { results.textContent = ""; return; }
    let hits;
    if (preview) hits = findGuests(query) || [];
    else {
      const { data, error } = await sb.rpc("search_guests", { p_slug: D.slug, p_query: query });
      if (input.value !== query) return; // the guest kept typing; ignore this old answer
      if (error) { results.replaceChildren(h("p", { class: "msg" }, "Something went wrong. Please try again.")); return; }
      hits = data || [];
    }
    results.textContent = "";
    if (!hits.length) {
      results.append(h("p", { class: "msg" }, preview && !S.guests.length ? "No guests yet. Add your guest list in step 2 first." : "No match yet. Check the spelling or try just your first name."));
    } else if (openIfSingle && hits.length === 1) {
      showSeat(hits[0], D, preview);
    } else {
      hits.slice(0, 8).forEach((g) => results.append(h("button", { class: "pick", onclick: () => showSeat(g, D, preview) }, `${g.first} ${g.last}`)));
    }
  };
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(() => search(false), preview ? 0 : 250); };
  input.onkeydown = (e) => { if (e.key === "Enter") search(true); }; // never return false here: it would block typing

  const site = h("div", { class: "site" + (D.dark ? " dark" : "") },
    photo,
    h("div", { class: "k" }, "Please find your seat"),
    h("h1", { class: "nm" }, `${D.n1 || "Name"} & ${D.n2 || "Name"}`),
    h("div", { class: "dt" }, date),
    h("div", { class: "dv" }, ic("mail", 14)),
    h("p", { class: "wel" }, "Welcome! Enter your name below and we’ll show you which table you’re seated at."),
    h("div", { class: "sbox" },
      h("label", { for: input.id }, ic("search", 14), "Your name"),
      h("div", { class: "in" }, input, h("button", { class: "go", "aria-label": "Search", onclick: () => search(true) }, ic("search", 18))),
      h("p", { class: "hint" }, "Tip: if there’s more than one match, look for your full name in the list below."),
      results),
    preview ? null : h("div", { class: "foot" },
      h("p", null, "Private seat finder"),
      h("p", null, "Looking for a place to organise your seating for your wedding? ", h("a", { href: "#/" }, "Create yours"))));
  site.style.setProperty("--acc", PALETTES[D.pal][1]);
  return site;
}

/* ---------- Studio helpers ---------- */

function shell(panel) {
  document.body.className = "studio";
  const steps = h("div", { class: "steps" });
  STEPS.forEach((t, i) => {
    if (i) steps.append(h("div", { class: "ln" }));
    steps.append(h("div", { class: "st" + (i === step ? " on" : i < step ? " done" : "") }, h("b", null, i < step ? ic("check", 12) : i + 1), t.toUpperCase()));
  });
  app.replaceChildren(h("div", { class: "wrap" },
    h("div", { class: "top" }, h("div", { class: "logo" }, "Seat ", h("i", null, "Finder")), h("button", { class: "hm", style: "margin:0;color:#a99cc4", onclick: reset }, "Start over")),
    h("div", { class: "eyebrow" }, "SEAT FINDER STUDIO"),
    h("h1", { class: "t" }, "Design your seat finder"),
    h("p", { class: "sub" }, "Free for small weddings · No subscriptions, no hidden fees · Your private QR site"),
    steps, panel));
  window.scrollTo(0, 0);
}
const go = (i) => { step = i; draw(); };
const field = (label, id, type, value) => h("div", { class: "f" }, h("label", { for: id }, label), h("input", { id, type, value: value || "" }));
function nav(back, next, label = "Continue") {
  const n = h("button", { class: "btn", onclick: next }, label, ic("right", 15));
  return { n, row: h("div", { class: "nav" }, back ? h("button", { class: "btn g", onclick: back }, ic("left", 15), "Back") : h("span"), n) };
}
const head = (title, sub) => [h("div", { class: "heart" }, ic("heart", 18)), h("h2", null, title), h("p", { class: "sub" }, sub)];

/* ---------- Step 1: couple ---------- */

function stepCouple() {
  const tzs = (Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [S.tz]).map((z) => [z, z.replace(/_/g, " ").replace("/", " — ")]);
  const select = h("select", { id: "tz" }, tzs.map(([z, label]) => h("option", { value: z, selected: z === S.tz ? "" : null }, label)));
  const tbd = h("input", { type: "checkbox", id: "tbd" });
  tbd.checked = S.tbd;

  const circ = h("div", { class: "circ" }, S.photo ? null : [ic("image", 18), "PHOTO"]);
  if (S.photo) circ.style.backgroundImage = `url(${S.photo})`;
  const file = h("input", { type: "file", accept: "image/*", hidden: "" });
  file.onchange = () => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => { // centre-crop to a 360px square so it fits in localStorage
        const side = Math.min(img.width, img.height), c = document.createElement("canvas");
        c.width = c.height = 360;
        c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 360, 360);
        S.photo = c.toDataURL("image/jpeg", 0.8);
        circ.replaceChildren();
        circ.style.backgroundImage = `url(${S.photo})`;
        save();
      };
      img.src = reader.result;
    };
    if (file.files[0]) reader.readAsDataURL(file.files[0]);
  };

  const n = nav(null, () => go(1));
  const inner = h("div", { class: "inner" },
    h("div", { class: "g2" }, field("Your name", "n1", "text", S.n1), field("Partner’s name", "n2", "text", S.n2)),
    field("Email (for your private link)", "email", "email", S.email),
    field("Wedding date", "date", "date", S.date),
    h("div", { class: "f" }, h("label", { for: "tz" }, "Where your wedding is"), select,
      h("p", { class: "note" }, "We’ve picked the time zone you’re in. Change it if you’re marrying abroad, so your wedding day starts at local midnight there."),
      h("label", { class: "chk" }, tbd, "Our date isn’t confirmed yet — use a placeholder for now. You can update it any time from your private manage link.")),
    h("div", { class: "f" }, h("label", null, "Couple photo"),
      h("div", { class: "photo" }, circ, h("div", null, h("button", { class: "btn o", onclick: () => file.click() }, ic("upload", 14), "Upload photo"), file,
        h("p", { class: "note" }, "Please share your couple photo with us.")))),
    n.row);
  const panel = h("div", { class: "panel s" }, head("Tell us about your day", "The details that make this yours."), inner);
  const val = (id) => panel.querySelector("#" + id);
  const validate = () => {
    Object.assign(S, { n1: val("n1").value.trim(), n2: val("n2").value.trim(), email: val("email").value.trim(), date: val("date").value, tz: val("tz").value, tbd: val("tbd").checked });
    val("date").disabled = S.tbd;
    n.n.disabled = !(S.n1 && S.n2 && /.+@.+\..+/.test(S.email) && (S.tbd || S.date));
    save();
  };
  panel.addEventListener("input", validate);
  panel.addEventListener("change", validate);
  validate();
  return panel;
}

/* ---------- Step 2: guests ---------- */

function stepGuests() {
  const list = h("div", { class: "list" });
  const status = h("p", { class: "note", "aria-live": "polite" });
  const redraw = () => {
    list.replaceChildren(...(S.guests.length ? S.guests.map((g, i) => h("div", { class: "li" }, `${g.first} ${g.last} · ${g.table || "unseated"}`,
      h("button", { "aria-label": `Remove ${g.first} ${g.last}`, onclick: () => { S.guests.splice(i, 1); save(); redraw(); } }, "Remove"))) : []));
  };
  const load = (f) => {
    const r = new FileReader();
    r.onload = () => {
      const added = parseCsv(r.result);
      S.guests = S.guests.concat(added);
      status.textContent = added.length ? `Added ${added.length} guest${added.length === 1 ? "" : "s"} from ${f.name}.` : "No guests found in that file. Each row needs: first name, last name, table.";
      save(); redraw();
    };
    r.readAsText(f);
  };
  const csv = h("input", { type: "file", accept: ".csv,.txt", hidden: "" });
  csv.onchange = () => csv.files[0] && load(csv.files[0]);
  const drop = h("div", { class: "drop", tabindex: "0", role: "button", onclick: () => csv.click() },
    h("div", { class: "ico" }, ic("upload", 18)), "Drag & drop your CSV here, or click to choose", h("small", null, "Max 2MB · unlimited guests"));
  drop.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); csv.click(); } };
  drop.ondragover = (e) => (e.preventDefault(), drop.classList.add("over"));
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); e.dataTransfer.files[0] && load(e.dataTransfer.files[0]); };

  const inputs = ["First name", "Last name", "Table", "Area in venue (optional)"].map((p) => h("input", { type: "text", placeholder: p, "aria-label": p }));
  const add = h("button", { class: "btn", onclick: () => {
    const [first, last, table, area] = inputs.map((i) => i.value.trim());
    if (!first) return;
    S.guests.push({ first, last, table, area });
    inputs.forEach((i) => (i.value = ""));
    inputs[0].focus(); save(); redraw();
  } }, "Add guest");

  const chairs = h("input", { id: "chairs", type: "number", min: "1", value: S.chairs, oninput: (e) => { S.chairs = Math.max(1, +e.target.value || 10); save(); } });
  const diff = h("input", { id: "diff", type: "text", placeholder: "e.g. 3: 6, Top table: 8", value: S.diff, oninput: (e) => { S.diff = e.target.value; save(); } });
  const toggle = h("button", { class: "tg", role: "switch", "aria-label": "Seat some guests on arrival", "aria-pressed": S.arrive, onclick: () => {
    S.arrive = !S.arrive; toggle.setAttribute("aria-pressed", S.arrive); save();
  } });
  const sample = h("pre", { class: "note", hidden: "" }, "First name,Last name,Table,Area in venue\nJamie,Rivers,5,Left of dance floor\nPriya,Nair,2,");
  const help = h("a", { href: "#", style: "color:inherit", onclick: (e) => { e.preventDefault(); sample.hidden = !sample.hidden; } }, "Need help? Read the spreadsheet & CSV guide");
  redraw();

  const panel = h("div", { class: "panel s" },
    h("h2", null, "Upload your guest list"),
    h("p", { class: "sub", style: "max-width:36rem;margin:.4rem auto 1.2rem" }, "A CSV is simply a spreadsheet — create it in Excel, Google Sheets or Apple Numbers, then save or export as a .csv file. Include a column for each guest’s First name, Last name and Table. You can also add an optional Area in venue column (e.g. “Left of dance floor”).", h("br"), h("br"), help, sample),
    h("div", { class: "tip" }, ic("bulb", 16), h("div", null, h("b", null, "Gentle reminder: "), "Double-check your guest list against your RSVP list before publishing — that way every guest who arrives will find their name and table without any awkward moments.")),
    drop, csv, status,
    h("div", { class: "box" }, h("h3", null, "Or add a guest manually"), h("div", { class: "row4" }, inputs), h("div", { style: "text-align:right;margin-top:.6rem" }, add), list),
    h("div", { class: "box" }, h("h3", null, "How many chairs at each table?"), h("p", { class: "note" }, "Everyone you’ve given a table keeps that table. Telling us the number of chairs simply lets us work out where there’s still room."),
      h("div", { class: "g2" }, h("div", { class: "f" }, h("label", { for: "chairs" }, "Chairs per table"), chairs),
        h("div", { class: "f" }, h("label", { for: "diff" }, "Tables with a different number (optional)"), diff, h("p", { class: "note" }, "Write the table, then the number of chairs.")))),
    h("div", { class: "box sw-row" }, h("div", null, h("h3", null, "Seat some guests on arrival (optional)"), h("p", { class: "note" }, "Leave the table blank for any guest you haven’t seated. When they scan the QR code and type their name on the day, they’ll be given the next table that still has a free chair.")), toggle),
    nav(() => go(0), () => go(2)).row);
  return panel;
}

/* ---------- Step 3: theme ---------- */

function stepTheme() {
  const phone = h("div", { class: "phone" });
  const grid = h("div", { class: "pal" }), seg = h("div", { class: "seg" });
  const refresh = () => {
    grid.querySelectorAll(".sw").forEach((b, i) => b.setAttribute("aria-pressed", i === S.pal));
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", (b.dataset.d === "1") === S.dark));
    phone.replaceChildren(renderSite(true));
  };
  [["Light", "sun", 0], ["Dark", "moon", 1]].forEach(([t, icon, d]) => seg.append(h("button", { "data-d": d, onclick: () => { S.dark = !!d; save(); refresh(); } }, ic(icon, 13), t)));
  PALETTES.forEach(([name, color], i) => {
    const sq = h("em"); sq.style.borderColor = color;
    const bar = h("i"); bar.style.background = color;
    grid.append(h("button", { class: "sw", onclick: () => { S.pal = i; save(); refresh(); } }, h("div", { class: "bars" }, bar, sq), name));
  });
  const n = nav(() => go(1), () => go(3), "Preview");
  const panel = h("div", { class: "panel s wide" }, h("div", { class: "theme" },
    h("div", null,
      h("div", { style: "display:flex;justify-content:space-between;gap:1rem" }, h("div", null, h("h2", { style: "text-align:left" }, "Pick a colour theme"), h("p", { class: "sub", style: "text-align:left;margin:.3rem 0" }, "Tap a palette to preview it live →")), seg),
      h("p", { class: "note" }, "Light keeps things bright and airy — perfect for daytime weddings. Dark is soft and moody — a lovely fit for evening receptions. You can switch this anytime from your dashboard."),
      grid,
      h("p", { class: "note", style: "margin-top:1rem" }, "Can’t find your colour? Tell us your palette and we’ll build it — usually within 24h, no extra charge."), n.row),
    h("div", null, h("p", { class: "cap" }, "Live preview · what your guests see"), phone, h("p", { class: "cap", style: "margin-top:.7rem" }, "Real guest list · real theme · exactly what they’ll see"))));
  refresh();
  return panel;
}

/* ---------- Step 4: publish ---------- */

function stepPublish() {
  const over = S.guests.length > FREE_LIMIT;
  const n = nav(() => go(2), publish, S.token ? "Save changes" : "Publish for free");
  n.n.lastChild.remove(); // no arrow on this button
  n.n.disabled = over;
  const perks = ["Private URL for " + S.email, "Downloadable QR code for your tables & entry", "Edit guests & theme anytime before your wedding date", "Free for small weddings"];
  return h("div", { class: "panel s" }, h("h2", null, "Confirm & publish"), h("p", { class: "sub" }, `Up to ${FREE_LIMIT} guests is completely free.`),
    h("div", { class: "sum" }, h("small", null, "Your seat finder"), h("div", { class: "n" }, S.n1, " ", h("i", null, "&"), " ", S.n2), h("hr"),
      h("div", { class: "m" }, `${S.guests.length} guests · ${S.tbd ? "Date TBC" : S.date} · ${pal()[0]} · ${S.dark ? "Dark" : "Light"}`),
      h("span", { class: "badge" }, `Free · ${FREE_LIMIT} guests or fewer`)),
    h("ul", { class: "ok" }, perks.map((p) => h("li", null, h("span", null, ic("check", 10)), p))),
    over ? h("p", { class: "legal" }, `The free plan is limited to ${FREE_LIMIT} guests. Remove some guests to publish.`) : null,
    h("p", { class: "legal" }, "By publishing, you accept our ", h("a", { href: "#" }, "Terms & Conditions"), " and ", h("a", { href: "#" }, "Privacy Policy"), "."),
    n.row);
}

/* ---------- Publishing (saves to Supabase) ---------- */

async function publish(e) {
  const button = e.currentTarget;
  if (!sb) return alert("Add your Supabase URL and key to config.js first (see README).");
  button.disabled = true;
  const p = { n1: S.n1, n2: S.n2, email: S.email, date: S.date, tbd: S.tbd, tz: S.tz, photo: S.photo, chairs: S.chairs, diff: S.diff, arrive: S.arrive, pal: S.pal, dark: S.dark };
  const g = S.guests.map(({ first, last, table, area }) => ({ first, last, table, area }));
  let emailed = false;
  try {
    if (S.slug && S.token) { // editing an existing seat finder
      const { data, error } = await sb.rpc("save_wedding", { p_slug: S.slug, p_token: S.token, p, g });
      if (error || !data) throw error || new Error("That management link is no longer valid.");
    } else {
      const { data, error } = await sb.rpc("create_wedding", { p, g });
      if (error) throw error;
      S.slug = data.slug;
      S.token = data.token;
      const mail = await sb.functions.invoke("send-links", { body: { slug: S.slug, token: S.token } });
      emailed = !mail.error && !!mail.data?.sent;
    }
    save();
    renderDone(emailed);
  } catch (err) {
    button.disabled = false;
    alert("Sorry, we couldn’t publish: " + (err.message || err));
  }
}

/* ---------- "Your seat finder is ready" ---------- */

function renderDone(emailed) {
  document.body.className = "done";
  const base = location.origin + location.pathname;
  const url = base + "#/" + S.slug;
  const manageUrl = base + "#/manage/" + S.slug + "/" + S.token;
  const copy1 = h("button", { class: "b2" }, ic("copy", 14), " Copy");
  const copy2 = h("button", { class: "b2" }, ic("copy", 14), " Copy");
  copy1.onclick = () => copyText(url, copy1);
  copy2.onclick = () => copyText(manageUrl, copy2);
  const qr = h("div", { id: "qr" });
  const dl = h("button", { class: "b1", onclick: () => {
    const canvas = qr.querySelector("canvas");
    if (canvas) h("a", { href: canvas.toDataURL("image/png"), download: `${S.slug}-qr.png` }).click();
  } }, ic("download", 14), " Download QR code");

  app.replaceChildren(h("div", { class: "card" },
    h("div", { class: "ck" }, ic("check", 22)),
    h("div", { class: "e" }, "Free seat finder published"),
    h("h2", null, "Your seat finder is ready"),
    h("p", null, emailed ? ["We’ve emailed everything below to ", h("span", null, S.email), "."] : "Save the links below somewhere safe. The management link is the only way back in to edit your guests."),
    h("span", { class: "lb" }, "Your private site"),
    h("div", { class: "lk" }, h("div", null, ic("link", 14), h("a", { href: "#/" + S.slug }, url)), copy1),
    h("div", { class: "qrr" }, qr, h("div", { class: "r" }, h("h3", null, "Your QR code"),
      h("p", null, "Print it on your seating cards, entry signs or wedding menus — guests scan and find their seat instantly."),
      h("div", null, dl, h("button", { class: "b1", onclick: () => go(0) }, "Edit my seat finder"), h("button", { class: "b2", onclick: () => (location.hash = "#/" + S.slug) }, "Preview my site")))),
    h("span", { class: "lb" }, "Manage your guests"),
    h("div", { class: "lk" }, h("div", null, ic("link", 14), h("a", { href: manageUrl }, "Open my private dashboard")), copy2),
    h("p", { class: "fine", style: "text-align:left;margin:.5rem 0 0" }, "This is your private link to edit guests, theme and photo before your wedding day. Keep it safe — anyone with it can make changes."),
    h("div", { class: "mb" }, ic("mail", 18), h("div", null, h("b", null, "Keep this link safe"), "Save your private site link, QR code and management link somewhere safe (or bookmark this page) — it’s the easiest way to come back and edit your seating plan later.")),
    h("p", { class: "fine" }, ic("shield", 13), "Your guest list stays private on your own URL."),
    h("button", { class: "hm", onclick: () => { step = 0; location.hash = ""; draw(); } }, "Back to home")));
  window.scrollTo(0, 0);
  try { new QRCode(qr, { text: url, width: 130, height: 130, correctLevel: QRCode.CorrectLevel.L }); } catch (e) { qr.textContent = "QR unavailable"; }
}

/* ---------- Routing ---------- */
//   #/                        the studio (set up a new seat finder)
//   #/manage/<slug>/<token>   the studio, loaded with an existing seat finder (the couple's private link)
//   #/<slug>                  the guest page

function draw() {
  shell([stepCouple, stepGuests, stepTheme, stepPublish][step]());
}

function reset() {
  if (!confirm("Start over? This clears the form on this device. Seat finders you already published stay online.")) return;
  try { localStorage.removeItem(KEY); } catch (e) {}
  location.hash = "";
  location.reload();
}

function notice(title, text) {
  document.body.className = "done";
  app.replaceChildren(h("div", { class: "card" }, h("h2", null, title), h("p", null, text)));
}

async function loadManage(slug, token) {
  document.body.className = "studio";
  app.replaceChildren(h("div", { class: "wrap" }, h("p", { class: "sub", style: "margin-top:4rem" }, "Loading your seat finder…")));
  const { data, error } = await sb.rpc("get_manage", { p_slug: slug, p_token: token });
  if (error || !data) return notice("This link isn’t valid", "Check that you copied the whole management link from your email.");
  const w = data.wedding;
  Object.assign(S, { n1: w.n1, n2: w.n2, email: w.email, date: w.date || "", tbd: w.tbd, tz: w.tz || S.tz, photo: w.photo || "",
    chairs: w.chairs, diff: w.diff, arrive: w.arrive, pal: w.pal, dark: w.dark, guests: data.guests, slug, token });
  save();
  step = 0;
  draw();
}

async function loadGuestSite(slug) {
  document.body.className = "guest";
  app.replaceChildren(h("div", { class: "site" }, h("p", { class: "wel" }, "Loading…")));
  const { data } = await sb.rpc("get_site", { p_slug: slug });
  if (!data) return notice("We couldn’t find this seat finder", "Please check the link or QR code, or ask a member of staff.");
  V = { ...data, slug, date: data.date || "" };
  document.title = `Find your seat · ${V.n1} & ${V.n2}`;
  app.replaceChildren(renderSite(false, V));
}

async function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!parts.length) return draw();
  if (!sb) return notice("Almost there", "Add your Supabase URL and anon key to config.js, then reload.");
  if (parts[0] === "manage" && parts[1] && parts[2]) return loadManage(parts[1], parts[2]);
  return loadGuestSite(parts[0]);
}

addEventListener("hashchange", route);
route();
