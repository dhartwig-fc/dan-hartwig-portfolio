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
    var node = typeof id === "string" ? $(id) : id, t = ms(ts);
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

  var LEVEL_CLASS = {Normal: "normal", Elevated: "elevated", High: "high", Severe: "severe"};
  var NO_REASON = "no reason recorded";

  function figure(v) { return v == null ? "\u2014" : num(v); }
  function show(id, on) { $(id).hidden = !on; }
  function mins(sec) { var m = Math.floor(sec / 60); return m + " m " + Math.round(sec - m * 60) + " s"; }

  function tile(id, label, big, small, warn, bigCls, asOf, limit, business, what, now) {
    var host = $(id); host.textContent = "";
    host.className = "tile" + (warn ? " warn" : "");
    host.appendChild(el("div", "lbl", label));
    host.appendChild(el("div", "big" + (bigCls ? " " + bigCls : ""), big));
    host.appendChild(el("div", "s", small));
    if (asOf !== undefined) { var a = el("span", "age"); host.appendChild(a); age(a, asOf, now, limit, business, what); }
  }
  function runRow(r) {
    var tr = el("tr");
    [r.run, r.outcome, (r.days || []).join(", ") || "\u2014", mins(r.seconds || 0), r.slowest_step || "\u2014",
     r.outcome === "OK" ? "" : r.reason || NO_REASON].forEach(function (t) { tr.appendChild(el("td", null, t)); });
    return tr;
  }

  function renderV2(d, now) {
    var st = d.status || {}, rk = d.risk || {}, td = d.today || {}, eng = d.engineering || {};
    show("v2-head", true); show("v2-top", true); show("v2-engineering", true); show("v1-panes", false);
    set("status-line", (st.running ? "Running" : "Not running") + " \u00b7 on time " + num(st.on_time) + " of " + num(st.of));
    set("honesty", st.honesty);
    set("reporting-label", st.reporting_label);
    // A null level is "still learning": the reason carries the message and no level word is shown.
    set("risk-level", rk.level || "");
    $("risk-level").className = "lvl " + (LEVEL_CLASS[rk.level] || "");
    set("risk-reason", rk.reason);
    set("risk-new", figure(td.new_cases)); set("risk-critical", figure(td.critical)); set("risk-sars", figure(td.sars));
    var c = d.case_of_day;
    show("case-card", !!c); show("case-none", !c);
    if (c) {
      set("case-label", "Planted scheme \u00b7 " + c.band); set("case-title", c.title);
      set("case-story", c.story); set("case-facts", c.facts); set("case-none", "");
    } else set("case-none", d.no_scheme_text);
    var also = d.also_caught || [], host = $("also-list"); host.textContent = "";
    show("also-section", also.length > 0);
    also.forEach(function (a) {
      var row = el("div", "a"); row.appendChild(el("b", null, a.title)); row.appendChild(el("span", null, a.line));
      host.appendChild(row);
    });

    var t = eng.tiles || {}, r = t.runs || {}, f = t.feeds || {}, dr = t.drift || {}, ar = t.archive || {};
    var warn = !!dr.verdict && dr.verdict !== "PASS" && dr.verdict !== "BASELINE";
    tile("tile-runs", "Daily run", num(r.clean) + " / " + num(r.of) + " clean", r.avg_seconds != null ? "avg " + mins(r.avg_seconds) : "", false, "",
      (d.running || {}).as_of, DAY * 1.1, true, "Last daily run finished", now);
    tile("tile-feeds", "Data feeds", num(f.loaded) + " / " + num(f.of) + " loaded", f.day_status ? "day status " + f.day_status : "");
    tile("tile-drift", "Weekly drift", dr.verdict || "\u2014", dr.reason || "", warn, dr.verdict === "PASS" ? "ok" : warn ? "bad" : "",
      (d.stable || {}).as_of, 8 * DAY, false, "Last drift check finished", now);
    tile("tile-archive", "Archive", ar.state || "\u2014", ar.not_safe > 0 ? ar.not_safe + " day(s) not yet safely archived" : "", ar.not_safe > 0);

    var pins = eng.pinned || [], pl = $("pinned-list"); pl.textContent = "";
    show("pinned-wrap", pins.length > 0);
    pins.forEach(function (p) {
      var row = el("div", "pin");
      row.appendChild(el("b", null, p.run + " \u00b7 " + p.outcome + " \u00b7 " + (p.reason || NO_REASON)));
      row.appendChild(el("div", "s", [(p.days || []).join(", "), p.recovered_by ? "recovered by " + p.recovered_by : "not yet recovered"].filter(Boolean).join(" \u00b7 ")));
      pl.appendChild(row);
    });
    var hb = $("history-body"); hb.textContent = "";
    (eng.history || []).forEach(function (h) { hb.appendChild(runRow(h)); });
    set("phases", (eng.phases || []).map(function (p) { return p.name + " " + (p.status === "SUCCESS" ? "\u2713" : p.status); }).join(" \u00b7 ") || "\u2014");
    var q = eng.queue || {}, qh = $("queue"); qh.textContent = "";
    [["Open cases", q.open], ["Unassigned", q.unassigned], ["SLA breaches today", q.breaches_today],
     ["QA findings open", q.qa_open], ["Sanctions lane open", q.sanctions_open]].forEach(function (p) {
      var row = el("div", "fig"); row.appendChild(el("span", null, p[0])); row.appendChild(el("b", null, figure(p[1]))); qh.appendChild(row);
    });
    var trend = (q.backlog_trend || []).filter(function (x) { return x != null; });
    if (trend.length) qh.appendChild(el("div", "s", "Open backlog, last " + trend.length + " days: " + trend.map(num).join(" \u2192 ")));
  }

  // ---- Telemetry v2 activity dashboard: hand-built SVG, text only ever via textContent ----
  var NS = "http://www.w3.org/2000/svg", BANDS = ["Low", "Medium", "High", "Critical"];
  var BAND_COLOUR = {Low: "#3ecb8f", Medium: "#e0a63c", High: "#f08c3c", Critical: "#e8705f"};
  var C = {line: "#1d2a44", muted: "#93a6c0", text: "#f8fafc", panel: "#0b1424", accent: "#4fd0e0", red: "#e8705f", bg: "#050b14"};
  function r1(v) { v = Number(v); return isFinite(v) ? Math.round(v * 10) / 10 : 0; }
  function sv(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, typeof attrs[k] === "number" ? r1(attrs[k]) : attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function svgRoot(w, h, extra) {
    var a = {viewBox: "0 0 " + r1(w) + " " + r1(h), role: "img"};
    Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k]; });
    return sv("svg", a);
  }
  function put(id, node) { var h = $(id); h.textContent = ""; h.appendChild(node); }
  function placeholder(id, text) { var h = $(id); h.textContent = ""; h.appendChild(el("div", "s", text)); }
  function niceMax(m) {
    if (!(m > 0)) return 10;
    var mag = Math.pow(10, Math.floor(Math.log(m) / Math.LN10)), k = [1, 2, 5, 10];
    for (var i = 0; i < k.length; i++) if (m <= k[i] * mag) return k[i] * mag;
    return 10 * mag;
  }
  function total(bb) { return BANDS.reduce(function (t, b) { return t + ((bb || {})[b] || 0); }, 0); }
  function dom(iso) { return iso ? String(parseInt(iso.slice(8), 10)) : ""; }
  function slotTitle(g, text) { g.appendChild(sv("title", {}, text)); }

  function flowChart(flow) {
    var w = 430, h = 210, left = 34, top = 18, base = h - 28, plot = base - top, step = (w - left - 8) / 20, bw = step - 4;
    var max = 0;                         // the opening slot sets no scale: it would flatten every ordinary day
    flow.forEach(function (s) {
      if (s.state === "ok") max = Math.max(max, total(s.by_band));
      if (s.sars != null) max = Math.max(max, s.sars);
    });
    var top_ = niceMax(max), k = plot / top_;
    var svg = svgRoot(w, h, {"data-plot-height": plot, "aria-label": "New cases per business day by severity, with SAR referrals"});
    var defs = sv("defs"), pat = sv("pattern", {id: "hatch-flow", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)"});
    pat.appendChild(sv("rect", {width: 6, height: 6, fill: C.panel}));
    pat.appendChild(sv("line", {x1: 0, y1: 0, x2: 0, y2: 6, stroke: C.red, "stroke-opacity": ".5", "stroke-width": 3}));
    defs.appendChild(pat); svg.appendChild(defs);
    (top_ % 2 === 0 ? [0, top_ / 2, top_] : [0, top_]).forEach(function (t) {
      var y = base - t * k;
      svg.appendChild(sv("line", {x1: left, x2: w - 4, y1: y, y2: y, stroke: C.line}));
      svg.appendChild(sv("text", {x: left - 5, y: y + 3, fill: C.muted, "font-size": 9, "text-anchor": "end"}, num(t)));
    });
    flow.forEach(function (s, j) {
      var x = left + 2 + j * step, mid = x + bw / 2, g = sv("g");
      if (s.state === "empty") {
        g.appendChild(sv("rect", {"class": "empty", x: x, y: base - 22, width: bw, height: 22, rx: 2, fill: "none", stroke: C.line, "stroke-dasharray": "2 2"}));
      } else {
        var when = dayLabel(s.day);
        if (s.state === "opening") {
          var t = total(s.by_band);
          g.appendChild(sv("rect", {"class": "opening", x: x, y: top, width: bw, height: plot, fill: "url(#hatch-flow)", stroke: C.line}));
          g.appendChild(sv("text", {x: x, y: top - 5, fill: C.text, "font-size": 8.5, "text-anchor": j > 10 ? "end" : "start"}, num(t) + " opening load"));
          slotTitle(g, when + ": " + num(t) + " cases in the opening load (off the scale)");
        } else if (s.state === "ok") {
          var y = base, parts = [];
          BANDS.forEach(function (b) {
            var v = (s.by_band || {})[b] || 0, hh = Math.min(v * k, y - top);
            if (v > 0) {
              g.appendChild(sv("rect", {"class": "bar", x: x, y: y - hh, width: bw, height: hh, fill: BAND_COLOUR[b], "fill-opacity": ".88"}));
              y -= hh; parts.push(num(v) + " " + b);
            }
          });
          slotTitle(g, when + ": " + (parts.join(", ") || "no new cases"));
        } else {
          var word = s.state === "no_run" ? "no run" : "no figure";
          g.appendChild(sv("text", {x: mid + 3, y: base - 4, fill: C.muted, "font-size": 7.5, transform: "rotate(-90 " + r1(mid + 3) + " " + r1(base - 4) + ")"}, word));
          slotTitle(g, when + ": " + (s.state === "no_run" ? "the daily run did not process this day" : "no figure recorded for this day"));
        }
        if (s.sars != null)
          g.appendChild(sv("circle", {"class": "sar", cx: mid, cy: base - Math.min(s.sars, top_) * k, r: 3.5, fill: C.accent, stroke: C.bg}));
        g.appendChild(sv("text", {x: mid, y: h - 14, fill: C.muted, "font-size": 8.5, "text-anchor": "middle"}, dom(s.day)));
      }
      svg.appendChild(g);
    });
    put("chart-flow", svg);
  }

  function backlogChart(rows) {
    var w = 430, h = 160, left = 40, top = 18, base = h - 22, step = (w - left - 8) / 20;
    var vals = rows.filter(function (r) { return r.unassigned != null; }).map(function (r) { return r.unassigned; });
    if (!vals.length) { placeholder("chart-backlog", "No backlog figures yet."); return; }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi === lo) { lo -= 1; hi += 1; }
    var pad = (hi - lo) * 0.15; lo = Math.max(0, lo - pad); hi += pad;
    var yOf = function (v) { return base - (v - lo) / (hi - lo) * (base - top); };
    var ticks = [], seen = {};      // whole numbers only, each label once
    [lo, (lo + hi) / 2, hi].forEach(function (t) { t = Math.round(t); if (!seen[t]) { seen[t] = 1; ticks.push(t); } });
    var svg = svgRoot(w, h, {"aria-label": "Unassigned open cases per business day, with new SLA breaches"});
    ticks.forEach(function (t) {
      svg.appendChild(sv("line", {x1: left, x2: w - 4, y1: yOf(t), y2: yOf(t), stroke: C.line}));
      svg.appendChild(sv("text", {x: left - 5, y: yOf(t) + 3, fill: C.muted, "font-size": 9, "text-anchor": "end"}, num(t)));
    });
    var run = [], flush = function () {
      if (run.length > 1) svg.appendChild(sv("polyline", {points: run.map(function (p) { return r1(p[0]) + "," + r1(p[1]); }).join(" "),
        fill: "none", stroke: "#e0a63c", "stroke-width": 2}));
      run = [];
    };
    rows.forEach(function (r, j) {
      var x = left + 2 + j * step + (step - 4) / 2;
      if (r.day == null) { flush(); return; }
      svg.appendChild(sv("text", {x: x, y: h - 8, fill: C.muted, "font-size": 8.5, "text-anchor": "middle"}, dom(r.day)));
      if (r.unassigned == null) { flush(); return; }
      var y = yOf(r.unassigned); run.push([x, y]);
      var g = sv("g");
      g.appendChild(sv("circle", {"class": "pt", cx: x, cy: y, r: 3, fill: "#e0a63c"}));
      slotTitle(g, dayLabel(r.day) + ": " + num(r.unassigned) + " unassigned" + (r.new_breaches > 0 ? ", " + num(r.new_breaches) + " new SLA breaches" : ""));
      if (r.new_breaches > 0) {
        var label = num(r.new_breaches), tw = 6 + label.length * 5.2;
        g.appendChild(sv("rect", {"class": "breach", x: Math.min(Math.max(x - tw / 2, left), w - tw - 2), y: 2, width: tw, height: 13, rx: 3, fill: C.red}));
        g.appendChild(sv("text", {x: Math.min(Math.max(x, left + tw / 2), w - tw / 2 - 2), y: 11.5, fill: C.bg, "font-size": 8.5, "font-weight": 800, "text-anchor": "middle"}, label));
      }
      svg.appendChild(g);
    });
    flush();
    put("chart-backlog", svg);
  }

  function riskChart(rp) {
    if (!rp || !(rp.families || []).length) { placeholder("chart-risk", "No alerts profiled for this day."); return; }
    var bands = rp.bands && rp.bands.length ? rp.bands : BANDS, w = 430, lw = 150, cw = 64, ch = 17, gap = 2, top = 22, y = top, max = 1, rows = 0;
    rp.families.forEach(function (f) { (f.rows || []).forEach(function (r) { rows++; (r.counts || []).forEach(function (c) { if (c > max) max = c; }); }); });
    var h = top + rows * (ch + gap) + rp.families.length * 20 + 4;
    var svg = svgRoot(w, h, {"aria-label": "Alerts by typology and severity"});
    bands.forEach(function (b, k) {
      svg.appendChild(sv("text", {x: lw + k * cw + (cw - gap) / 2, y: 12, fill: BAND_COLOUR[b] || C.muted, "font-size": 9.5, "font-weight": 800, "text-anchor": "middle"}, String(b).toUpperCase()));
    });
    rp.families.forEach(function (f) {
      svg.appendChild(sv("text", {x: 0, y: y + 8, fill: C.muted, "font-size": 9.5, "font-weight": 700}, f.name));
      y += 12;
      (f.rows || []).forEach(function (r, n) {
        svg.appendChild(sv("text", {"class": "code", x: lw - 8, y: y + 12, fill: C.text, "font-size": 10, "text-anchor": "end", "font-family": "ui-monospace,Menlo,monospace"}, r.typology));
        bands.forEach(function (b, k) {
          var v = (r.counts || [])[k] || 0, x = lw + k * cw, g = sv("g");
          g.appendChild(sv("rect", {"class": "cell", x: x, y: y, width: cw - gap, height: ch, rx: 2,
            fill: v ? BAND_COLOUR[b] || C.accent : C.line, "fill-opacity": v ? (0.25 + 0.75 * v / max).toFixed(2) : ".35"}));
          if (v) g.appendChild(sv("text", {x: x + (cw - gap) / 2, y: y + 12, fill: C.bg, "font-size": 9.5, "font-weight": 800, "text-anchor": "middle"}, num(v)));
          slotTitle(g, r.typology + " · " + b + ": " + num(v) + " alerts");
          svg.appendChild(g);
        });
        y += ch + gap;
      });
      y += 8;
    });
    put("chart-risk", svg);
  }

  function sarChart(sp) {
    if (!sp || !(sp.stages || []).length) { placeholder("chart-sar", "No SAR figures yet."); return; }
    var w = 430, lw = 110, rh = 26, rowsAll = sp.stages.concat([{stage: "Declined", count: sp.declined, declined: true}]);
    var max = Math.max.apply(null, rowsAll.map(function (r) { return r.count || 0; }).concat([1]));
    var svg = svgRoot(w, rowsAll.length * rh + 4, {"aria-label": "SAR pipeline by stage"});
    rowsAll.forEach(function (r, i) {
      var y = 2 + i * rh, bw = (w - lw - 44) * ((r.count || 0) / max);
      svg.appendChild(sv("text", {x: 0, y: y + 15, fill: r.declined ? C.muted : C.text, "font-size": 11.5}, r.stage));
      svg.appendChild(sv("rect", {x: lw, y: y + 3, width: w - lw - 44, height: 16, rx: 3, fill: C.line}));
      svg.appendChild(sv("rect", {"class": "stage", x: lw, y: y + 3, width: bw, height: 16, rx: 3, fill: r.declined ? C.muted : C.accent}));
      svg.appendChild(sv("text", {x: w, y: y + 15, fill: C.text, "font-size": 12, "font-weight": 700, "text-anchor": "end"}, figure(r.count)));
    });
    put("chart-sar", svg);
  }

  function kpi(label, big, sub, bad) {
    var n = el("div", "kpi" + (bad ? " bad" : ""));
    n.appendChild(el("div", "lbl", label)); n.appendChild(el("div", "big", big)); n.appendChild(el("div", "s", sub));
    return n;
  }
  function dashboard(db) {
    var k = db.kpis || {}, host = $("dash-kpis"); host.textContent = "";
    var ch = k.unassigned_change;
    host.appendChild(kpi("Unassigned backlog", figure(k.unassigned),
      ch == null ? "change not recorded" : ch === 0 ? "no change since the previous business day" : (ch > 0 ? "+" : "\u2212") + num(Math.abs(ch)) + " since the previous business day"));
    host.appendChild(kpi("New cases", figure(k.new_cases), k.new_cases_opening ? "opening load" : "latest day"));
    host.appendChild(kpi("SARs referred", figure(k.sars_to_date), "to date"));
    host.appendChild(kpi("New SLA breaches", figure(k.new_breaches), "latest day", k.new_breaches > 0));
    flowChart(db.flow || []); backlogChart(db.backlog || []); riskChart(db.risk_profile); sarChart(db.sar_pipeline);
    set("note-bands", (db.notes || {}).bands); set("note-risk", (db.notes || {}).risk);
  }

  function render(d, now) {
    $("heartbeat").setAttribute("data-state", "ok");
    show("v2-dash", d.schema >= 2 && !!d.dashboard);
    if (d.schema >= 2 && d.dashboard) {
      try { dashboard(d.dashboard); }
      catch (e) { show("v2-dash", false); }     // a bad dashboard must not take the whole page down
    }
    if (d.schema >= 2) renderV2(d, now);
    else { ["v2-head", "v2-top", "v2-engineering"].forEach(function (i) { show(i, false); }); show("v1-panes", true); }
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
    ["v2-head", "v2-top", "v2-dash", "v2-engineering"].forEach(function (i) { show(i, false); });
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
