/*
 * epwCompare.js
 *
 * Climate-change comparison mode: load one base EPW + multiple future EPWs
 * (e.g., from WeatherShift), parse scenario / period / percentile metadata,
 * and render an overlaid placeholder chart. Visualization design is
 * intentionally minimal here — the goal is the structure and metadata flow.
 */

(function () {
  'use strict';

  // ---------- State ----------
  var state = {
    base: null,        // { epw, fileName, raw, period }
    futures: [],       // [{ id, epw, fileName, raw, meta }]
    nextId: 1
  };

  // ---------- Scenario normalization ----------
  // ssp585 -> "SSP 5-8.5"; rcp45 -> "RCP 4.5"
  function formatScenario(rawScenario) {
    if (!rawScenario) return null;
    var s = String(rawScenario).toLowerCase();
    var m = s.match(/^ssp(\d)(\d{1,2})$/);
    if (m) {
      var family = m[1];
      var tail = m[2];
      var radf;
      if (tail.length === 1) {
        radf = tail + '.0';
      } else {
        radf = tail[0] + '.' + tail.slice(1);
      }
      return 'SSP ' + family + '-' + radf;
    }
    m = s.match(/^rcp(\d{2,3})$/);
    if (m) {
      var d = m[1];
      var rf;
      if (d.length === 2) {
        rf = d[0] + '.' + d[1];
      } else {
        rf = d[0] + '.' + d.slice(1);
      }
      return 'RCP ' + rf;
    }
    return rawScenario;
  }

  // ---------- Filename parsing for future files ----------
  // Example: USA_NY_..._TMYx.2011-2025_10%_ssp585_2070.epw
  function parseFutureFilename(fileName) {
    var meta = {
      scenarioRaw: null,
      scenario: null,
      percentile: null,
      year: null
    };
    if (!fileName) return meta;

    var pctMatch = fileName.match(/_(\d{1,3})%_/);
    if (pctMatch) meta.percentile = parseInt(pctMatch[1], 10);

    var scenMatch = fileName.match(/_(ssp\d{3}|rcp\d{2,3})_/i);
    if (scenMatch) {
      meta.scenarioRaw = scenMatch[1].toLowerCase();
      meta.scenario = formatScenario(meta.scenarioRaw);
    }

    // Year is the trailing 4-digit token immediately before .epw
    var yrMatch = fileName.match(/_(\d{4})\.epw$/i);
    if (yrMatch) {
      meta.year = parseInt(yrMatch[1], 10);
    }

    return meta;
  }

  // ---------- Historic period-of-record parsing ----------
  // Try COMMENTS 1 first, fall back to scanning data-row years.
  function parseHistoricPeriod(rawText) {
    if (!rawText) return null;

    // Split off the header (first 8 lines max — DATA PERIODS is line 8)
    var firstChunk = rawText.split(/\r?\n/, 30).join('\n');

    var porMatch = firstChunk.match(/Period\s+of\s+Record\s*=\s*(\d{4})\s*[-–]\s*(\d{4})/i);
    if (porMatch) {
      var s = parseInt(porMatch[1], 10);
      var e = parseInt(porMatch[2], 10);
      if (e < s) { var t = s; s = e; e = t; }
      // Round UP for half-years
      var midPor = Math.ceil((s + e) / 2);
      return { startYear: s, endYear: e, midYear: midPor, source: 'comments' };
    }

    // Fallback: scan data rows for years in column 1.
    // Data rows start after the DATA PERIODS line; we just scan the whole file.
    var lines = rawText.split(/\r?\n/);
    var minY = null, maxY = null;
    for (var i = 8; i < lines.length; i++) {
      var line = lines[i];
      if (!line) continue;
      var first = line.split(',', 1)[0];
      var y = parseInt(first, 10);
      if (!isFinite(y) || y < 1900 || y > 2200) continue;
      if (minY === null || y < minY) minY = y;
      if (maxY === null || y > maxY) maxY = y;
    }
    if (minY !== null && maxY !== null) {
      var midData = Math.round((minY + maxY) / 2);
      return { startYear: minY, endYear: maxY, midYear: midData, source: 'data' };
    }

    return null;
  }

  // ---------- Color assignment for futures ----------
  // Hue keyed by scenario family (radiative-forcing tier), lightness keyed
  // by percentile. Similar warming → similar hue; SSPs and matching RCPs
  // share a hue so the eye groups them.
  var SCENARIO_HUE = {
    ssp119: 220, ssp126: 210,
    ssp245: 45,
    ssp370: 25, ssp434: 25, ssp460: 25,
    ssp534: 0, ssp585: 0,
    rcp26: 210, rcp45: 45, rcp60: 25, rcp85: 0
  };
  function colorForFuture(meta, indexFallback) {
    var hue = (meta && meta.scenarioRaw && SCENARIO_HUE[meta.scenarioRaw] != null)
      ? SCENARIO_HUE[meta.scenarioRaw]
      : (indexFallback * 47) % 360;
    var pct = (meta && meta.percentile != null) ? meta.percentile : 50;
    // 10th = light (~65), 50th = mid (~45), 90th = dark (~28)
    var lightness = 65 - Math.min(40, Math.max(0, (pct - 10) * 0.46));
    return 'hsl(' + hue + ', 72%, ' + lightness + '%)';
  }

  // ---------- Public API: base file ----------
  // Called by single-file loaders so the comparison mode shares the same
  // base file the user already loaded.
  function setBase(epw, fileName, rawText) {
    var period = parseHistoricPeriod(rawText);
    state.base = {
      epw: epw,
      fileName: fileName || (epw && epw.stationLocation) || 'base.epw',
      raw: rawText || null,
      period: period
    };
    // If futures were loaded before base, color/order may need refresh
    renderBasePanel();
    renderFuturesPanel();
    renderChart();
  }

  function getBase() { return state.base; }

  function clearBase() {
    state.base = null;
    state.futures = [];
    renderBasePanel();
    renderFuturesPanel();
    renderChart();
  }

  // ---------- Future file loading ----------
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsText(file);
    });
  }

  function addFutureFiles(fileList) {
    if (!state.base) {
      alert('Please load a base EPW file first.');
      return;
    }
    var files = Array.from(fileList || []);
    var promises = files.map(function (f) {
      return readFile(f).then(function (raw) {
        var parsed = epw2json(raw);
        var meta = parseFutureFilename(f.name);
        state.futures.push({
          id: state.nextId++,
          epw: parsed,
          fileName: f.name,
          raw: raw,
          meta: meta
        });
      }).catch(function (err) {
        console.warn('Failed to load future file', f.name, err);
      });
    });
    Promise.all(promises).then(function () {
      renderFuturesPanel();
      renderChart();
    });
  }

  function removeFuture(id) {
    state.futures = state.futures.filter(function (f) { return f.id !== id; });
    renderFuturesPanel();
    renderChart();
  }

  // ---------- Rendering ----------
  function renderBasePanel() {
    var box = document.getElementById('compare-base-info');
    if (!box) return;
    if (!state.base) {
      box.innerHTML = '<em style="color:#888;">No base file loaded yet. Upload one below or use the Single File tab.</em>';
      var addBtn = document.getElementById('compare-add-future-btn');
      if (addBtn) addBtn.disabled = true;
      return;
    }
    var b = state.base;
    var periodHtml = '';
    if (b.period) {
      periodHtml = '<div style="font-size:12px; color:#555;">Measured period: ' +
        b.period.startYear + '–' + b.period.endYear +
        '  &middot;  midpoint ' + b.period.midYear +
        '  <span style="color:#999;">(' + (b.period.source === 'comments' ? 'from header' : 'from data rows') + ')</span></div>';
    } else {
      periodHtml = '<div style="font-size:12px; color:#999;">Measured period: not detected</div>';
    }
    box.innerHTML =
      '<div><b>' + escapeHtml(b.epw.stationLocation || '(unknown station)') + '</b></div>' +
      '<div style="font-size:12px; color:#555;">' + escapeHtml(b.fileName) + '</div>' +
      periodHtml;
    var addBtn2 = document.getElementById('compare-add-future-btn');
    if (addBtn2) addBtn2.disabled = false;
  }

  function renderFuturesPanel() {
    var list = document.getElementById('compare-futures-list');
    if (!list) return;
    if (state.futures.length === 0) {
      list.innerHTML = '<div style="color:#888; font-size:13px; padding:8px 0;">' +
        (state.base ? 'No future files added yet. Click "+ Add Future Files" above.' :
         'Future files will appear here once a base file is loaded.') +
        '</div>';
      return;
    }
    // Sort to match legend order: year asc, scenario rank asc, percentile asc
    var sorted = state.futures.slice().sort(function (a, b) {
      var ay = a.meta.year != null ? a.meta.year : 1e9;
      var by = b.meta.year != null ? b.meta.year : 1e9;
      if (ay !== by) return ay - by;
      var ar = (a.meta.scenarioRaw && SCENARIO_RANK[a.meta.scenarioRaw]) || 99;
      var br = (b.meta.scenarioRaw && SCENARIO_RANK[b.meta.scenarioRaw]) || 99;
      if (ar !== br) return ar - br;
      var ap = a.meta.percentile != null ? a.meta.percentile : 50;
      var bp = b.meta.percentile != null ? b.meta.percentile : 50;
      return ap - bp;
    });
    var rows = sorted.map(function (f, idx) {
      var color = colorForFuture(f.meta, idx);
      var scenario = f.meta.scenario || '<span style="color:#999;">scenario unknown</span>';
      var pct = (f.meta.percentile != null) ? (f.meta.percentile + 'th percentile') :
                '<span style="color:#999;">percentile unknown</span>';
      var yr = (f.meta.year != null) ? f.meta.year :
               '<span style="color:#999;">year unknown</span>';
      return '<div class="compare-future-row" data-id="' + f.id + '">' +
        '<span class="compare-swatch" style="background:' + color + ';"></span>' +
        '<span class="compare-meta">' + scenario + ' &middot; ' + yr + ' &middot; ' + pct + '</span>' +
        '<span class="compare-fname">' + escapeHtml(f.fileName) + '</span>' +
        '<button class="compare-remove" title="Remove" data-id="' + f.id + '">&times;</button>' +
        '</div>';
    });
    list.innerHTML = rows.join('');
    Array.prototype.forEach.call(list.querySelectorAll('.compare-remove'), function (btn) {
      btn.addEventListener('click', function () {
        removeFuture(parseInt(btn.getAttribute('data-id'), 10));
      });
    });
  }

  // ====================================================================
  // VARIABLES + DATA HELPERS
  // ====================================================================

  // Field numbers are 0-indexed against the EPW data row (matching epw2json).
  // missing: sentinel value used by EPW format for "no data" (treated as NaN).
  var VARIABLES = [
    { key: 'dbt',  label: 'Dry-bulb temperature',  units: '°C',    field: 6,  missing: 99.9 },
    { key: 'dpt',  label: 'Dew-point temperature', units: '°C',    field: 7,  missing: 99.9 },
    { key: 'rh',   label: 'Relative humidity',     units: '%',     field: 8,  missing: 999 },
    { key: 'pres', label: 'Atmospheric pressure',  units: 'Pa',    field: 9,  missing: 999999 },
    { key: 'ghi',  label: 'Global horiz. radiation',  units: 'Wh/m²', field: 13, missing: 9999 },
    { key: 'dni',  label: 'Direct normal radiation',  units: 'Wh/m²', field: 14, missing: 9999 },
    { key: 'dhi',  label: 'Diffuse horiz. radiation', units: 'Wh/m²', field: 15, missing: 9999 },
    { key: 'wspd', label: 'Wind speed',            units: 'm/s',   field: 21, missing: 999 },
    { key: 'sky',  label: 'Total sky cover',       units: 'tenths',field: 22, missing: 99 },
    { key: 'pwat', label: 'Precipitable water',    units: 'mm',    field: 28, missing: 999 }
  ];
  function getVar(key) {
    for (var i = 0; i < VARIABLES.length; i++) if (VARIABLES[i].key === key) return VARIABLES[i];
    return VARIABLES[0];
  }

  // Pull a clean numeric series (missing -> null). Cached per (epw, varKey).
  var _valueCache = new WeakMap();
  function values(epw, varDef) {
    var slot = _valueCache.get(epw);
    if (!slot) { slot = {}; _valueCache.set(epw, slot); }
    if (slot[varDef.key]) return slot[varDef.key];
    var raw = epw.getDataByField(varDef.field);
    var out = new Array(raw.length);
    var miss = varDef.missing;
    for (var i = 0; i < raw.length; i++) {
      var n = +raw[i];
      if (!isFinite(n)) { out[i] = null; continue; }
      if (miss != null && Math.abs(n - miss) < 0.01) { out[i] = null; continue; }
      out[i] = n;
    }
    slot[varDef.key] = out;
    return out;
  }

  function months(epw) { return epw.getDataByField(1); }
  function days(epw)   { return epw.getDataByField(2); }
  function hours(epw)  { return epw.getDataByField(3); }

  // ---- Statistics ----
  function quantile(sortedArr, p) {
    if (sortedArr.length === 0) return null;
    var idx = (sortedArr.length - 1) * p;
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sortedArr[lo];
    return sortedArr[lo] + (idx - lo) * (sortedArr[hi] - sortedArr[lo]);
  }
  function boxStats(arr) {
    var s = arr.filter(function (v) { return v != null && isFinite(v); }).slice().sort(function (a, b) { return a - b; });
    if (s.length === 0) return null;
    var sum = 0; for (var i = 0; i < s.length; i++) sum += s[i];
    return {
      n: s.length, min: s[0], max: s[s.length - 1],
      q1: quantile(s, 0.25), median: quantile(s, 0.5), q3: quantile(s, 0.75),
      mean: sum / s.length
    };
  }

  // ---- Per-chart aggregations ----
  function monthlyMean(epw, varDef) {
    var v = values(epw, varDef), mo = months(epw);
    var sums = new Array(12).fill(0), counts = new Array(12).fill(0);
    for (var i = 0; i < v.length; i++) {
      if (v[i] == null) continue;
      var m = mo[i] - 1; if (m < 0 || m > 11) continue;
      sums[m] += v[i]; counts[m]++;
    }
    return sums.map(function (s, i) { return counts[i] ? s / counts[i] : null; });
  }

  function dailyProfileByMonth(epw, varDef) {
    // 12 x 24 grid of means
    var v = values(epw, varDef), mo = months(epw), hr = hours(epw);
    var sums = []; var counts = [];
    for (var m = 0; m < 12; m++) { sums.push(new Array(24).fill(0)); counts.push(new Array(24).fill(0)); }
    for (var i = 0; i < v.length; i++) {
      if (v[i] == null) continue;
      var mi = mo[i] - 1, hi = hr[i] - 1;
      if (mi < 0 || mi > 11 || hi < 0 || hi > 23) continue;
      sums[mi][hi] += v[i]; counts[mi][hi]++;
    }
    var out = [];
    for (var m2 = 0; m2 < 12; m2++) {
      out.push(sums[m2].map(function (s, h) { return counts[m2][h] ? s / counts[m2][h] : null; }));
    }
    return out;
  }

  function monthlyBoxStats(epw, varDef) {
    var v = values(epw, varDef), mo = months(epw);
    var buckets = []; for (var m = 0; m < 12; m++) buckets.push([]);
    for (var i = 0; i < v.length; i++) {
      if (v[i] == null) continue;
      var mi = mo[i] - 1; if (mi < 0 || mi > 11) continue;
      buckets[mi].push(v[i]);
    }
    return buckets.map(function (b) { return boxStats(b); });
  }

  function durationCurve(epw, varDef) {
    var v = values(epw, varDef);
    var s = v.filter(function (x) { return x != null; }).slice();
    s.sort(function (a, b) { return b - a; }); // descending
    return s;
  }

  function annualStat(epw, varDef, statKey) {
    var v = values(epw, varDef).filter(function (x) { return x != null; });
    if (v.length === 0) return null;
    if (statKey === 'mean') {
      var s = 0; for (var i = 0; i < v.length; i++) s += v[i];
      return s / v.length;
    }
    if (statKey === 'max') return Math.max.apply(null, v);
    if (statKey === 'min') return Math.min.apply(null, v);
    var sorted = v.slice().sort(function (a, b) { return a - b; });
    if (statKey === 'p99') return quantile(sorted, 0.99);
    if (statKey === 'p01') return quantile(sorted, 0.01);
    return null;
  }

  function degreeDays(epw, hBase, cBase) {
    // Sum of (base − T)/24 over hours where T < hBase (HDD)
    // Sum of (T − base)/24 over hours where T > cBase (CDD)
    var v = values(epw, getVar('dbt'));
    var hdd = 0, cdd = 0;
    for (var i = 0; i < v.length; i++) {
      if (v[i] == null) continue;
      if (v[i] < hBase) hdd += (hBase - v[i]) / 24;
      if (v[i] > cBase) cdd += (v[i] - cBase) / 24;
    }
    return { hdd: hdd, cdd: cdd };
  }

  // ---- Series collection (base + futures with metadata) ----
  function representativeYear(item) {
    if (item.kind === 'base') return item.period ? item.period.midYear : null;
    return item.meta ? item.meta.year : null;
  }

  // Forcing rank for stable, physically meaningful sort within a year.
  // Lower forcing first; matching RCPs share rank with their SSP analog.
  var SCENARIO_RANK = {
    ssp119: 1,
    ssp126: 2,  rcp26: 2,
    ssp245: 3,  rcp45: 3,
    ssp370: 4,  rcp60: 4,
    ssp434: 5,
    ssp460: 6,
    ssp534: 7,
    ssp585: 8,  rcp85: 8
  };

  function allSeries() {
    var out = [];
    if (state.base) {
      out.push({
        kind: 'base',
        epw: state.base.epw,
        fileName: state.base.fileName,
        period: state.base.period,
        color: '#222',
        width: 2.5,
        dashed: false,
        label: 'Base · ' + (state.base.period ? 'midpoint ' + state.base.period.midYear : 'historic'),
        year: state.base.period ? state.base.period.midYear : null,
        meta: null
      });
    }
    state.futures.forEach(function (f, i) {
      out.push({
        kind: 'future',
        epw: f.epw,
        fileName: f.fileName,
        meta: f.meta,
        color: colorForFuture(f.meta, i),
        width: 1.8,
        dashed: f.meta.percentile != null && f.meta.percentile < 50,
        label: (f.meta.scenario || '?') + ' · ' + (f.meta.year || '?') + ' · ' + (f.meta.percentile != null ? f.meta.percentile + 'th' : '?'),
        year: f.meta.year != null ? f.meta.year : null
      });
    });
    // Stable sort: base first, then year asc, then scenario rank asc, then percentile asc
    out.sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === 'base' ? -1 : 1;
      if (a.kind === 'base') return 0;
      var ay = a.year != null ? a.year : 1e9;
      var by = b.year != null ? b.year : 1e9;
      if (ay !== by) return ay - by;
      var ar = (a.meta && a.meta.scenarioRaw && SCENARIO_RANK[a.meta.scenarioRaw]) || 99;
      var br = (b.meta && b.meta.scenarioRaw && SCENARIO_RANK[b.meta.scenarioRaw]) || 99;
      if (ar !== br) return ar - br;
      var ap = (a.meta && a.meta.percentile != null) ? a.meta.percentile : 50;
      var bp = (b.meta && b.meta.percentile != null) ? b.meta.percentile : 50;
      return ap - bp;
    });
    return out;
  }

  function getSelectVar(chart) {
    var sel = document.querySelector('select.compare-var-select[data-chart="' + chart + '"]');
    return getVar(sel ? sel.value : 'dbt');
  }

  function emptyMsg(container, msg) {
    container.innerHTML = '<div style="color:#888; padding:20px;">' + msg + '</div>';
  }

  // ====================================================================
  // CHART 1: Monthly mean line plot
  // ====================================================================
  function renderMonthlyMean() {
    var container = document.getElementById('compare-chart-monthly');
    if (!container) return;
    container.innerHTML = '';
    if (!state.base) return emptyMsg(container, 'Load a base file to see the chart.');
    var varDef = getSelectVar('monthly');
    var series = allSeries().map(function (s) {
      return Object.assign({}, s, { values: monthlyMean(s.epw, varDef) });
    });
    drawLineChart(container, series, {
      xLabels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      xCount: 12,
      yLabel: varDef.label + ' (' + varDef.units + ')'
    });
  }

  // ====================================================================
  // CHART 2: Daily profile by month (small multiples)
  // ====================================================================
  function renderDailyProfile() {
    var container = document.getElementById('compare-chart-daily');
    if (!container) return;
    container.innerHTML = '';
    if (!state.base) return emptyMsg(container, 'Load a base file to see the chart.');
    var varDef = getSelectVar('daily');
    var series = allSeries().map(function (s) {
      return Object.assign({}, s, { grid: dailyProfileByMonth(s.epw, varDef) });
    });

    // Find global y range across all series and months
    var allVals = [];
    series.forEach(function (s) {
      s.grid.forEach(function (row) { row.forEach(function (v) { if (v != null) allVals.push(v); }); });
    });
    if (allVals.length === 0) return emptyMsg(container, 'No data.');
    var yMin = Math.min.apply(null, allVals);
    var yMax = Math.max.apply(null, allVals);
    var pad = (yMax - yMin) * 0.08 || 1;
    yMin -= pad; yMax += pad;

    var W = container.clientWidth || 900;
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var cols = 4, rows = 3;
    var legendH = 40 + series.length * 16;
    var cellW = Math.floor((W - 40) / cols);
    var cellH = 110;
    var H = rows * cellH + 60 + legendH;

    var svg = d3.select(container).append('svg').attr('width', W).attr('height', H);

    monthNames.forEach(function (mname, mi) {
      var col = mi % cols, row = Math.floor(mi / cols);
      var gx = 20 + col * cellW + 30;
      var gy = 10 + row * cellH;
      var iw = cellW - 40, ih = cellH - 30;
      var x = d3.scale.linear().domain([0, 23]).range([0, iw]);
      var y = d3.scale.linear().domain([yMin, yMax]).range([ih, 0]);

      var g = svg.append('g').attr('transform', 'translate(' + gx + ',' + gy + ')');
      g.append('rect').attr('width', iw).attr('height', ih).attr('fill', '#fafafa').attr('stroke', '#e0e0e0');
      g.append('text').attr('x', iw / 2).attr('y', -2).style('text-anchor', 'middle')
        .style('font-size', '11px').style('font-weight', 'bold').text(mname);

      // Y axis only on left column
      if (col === 0) {
        g.append('g').attr('class', 'axis').call(d3.svg.axis().scale(y).orient('left').ticks(3));
      }
      // X axis only on bottom row
      if (row === rows - 1) {
        g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + ih + ')')
          .call(d3.svg.axis().scale(x).orient('bottom').ticks(4).tickFormat(function (d) { return d + 'h'; }));
      }

      var line = d3.svg.line()
        .x(function (d, i) { return x(i); })
        .y(function (d) { return y(d); })
        .defined(function (d) { return d != null; });

      series.forEach(function (s) {
        g.append('path').datum(s.grid[mi])
          .attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.width)
          .attr('stroke-dasharray', s.dashed ? '5,3' : null)
          .attr('d', line);
      });
    });

    // Legend
    var legend = svg.append('g').attr('transform', 'translate(20,' + (rows * cellH + 50) + ')');
    legend.append('text').attr('x', 0).attr('y', 0).style('font-size', '12px')
      .text(varDef.label + ' (' + varDef.units + '), hour-of-day, by month');
    series.forEach(function (s, i) {
      var row = legend.append('g').attr('transform', 'translate(0,' + (15 + i * 16) + ')');
      row.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 6).attr('y2', 6)
        .attr('stroke', s.color).attr('stroke-width', s.width)
        .attr('stroke-dasharray', s.dashed ? '5,3' : null);
      row.append('text').attr('x', 24).attr('y', 10).style('font-size', '11px').text(s.label);
    });
  }

  // ====================================================================
  // CHART 3: Heatmap (canvas) with absolute / delta-from-base toggle
  // ====================================================================
  function renderHeatmap() {
    var container = document.getElementById('compare-chart-heatmap');
    if (!container) return;
    container.innerHTML = '';
    if (!state.base) return emptyMsg(container, 'Load a base file to see the chart.');
    var varDef = getSelectVar('heatmap');
    var modeSel = document.getElementById('compare-heatmap-mode');
    var mode = modeSel ? modeSel.value : 'delta';

    var series = allSeries();
    var W = container.clientWidth || 900;
    var hmW = W - 100, hmH = 80;
    var marginL = 60, marginR = 20;

    // Build per-series 365x24 grids
    function gridFor(epw) {
      // Use day-of-year directly: fold (month, day) into ordinal day.
      var v = values(epw, varDef), mo = months(epw), da = days(epw), hr = hours(epw);
      var grid = []; for (var d = 0; d < 366; d++) { grid.push(new Array(24).fill(null)); }
      for (var i = 0; i < v.length; i++) {
        if (v[i] == null) continue;
        var dayOfYear = dayOfYearFromMD(mo[i], da[i]);
        if (dayOfYear < 1 || dayOfYear > 366) continue;
        var hi = hr[i] - 1; if (hi < 0 || hi > 23) continue;
        grid[dayOfYear - 1][hi] = v[i];
      }
      return grid;
    }

    var baseGrid = gridFor(state.base.epw);
    var seriesGrids = series.map(function (s) {
      return { s: s, grid: s.kind === 'base' ? baseGrid : gridFor(s.epw) };
    });

    // Compute global color scale
    var allVals = [];
    if (mode === 'absolute') {
      seriesGrids.forEach(function (g) { g.grid.forEach(function (row) { row.forEach(function (v) { if (v != null) allVals.push(v); }); }); });
    } else {
      // delta: compare each future row to base
      seriesGrids.forEach(function (g) {
        if (g.s.kind === 'base') return;
        for (var d = 0; d < 366; d++) for (var h = 0; h < 24; h++) {
          var bv = baseGrid[d][h], vv = g.grid[d][h];
          if (bv != null && vv != null) allVals.push(vv - bv);
        }
      });
    }
    if (allVals.length === 0) return emptyMsg(container, 'No data.');
    var lo, hi, scale;
    if (mode === 'absolute') {
      lo = Math.min.apply(null, allVals); hi = Math.max.apply(null, allVals);
      scale = function (v) { return interpRainbow((v - lo) / (hi - lo + 1e-9)); };
    } else {
      var maxAbs = Math.max(Math.abs(Math.min.apply(null, allVals)), Math.abs(Math.max.apply(null, allVals)));
      scale = function (v) { return interpDiverging(v / (maxAbs + 1e-9)); };
      lo = -maxAbs; hi = maxAbs;
    }

    // Title strip
    var info = document.createElement('div');
    info.style.fontSize = '12px'; info.style.color = '#555'; info.style.marginBottom = '6px';
    info.textContent = varDef.label + ' (' + varDef.units + '), ' +
      (mode === 'absolute' ? 'absolute values per file' : 'Δ from base — colour scale ±' + maxAbsFmt(maxAbs) + ' ' + varDef.units);
    container.appendChild(info);

    seriesGrids.forEach(function (g) {
      var row = document.createElement('div');
      row.style.marginBottom = '6px';
      row.innerHTML = '<div style="font-size:11px; color:#444; margin-bottom:2px;"><span style="display:inline-block; width:12px; height:12px; background:' +
        g.s.color + '; border:1px solid #999; vertical-align:middle; margin-right:6px;"></span>' + escapeHtml(g.s.label) + '</div>';
      var canvas = document.createElement('canvas');
      canvas.width = hmW; canvas.height = hmH;
      canvas.style.width = hmW + 'px'; canvas.style.height = hmH + 'px';
      canvas.style.border = '1px solid #ddd';
      var ctx = canvas.getContext('2d');
      var img = ctx.createImageData(hmW, hmH);
      // Map (day, hour) -> pixel
      for (var px = 0; px < hmW; px++) {
        var d = Math.floor((px / hmW) * 365);
        for (var py = 0; py < hmH; py++) {
          var h = Math.floor((py / hmH) * 24);
          var v;
          if (mode === 'absolute') {
            v = g.grid[d] ? g.grid[d][h] : null;
          } else {
            if (g.s.kind === 'base') {
              v = 0; // base vs base = 0 by definition
            } else {
              var bv = baseGrid[d] ? baseGrid[d][h] : null;
              var vv = g.grid[d] ? g.grid[d][h] : null;
              v = (bv != null && vv != null) ? vv - bv : null;
            }
          }
          var col = (v == null) ? [255, 255, 255] : scale(v);
          var pi = (py * hmW + px) * 4;
          img.data[pi] = col[0]; img.data[pi + 1] = col[1]; img.data[pi + 2] = col[2]; img.data[pi + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      row.appendChild(canvas);
      container.appendChild(row);
    });

    // Color scale legend
    var legend = document.createElement('div');
    legend.style.fontSize = '11px'; legend.style.color = '#555'; legend.style.marginTop = '8px';
    legend.style.display = 'flex'; legend.style.alignItems = 'center'; legend.style.gap = '8px';
    legend.innerHTML = '<span>' + lo.toFixed(1) + '</span>';
    var scaleStrip = document.createElement('div');
    scaleStrip.style.width = '200px'; scaleStrip.style.height = '14px';
    var sc = document.createElement('canvas'); sc.width = 200; sc.height = 14;
    var sctx = sc.getContext('2d');
    var sim = sctx.createImageData(200, 14);
    for (var sx = 0; sx < 200; sx++) {
      var t = sx / 199, vv;
      vv = lo + t * (hi - lo);
      var c = scale(vv);
      for (var sy = 0; sy < 14; sy++) {
        var pi2 = (sy * 200 + sx) * 4;
        sim.data[pi2] = c[0]; sim.data[pi2 + 1] = c[1]; sim.data[pi2 + 2] = c[2]; sim.data[pi2 + 3] = 255;
      }
    }
    sctx.putImageData(sim, 0, 0);
    scaleStrip.appendChild(sc);
    legend.appendChild(scaleStrip);
    legend.appendChild(document.createTextNode(hi.toFixed(1) + ' ' + varDef.units));
    container.appendChild(legend);
  }

  // Heatmap helpers
  function dayOfYearFromMD(month, day) {
    var dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var d = 0;
    for (var i = 0; i < month - 1; i++) d += dim[i];
    return d + day;
  }
  function maxAbsFmt(x) { return (x >= 10) ? x.toFixed(0) : x.toFixed(1); }
  function interpRainbow(t) {
    // Simple rainbow ramp (0=blue, 1=red)
    t = Math.max(0, Math.min(1, t));
    var r, g, b;
    if (t < 0.25)      { r = 0;            g = Math.round(t * 4 * 255);    b = 255; }
    else if (t < 0.5)  { r = 0;            g = 255;                        b = Math.round((1 - (t - 0.25) * 4) * 255); }
    else if (t < 0.75) { r = Math.round((t - 0.5) * 4 * 255); g = 255;     b = 0; }
    else               { r = 255;          g = Math.round((1 - (t - 0.75) * 4) * 255); b = 0; }
    return [r, g, b];
  }
  function interpDiverging(t) {
    // -1 = blue, 0 = white, +1 = red
    t = Math.max(-1, Math.min(1, t));
    if (t >= 0) {
      return [255, Math.round(255 - t * 220), Math.round(255 - t * 220)];
    } else {
      return [Math.round(255 + t * 220), Math.round(255 + t * 220), 255];
    }
  }

  // ====================================================================
  // CHART 4: Duration curve overlay
  // ====================================================================
  function renderDurationCurve() {
    var container = document.getElementById('compare-chart-duration');
    if (!container) return;
    container.innerHTML = '';
    if (!state.base) return emptyMsg(container, 'Load a base file to see the chart.');
    var varDef = getSelectVar('duration');
    var series = allSeries().map(function (s) {
      return Object.assign({}, s, { sorted: durationCurve(s.epw, varDef) });
    });
    var W = container.clientWidth || 800, H = 360;
    var margin = { top: 20, right: 200, bottom: 40, left: 60 };
    var iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;
    var allVals = [].concat.apply([], series.map(function (s) { return s.sorted; }));
    if (allVals.length === 0) return emptyMsg(container, 'No data.');
    var yMin = Math.min.apply(null, allVals), yMax = Math.max.apply(null, allVals);
    var pad = (yMax - yMin) * 0.05 || 1; yMin -= pad; yMax += pad;

    var svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    var x = d3.scale.linear().domain([0, 8760]).range([0, iw]);
    var y = d3.scale.linear().domain([yMin, yMax]).range([ih, 0]);

    g.append('g').attr('class', 'x axis').attr('transform', 'translate(0,' + ih + ')').call(d3.svg.axis().scale(x).orient('bottom').ticks(8));
    g.append('g').attr('class', 'y axis').call(d3.svg.axis().scale(y).orient('left').ticks(6));
    g.append('text').attr('x', iw / 2).attr('y', ih + 32).style('text-anchor', 'middle').style('font-size', '12px').text('Hours exceeded');
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -45).style('text-anchor', 'middle').style('font-size', '12px').text(varDef.label + ' (' + varDef.units + ')');

    var line = d3.svg.line().x(function (d, i) { return x(i); }).y(function (d) { return y(d); });
    series.forEach(function (s) {
      g.append('path').datum(s.sorted)
        .attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.width)
        .attr('stroke-dasharray', s.dashed ? '5,3' : null).attr('d', line);
    });

    // Legend
    var legend = svg.append('g').attr('transform', 'translate(' + (margin.left + iw + 14) + ',' + margin.top + ')');
    series.forEach(function (s, i) {
      var row = legend.append('g').attr('transform', 'translate(0,' + (i * 18) + ')');
      row.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 8).attr('y2', 8)
        .attr('stroke', s.color).attr('stroke-width', s.width)
        .attr('stroke-dasharray', s.dashed ? '5,3' : null);
      row.append('text').attr('x', 24).attr('y', 12).style('font-size', '11px').text(s.label);
    });
  }

  // ====================================================================
  // CHART 5: Monthly boxplots (one box per file per month, side-by-side)
  // ====================================================================
  function renderMonthlyBox() {
    var container = document.getElementById('compare-chart-monthbox');
    if (!container) return;
    container.innerHTML = '';
    if (!state.base) return emptyMsg(container, 'Load a base file to see the chart.');
    var varDef = getSelectVar('monthbox');
    var series = allSeries().map(function (s) {
      return Object.assign({}, s, { boxes: monthlyBoxStats(s.epw, varDef) });
    });
    var W = container.clientWidth || 1000, H = 400;
    var margin = { top: 20, right: 200, bottom: 40, left: 60 };
    var iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;
    var monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var nSeries = series.length;
    var groupW = iw / 12;
    var boxW = Math.max(2, (groupW - 8) / nSeries);

    var allVals = [];
    series.forEach(function (s) { s.boxes.forEach(function (b) { if (b) { allVals.push(b.min, b.max); } }); });
    if (allVals.length === 0) return emptyMsg(container, 'No data.');
    var yMin = Math.min.apply(null, allVals), yMax = Math.max.apply(null, allVals);
    var pad = (yMax - yMin) * 0.05 || 1; yMin -= pad; yMax += pad;

    var svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    var y = d3.scale.linear().domain([yMin, yMax]).range([ih, 0]);
    g.append('g').attr('class', 'y axis').call(d3.svg.axis().scale(y).orient('left').ticks(6));
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -45)
      .style('text-anchor', 'middle').style('font-size', '12px').text(varDef.label + ' (' + varDef.units + ')');

    monthLabels.forEach(function (mname, mi) {
      var x0 = mi * groupW;
      g.append('text').attr('x', x0 + groupW / 2).attr('y', ih + 16)
        .style('text-anchor', 'middle').style('font-size', '11px').text(mname);
      series.forEach(function (s, si) {
        var b = s.boxes[mi]; if (!b) return;
        var bx = x0 + 4 + si * boxW;
        // whiskers
        g.append('line').attr('x1', bx + boxW / 2).attr('x2', bx + boxW / 2)
          .attr('y1', y(b.min)).attr('y2', y(b.max)).attr('stroke', s.color).attr('stroke-width', 1);
        // box
        g.append('rect').attr('x', bx).attr('y', y(b.q3)).attr('width', boxW).attr('height', y(b.q1) - y(b.q3))
          .attr('fill', s.color).attr('fill-opacity', 0.45).attr('stroke', s.color);
        // median
        g.append('line').attr('x1', bx).attr('x2', bx + boxW).attr('y1', y(b.median)).attr('y2', y(b.median))
          .attr('stroke', '#222').attr('stroke-width', 1.4);
      });
    });

    var legend = svg.append('g').attr('transform', 'translate(' + (margin.left + iw + 14) + ',' + margin.top + ')');
    series.forEach(function (s, i) {
      var row = legend.append('g').attr('transform', 'translate(0,' + (i * 18) + ')');
      row.append('rect').attr('x', 0).attr('y', 2).attr('width', 14).attr('height', 12)
        .attr('fill', s.color).attr('fill-opacity', 0.45).attr('stroke', s.color);
      row.append('text').attr('x', 20).attr('y', 12).style('font-size', '11px').text(s.label);
    });
  }

  // ====================================================================
  // CHART 6: Climate trajectory plot
  // ====================================================================
  function renderTrajectory() {
    var container = document.getElementById('compare-chart-trajectory');
    if (!container) return;
    container.innerHTML = '';
    if (!state.base) return emptyMsg(container, 'Load a base file to see the chart.');
    var varDef = getSelectVar('trajectory');
    var statSel = document.getElementById('compare-traj-stat');
    var statKey = statSel ? statSel.value : 'mean';
    var statLabels = { mean: 'Annual mean', max: 'Annual maximum', min: 'Annual minimum', p99: '99th percentile', p01: '1st percentile' };

    var series = allSeries();
    var pts = series.map(function (s) {
      return { x: representativeYear(s) || s.year, y: annualStat(s.epw, varDef, statKey), s: s };
    }).filter(function (p) { return p.x != null && p.y != null; });
    if (pts.length === 0) return emptyMsg(container, 'No data with year metadata.');

    var W = container.clientWidth || 900, H = 380;
    var margin = { top: 20, right: 200, bottom: 50, left: 60 };
    var iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    if (xMin === xMax) { xMin -= 5; xMax += 5; }
    var yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
    var pad = (yMax - yMin) * 0.1 || 1; yMin -= pad; yMax += pad;

    var svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    var x = d3.scale.linear().domain([xMin - 2, xMax + 2]).range([0, iw]);
    var y = d3.scale.linear().domain([yMin, yMax]).range([ih, 0]);
    g.append('g').attr('class', 'x axis').attr('transform', 'translate(0,' + ih + ')').call(d3.svg.axis().scale(x).orient('bottom').tickFormat(d3.format('d')));
    g.append('g').attr('class', 'y axis').call(d3.svg.axis().scale(y).orient('left').ticks(6));
    g.append('text').attr('x', iw / 2).attr('y', ih + 36).style('text-anchor', 'middle').style('font-size', '12px').text('Representative year');
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -45).style('text-anchor', 'middle').style('font-size', '12px')
      .text(statLabels[statKey] + ' — ' + varDef.label + ' (' + varDef.units + ')');

    // Connect same-scenario+percentile lines from base through futures
    // Group future points by scenarioRaw + percentile
    var groups = {};
    pts.forEach(function (p) {
      if (p.s.kind === 'future' && p.s.meta && p.s.meta.scenarioRaw) {
        var k = p.s.meta.scenarioRaw + '|' + (p.s.meta.percentile != null ? p.s.meta.percentile : '50');
        if (!groups[k]) groups[k] = [];
        groups[k].push(p);
      }
    });
    var basePt = pts.filter(function (p) { return p.s.kind === 'base'; })[0];
    Object.keys(groups).forEach(function (k) {
      var gp = groups[k].slice().sort(function (a, b) { return a.x - b.x; });
      var pathPts = basePt ? [basePt].concat(gp) : gp;
      if (pathPts.length < 2) return;
      g.append('path').datum(pathPts)
        .attr('fill', 'none').attr('stroke', gp[0].s.color).attr('stroke-width', 1.6)
        .attr('stroke-dasharray', gp[0].s.dashed ? '5,3' : null)
        .attr('d', d3.svg.line().x(function (p) { return x(p.x); }).y(function (p) { return y(p.y); }));
    });

    // Points
    pts.forEach(function (p) {
      g.append('circle').attr('cx', x(p.x)).attr('cy', y(p.y)).attr('r', 5)
        .attr('fill', p.s.color).attr('stroke', '#222').attr('stroke-width', 0.8);
    });

    var legend = svg.append('g').attr('transform', 'translate(' + (margin.left + iw + 14) + ',' + margin.top + ')');
    series.forEach(function (s, i) {
      var row = legend.append('g').attr('transform', 'translate(0,' + (i * 18) + ')');
      // Show the connecting-line style (solid/dashed) plus the marker dot.
      if (s.kind !== 'base') {
        row.append('line').attr('x1', 0).attr('x2', 22).attr('y1', 8).attr('y2', 8)
          .attr('stroke', s.color).attr('stroke-width', 1.6)
          .attr('stroke-dasharray', s.dashed ? '5,3' : null);
      }
      row.append('circle').attr('cx', 11).attr('cy', 8).attr('r', 5).attr('fill', s.color).attr('stroke', '#222').attr('stroke-width', 0.8);
      row.append('text').attr('x', 28).attr('y', 12).style('font-size', '11px').text(s.label);
    });
  }

  // ====================================================================
  // CHART 7: Period boxplots (x = year, each file = one box)
  // ====================================================================
  function renderPeriodBox() {
    var container = document.getElementById('compare-chart-periodbox');
    if (!container) return;
    container.innerHTML = '';
    if (!state.base) return emptyMsg(container, 'Load a base file to see the chart.');
    var varDef = getSelectVar('periodbox');
    var series = allSeries().map(function (s) {
      var v = values(s.epw, varDef);
      return Object.assign({}, s, { box: boxStats(v), year: representativeYear(s) || s.year });
    }).filter(function (s) { return s.year != null && s.box; });
    if (series.length === 0) return emptyMsg(container, 'No data.');

    var W = container.clientWidth || 900, H = 400;
    var margin = { top: 20, right: 200, bottom: 50, left: 60 };
    var iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;
    var years = series.map(function (s) { return s.year; });
    var xMin = Math.min.apply(null, years), xMax = Math.max.apply(null, years);
    if (xMin === xMax) { xMin -= 5; xMax += 5; }
    var allVals = [];
    series.forEach(function (s) { allVals.push(s.box.min, s.box.max); });
    var yMin = Math.min.apply(null, allVals), yMax = Math.max.apply(null, allVals);
    var pad = (yMax - yMin) * 0.05 || 1; yMin -= pad; yMax += pad;

    var svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    var x = d3.scale.linear().domain([xMin - 3, xMax + 3]).range([0, iw]);
    var y = d3.scale.linear().domain([yMin, yMax]).range([ih, 0]);
    g.append('g').attr('class', 'x axis').attr('transform', 'translate(0,' + ih + ')').call(d3.svg.axis().scale(x).orient('bottom').tickFormat(d3.format('d')));
    g.append('g').attr('class', 'y axis').call(d3.svg.axis().scale(y).orient('left').ticks(6));
    g.append('text').attr('x', iw / 2).attr('y', ih + 36).style('text-anchor', 'middle').style('font-size', '12px').text('Representative year');
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -45).style('text-anchor', 'middle').style('font-size', '12px')
      .text(varDef.label + ' (' + varDef.units + ')');

    // Group by year, jitter side-by-side
    var byYear = {};
    series.forEach(function (s) { (byYear[s.year] = byYear[s.year] || []).push(s); });
    Object.keys(byYear).forEach(function (yr) {
      var grp = byYear[yr];
      var n = grp.length;
      var spread = Math.min(36, 8 * n);
      grp.forEach(function (s, i) {
        var off = (i - (n - 1) / 2) * (spread / Math.max(1, n - 1 || 1));
        if (n === 1) off = 0;
        var cx = x(s.year) + off;
        var b = s.box;
        var boxW = 10;
        // whiskers
        g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(b.min)).attr('y2', y(b.max)).attr('stroke', s.color).attr('stroke-width', 1);
        g.append('line').attr('x1', cx - 5).attr('x2', cx + 5).attr('y1', y(b.min)).attr('y2', y(b.min)).attr('stroke', s.color);
        g.append('line').attr('x1', cx - 5).attr('x2', cx + 5).attr('y1', y(b.max)).attr('y2', y(b.max)).attr('stroke', s.color);
        // box
        g.append('rect').attr('x', cx - boxW / 2).attr('y', y(b.q3)).attr('width', boxW).attr('height', y(b.q1) - y(b.q3))
          .attr('fill', s.color).attr('fill-opacity', 0.5).attr('stroke', s.color);
        // median
        g.append('line').attr('x1', cx - boxW / 2).attr('x2', cx + boxW / 2).attr('y1', y(b.median)).attr('y2', y(b.median))
          .attr('stroke', '#222').attr('stroke-width', 1.4);
      });
    });

    var legend = svg.append('g').attr('transform', 'translate(' + (margin.left + iw + 14) + ',' + margin.top + ')');
    series.forEach(function (s, i) {
      var row = legend.append('g').attr('transform', 'translate(0,' + (i * 18) + ')');
      row.append('rect').attr('x', 0).attr('y', 2).attr('width', 14).attr('height', 12)
        .attr('fill', s.color).attr('fill-opacity', 0.5).attr('stroke', s.color);
      row.append('text').attr('x', 20).attr('y', 12).style('font-size', '11px').text(s.label);
    });
  }

  // ====================================================================
  // CHART 8: Degree days timeline
  // ====================================================================
  function renderDegreeDays() {
    var container = document.getElementById('compare-chart-degdays');
    if (!container) return;
    container.innerHTML = '';
    if (!state.base) return emptyMsg(container, 'Load a base file to see the chart.');
    var hBaseEl = document.getElementById('compare-dd-hbase');
    var cBaseEl = document.getElementById('compare-dd-cbase');
    var hBase = hBaseEl ? +hBaseEl.value : 18;
    var cBase = cBaseEl ? +cBaseEl.value : 18;

    var series = allSeries().map(function (s) {
      var dd = degreeDays(s.epw, hBase, cBase);
      return Object.assign({}, s, { dd: dd, year: representativeYear(s) || s.year });
    }).filter(function (s) { return s.year != null; });
    if (series.length === 0) return emptyMsg(container, 'No data with year metadata.');

    var W = container.clientWidth || 900, H = 380;
    var margin = { top: 20, right: 200, bottom: 50, left: 60 };
    var iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;
    var years = series.map(function (s) { return s.year; });
    var xMin = Math.min.apply(null, years), xMax = Math.max.apply(null, years);
    if (xMin === xMax) { xMin -= 5; xMax += 5; }
    var maxDD = 0;
    series.forEach(function (s) { maxDD = Math.max(maxDD, s.dd.hdd, s.dd.cdd); });
    if (maxDD === 0) return emptyMsg(container, 'No degree-day load at these base temps.');

    var svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    var x = d3.scale.linear().domain([xMin - 3, xMax + 3]).range([0, iw]);
    var y = d3.scale.linear().domain([0, maxDD * 1.05]).range([ih, 0]);
    g.append('g').attr('class', 'x axis').attr('transform', 'translate(0,' + ih + ')').call(d3.svg.axis().scale(x).orient('bottom').tickFormat(d3.format('d')));
    g.append('g').attr('class', 'y axis').call(d3.svg.axis().scale(y).orient('left').ticks(6));
    g.append('text').attr('x', iw / 2).attr('y', ih + 36).style('text-anchor', 'middle').style('font-size', '12px').text('Representative year');
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -45).style('text-anchor', 'middle').style('font-size', '12px')
      .text('Degree-days (°C-day)');

    // For each file: paired vertical bars (HDD red, CDD blue) at its year
    var byYear = {};
    series.forEach(function (s) { (byYear[s.year] = byYear[s.year] || []).push(s); });
    Object.keys(byYear).forEach(function (yr) {
      var grp = byYear[yr];
      var n = grp.length;
      var spread = Math.min(60, 14 * n);
      grp.forEach(function (s, i) {
        var off = (i - (n - 1) / 2) * (spread / Math.max(1, n - 1 || 1));
        if (n === 1) off = 0;
        var cx = x(s.year) + off;
        var bw = 5;
        g.append('rect').attr('x', cx - bw - 1).attr('y', y(s.dd.hdd)).attr('width', bw).attr('height', ih - y(s.dd.hdd))
          .attr('fill', '#c0392b').attr('fill-opacity', 0.85).attr('stroke', s.color);
        g.append('rect').attr('x', cx + 1).attr('y', y(s.dd.cdd)).attr('width', bw).attr('height', ih - y(s.dd.cdd))
          .attr('fill', '#1a6faf').attr('fill-opacity', 0.85).attr('stroke', s.color);
      });
    });

    // Legend
    var legend = svg.append('g').attr('transform', 'translate(' + (margin.left + iw + 14) + ',' + margin.top + ')');
    var hddSwatch = legend.append('g').attr('transform', 'translate(0,0)');
    hddSwatch.append('rect').attr('width', 14).attr('height', 12).attr('fill', '#c0392b');
    hddSwatch.append('text').attr('x', 20).attr('y', 10).style('font-size', '11px').text('HDD (base ' + hBase + ' °C)');
    var cddSwatch = legend.append('g').attr('transform', 'translate(0,18)');
    cddSwatch.append('rect').attr('width', 14).attr('height', 12).attr('fill', '#1a6faf');
    cddSwatch.append('text').attr('x', 20).attr('y', 10).style('font-size', '11px').text('CDD (base ' + cBase + ' °C)');
    legend.append('text').attr('x', 0).attr('y', 50).style('font-size', '11px').style('fill', '#666').text('Bar outline = scenario color');
    series.forEach(function (s, i) {
      var row = legend.append('g').attr('transform', 'translate(0,' + (62 + i * 16) + ')');
      row.append('rect').attr('x', 0).attr('y', 2).attr('width', 14).attr('height', 10)
        .attr('fill', '#fff').attr('stroke', s.color).attr('stroke-width', 1.5);
      row.append('text').attr('x', 20).attr('y', 11).style('font-size', '11px').text(s.label);
    });
  }

  // ====================================================================
  // Generic line chart helper (used by Monthly Mean)
  // ====================================================================
  function drawLineChart(container, series, opts) {
    var W = container.clientWidth || 800, H = 360;
    var margin = { top: 20, right: 200, bottom: 40, left: 60 };
    var iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;
    var allVals = series.reduce(function (acc, s) {
      return acc.concat(s.values.filter(function (v) { return v != null; }));
    }, []);
    if (allVals.length === 0) return emptyMsg(container, 'No data.');
    var yMin = Math.min.apply(null, allVals), yMax = Math.max.apply(null, allVals);
    var pad = (yMax - yMin) * 0.08 || 1; yMin -= pad; yMax += pad;

    var svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    var x = d3.scale.linear().domain([0, opts.xCount - 1]).range([0, iw]);
    var y = d3.scale.linear().domain([yMin, yMax]).range([ih, 0]);

    g.append('g').attr('class', 'x axis').attr('transform', 'translate(0,' + ih + ')')
      .call(d3.svg.axis().scale(x).orient('bottom').ticks(opts.xCount).tickFormat(function (d) { return opts.xLabels[d] || ''; }));
    g.append('g').attr('class', 'y axis').call(d3.svg.axis().scale(y).orient('left').ticks(6));
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -45)
      .style('text-anchor', 'middle').style('font-size', '12px').text(opts.yLabel);

    var line = d3.svg.line().x(function (d, i) { return x(i); }).y(function (d) { return y(d); }).defined(function (d) { return d != null; });
    series.forEach(function (s) {
      g.append('path').datum(s.values).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.width)
        .attr('stroke-dasharray', s.dashed ? '5,3' : null).attr('d', line);
    });

    var legend = svg.append('g').attr('transform', 'translate(' + (margin.left + iw + 14) + ',' + margin.top + ')');
    series.forEach(function (s, i) {
      var row = legend.append('g').attr('transform', 'translate(0,' + (i * 18) + ')');
      row.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 8).attr('y2', 8)
        .attr('stroke', s.color).attr('stroke-width', s.width)
        .attr('stroke-dasharray', s.dashed ? '5,3' : null);
      row.append('text').attr('x', 24).attr('y', 12).style('font-size', '11px').text(s.label);
    });
  }

  // ====================================================================
  // Master render — calls all 8
  // ====================================================================
  function renderAllCharts() {
    renderMonthlyMean();
    renderDailyProfile();
    renderHeatmap();
    renderDurationCurve();
    renderMonthlyBox();
    renderTrajectory();
    renderPeriodBox();
    renderDegreeDays();
  }

  // Backwards-compat alias for the old renderChart() callers
  function renderChart() { renderAllCharts(); }

  // ---------- Mode switching ----------
  function setMode(mode) {
    var single = document.getElementById('mode-single');
    var compare = document.getElementById('mode-compare');
    var pillSingle = document.getElementById('mode-pill-single');
    var pillCompare = document.getElementById('mode-pill-compare');
    if (!single || !compare) return;
    if (mode === 'compare') {
      single.style.display = 'none';
      compare.style.display = '';
      if (pillSingle) pillSingle.classList.remove('active');
      if (pillCompare) pillCompare.classList.add('active');
      // Refresh in case base changed since last render
      renderBasePanel();
      renderFuturesPanel();
      renderChart();
    } else {
      single.style.display = '';
      compare.style.display = 'none';
      if (pillSingle) pillSingle.classList.add('active');
      if (pillCompare) pillCompare.classList.remove('active');
    }
  }

  // ---------- Comparison-mode base file upload ----------
  // Lets the user upload a base file directly inside the Comparison tab
  // without going back to the Single File tab. Calls setBase + also
  // updates the single-file globals so charts there are populated too.
  function handleCompareBaseFile(file) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      var raw = r.result;
      try {
        var parsed = epw2json(raw);
        // Notify single-file side too, if its hook is available
        if (typeof window.onBaseEpwLoaded === 'function') {
          window.onBaseEpwLoaded(parsed, file.name, raw);
        } else {
          setBase(parsed, file.name, raw);
        }
      } catch (e) {
        alert('Failed to parse EPW: ' + e.message);
      }
    };
    r.readAsText(file);
  }

  // ---------- Helpers ----------
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- DOM wiring ----------
  document.addEventListener('DOMContentLoaded', function () {
    var pillSingle = document.getElementById('mode-pill-single');
    var pillCompare = document.getElementById('mode-pill-compare');
    if (pillSingle) pillSingle.addEventListener('click', function (e) { e.preventDefault(); setMode('single'); });
    if (pillCompare) pillCompare.addEventListener('click', function (e) { e.preventDefault(); setMode('compare'); });

    var addBtn = document.getElementById('compare-add-future-btn');
    var futuresInput = document.getElementById('compare-futures-input');
    if (addBtn && futuresInput) {
      addBtn.addEventListener('click', function () { futuresInput.click(); });
      futuresInput.addEventListener('change', function (e) {
        addFutureFiles(e.target.files);
        futuresInput.value = '';
      });
    }

    var compareBaseInput = document.getElementById('compare-base-input');
    if (compareBaseInput) {
      compareBaseInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) {
          handleCompareBaseFile(e.target.files[0]);
          compareBaseInput.value = '';
        }
      });
    }

    var compareDrop = document.getElementById('compare-base-drop');
    if (compareDrop) {
      compareDrop.ondragover = function () { this.className = 'upload-drop-zone drop'; return false; };
      compareDrop.ondragleave = function () { this.className = 'upload-drop-zone'; return false; };
      compareDrop.ondrop = function (e) {
        e.preventDefault();
        this.className = 'upload-drop-zone';
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleCompareBaseFile(e.dataTransfer.files[0]);
        }
      };
    }

    // Populate variable dropdowns
    var varSelects = document.querySelectorAll('select.compare-var-select');
    var optHtml = VARIABLES.map(function (v) {
      return '<option value="' + v.key + '">' + v.label + ' (' + v.units + ')</option>';
    }).join('');
    Array.prototype.forEach.call(varSelects, function (sel) {
      sel.innerHTML = optHtml;
      sel.addEventListener('change', renderAllCharts);
    });

    // Per-chart extra controls
    var heatmapModeSel = document.getElementById('compare-heatmap-mode');
    if (heatmapModeSel) heatmapModeSel.addEventListener('change', renderHeatmap);
    var trajStatSel = document.getElementById('compare-traj-stat');
    if (trajStatSel) trajStatSel.addEventListener('change', renderTrajectory);
    var ddHBase = document.getElementById('compare-dd-hbase');
    var ddCBase = document.getElementById('compare-dd-cbase');
    if (ddHBase) ddHBase.addEventListener('input', renderDegreeDays);
    if (ddCBase) ddCBase.addEventListener('input', renderDegreeDays);

    // Initial paint
    renderBasePanel();
    renderFuturesPanel();
    renderAllCharts();
  });

  // ---------- Public ----------
  window.epwCompare = {
    setBase: setBase,
    getBase: getBase,
    clearBase: clearBase,
    addFutureFiles: addFutureFiles,
    removeFuture: removeFuture,
    parseFutureFilename: parseFutureFilename,
    parseHistoricPeriod: parseHistoricPeriod,
    formatScenario: formatScenario,
    setMode: setMode
  };
})();
