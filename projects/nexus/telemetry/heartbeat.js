/* Stage567: renders heartbeat.json (fetched from beside this page) into index.html.
   The page holds no figures; every number below comes from the JSON, and every age is measured
   against the visitor's own clock (Date.now), never the JSON's. Exported for the node tests. */
(function () {
  var DAY = 86400000, HOUR = 3600000;
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var STATUS_TEXT = {ok: "processed on time", caught_up: "processed late, then caught up",
                     red: "not processed", grey: "not yet due"};
  var KIND_TEXT = {corroboration: "CORROBORATION", rereview_raised: "RE-REVIEW", rereview_closed: "RE-REVIEW",
                   proposal: "PROPOSAL"};

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text, title) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (title) n.title = title;
    return n;
  }
  function set(id, text) { $(id).textContent = text == null ? "" : text; }
  // Timestamps are published without a zone; read them as UTC so every visitor sees the same age.
  function ms(ts) { return ts ? Date.parse(/Z|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + "Z") : NaN; }
  function dayLabel(iso) {
    var d = new Date(iso + "T00:00:00Z");
    return WEEKDAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()];
  }
  function clock(ts) {
    var d = new Date(ms(ts));
    return dayLabel(d.toISOString().slice(0, 10)) + " " + d.toISOString().slice(11, 16);
  }
  function num(v) { return v == null ? "—" : Number(v).toLocaleString("en-US"); }

  // Elapsed time with Saturday and Sunday taken out: a Friday run is not "old" on Monday morning.
  function businessMs(from, to) {
    var total = Math.max(0, to - from), t = from;
    while (t < to) {
      var d = new Date(t), next = Math.min(to, Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
      var wd = d.getUTCDay();
      if (wd === 0 || wd === 6) total -= next - t;
      t = next;
    }
    return total;
  }
  function ageText(elapsed) {
    if (elapsed < HOUR) return Math.max(1, Math.round(elapsed / 60000)) + " min ago";
    if (elapsed < DAY) return Math.round(elapsed / HOUR) + " h ago";
    return Math.round(elapsed / DAY) + " d ago";
  }
  // `limit` is in business ms for Running and wall ms for the weekly panes.
  function age(id, ts, now, limit, business, what) {
    var node = $(id), t = ms(ts);
    if (isNaN(t)) { node.textContent = "no data yet"; node.className = "age stale"; return; }
    var old = business ? businessMs(t, now) : now - t;
    node.textContent = ageText(now - t);
    node.className = "age" + (old > limit ? " stale" : "");
    node.title = what + " " + clock(ts) + " UTC. " + (old > limit ? "Older than expected for its schedule." : "Within its schedule.");
  }

  function bars(id, cells, key, noun, today) {
    var host = $(id); host.textContent = "";
    var max = 0;                       // the opening load would flatten every ordinary day, so it sets no scale
    cells.forEach(function (c) { if (!c.opening_load && c[key] != null && c[key] > max) max = c[key]; });
    if (max < 1) max = 1;
    cells.forEach(function (c) {
      var b = el("i", "bar", null);
      var v = c[key], when = dayLabel(c.day);
      if (c.status === "red") { b.className = "bar red"; b.title = when + ": not processed"; }
      else if (v == null) { b.className = "bar nodata"; b.title = when + ": no figure"; }
      else if (c.opening_load) {
        b.className = "bar opening"; b.style.height = "100%";
        b.title = when + ": " + num(v) + " " + noun + " (opening load, off the scale)";
      } else {
        b.style.height = Math.max(4, Math.round(v / max * 100)) + "%";
        b.title = when + ": " + num(v) + " " + noun;
      }
      host.appendChild(b);
    });
  }

  function pulse(cells, note) {
    var host = $("pulse"); host.textContent = "";
    cells.forEach(function (c) {
      host.appendChild(el("i", "cell " + c.status, null,
        dayLabel(c.day) + ": " + STATUS_TEXT[c.status] + (c.reason ? " (" + c.reason + ")" : "")));
    });
    set("why", !note ? "" : dayLabel(note.day) + " \u00b7 " + note.reason + " \u00b7 " +
      (note.recovered_on ? "caught up " + dayLabel(note.recovered_on) : "not yet caught up"));
  }

  function learning(events) {
    var host = $("learning-list"); host.textContent = "";
    if (!events.length) { host.appendChild(el("div", "s", "Nothing new yet.")); return; }
    events.slice(0, 6).forEach(function (e) {
      var row = el("div", "ev");
      row.appendChild(el("span", "tg", (e.at ? dayLabel(e.at.slice(0, 10)).toUpperCase() + " · " : "") + KIND_TEXT[e.kind]));
      if (e.external) row.appendChild(el("div", "ext", e.external));
      row.appendChild(el("div", "int", "→ " + e.internal));
      host.appendChild(row);
    });
  }

  function mins(sec) { var m = Math.floor(sec / 60); return m + " m " + Math.round(sec - m * 60) + " s"; }

  function render(d, now) {
    $("heartbeat").setAttribute("data-state", "ok");
    var cells = d.days || [], run = d.running || {}, st = d.stable || {}, ln = d.learning || {};
    var today = cells.filter(function (c) { return c.day === (d.today || {}).day; })[0] || {};
    pulse(cells, d.pulse_note);
    bars("bars-alerts", cells, "alerts", "alerts raised");
    bars("bars-decided", cells, "decided", "cases decided");
    set("alerts-today", "today " + num(today.alerts));
    set("decided-today", "today " + num(today.decided));
    $("alerts-today").title = "Alerts raised for the latest processed day.";
    $("decided-today").title = "Cases decided on the latest processed day.";
    set("running-foot", num(run.clean) + " / " + num(run.of) + " days clean" + (run.avg_seconds != null ? " · avg " + mins(run.avg_seconds) : ""));
    set("intake", (d.today || {}).intake_transactions != null ? num(d.today.intake_transactions) + " transactions in" : "");
    var unsafe = (d.archive || {}).not_safe || 0;
    set("archive-note", unsafe > 0 ? unsafe + " day(s) not yet safely archived" : "");
    set("stable-verdict", st.verdict || "—");
    set("stable-line", st.verdict === "PASS" ? "Weekly drift: same answers as last week's run, input by input."
      : st.verdict ? "Weekly drift check: " + (st.reason || "see verdict") : "No drift check has run yet.");
    learning(ln.events || []);
    age("age-running", run.as_of, now, DAY * 1.1, true, "Last daily run finished");
    age("age-stable", st.as_of, now, 8 * DAY, false, "Last drift check finished");
    age("age-learning", ln.as_of, now, 8 * DAY, false, "Newest learning event");
    age("age-published", d.published_at, now, DAY * 1.1, true, "Published");
    var p = d.provenance || {};
    set("prov-commit", p.fc10_commit || "—");
    set("prov-run", p.run_id || "—");
    set("prov-authority", p.authority === "LOCKED" ? "LOCKED" : p.authority === "NOT_MEASURED" ? "NOT MEASURED" : "UNVERIFIED");
    $("prov-authority").className = p.authority === "LOCKED" ? "" : "amber";
    set("prov-published", d.published_at ? clock(d.published_at) + " UTC" : "—");
  }

  function unavailable() {
    $("heartbeat").setAttribute("data-state", "unavailable");
    set("unavailable", "Heartbeat unavailable");
    ["pulse", "bars-alerts", "bars-decided", "learning-list"].forEach(function (i) { set(i, ""); });
    ["why", "alerts-today", "decided-today", "running-foot", "intake", "archive-note", "stable-verdict",
     "stable-line", "age-running", "age-stable", "age-learning", "age-published"].forEach(function (i) { set(i, ""); });
  }

  function start() {
    return fetch("heartbeat.json", {cache: "no-store"})
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (d) { render(d, Date.now()); })
      .catch(unavailable);
  }

  if (typeof module !== "undefined" && module.exports) module.exports = {render: render, start: start};
  else start();
})();
