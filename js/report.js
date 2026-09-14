/* =============================================================
   ProfitLeak AI — Profit Report generator
   Builds a professional report from the user's actual product
   data: business summary, top performers, biggest losses,
   profit leaks by cost category and smart recommendations.
   Pure functions + HTML rendering (no DOM events), so it also
   runs in Node.js for the automated tests.
   ============================================================= */
(function (global) {
  'use strict';

  var CALC = global.PL_CALC;

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

  /* Same palette as the charts (fallback keeps Node tests independent) */
  var COLORS = (global.PL_CHARTS && global.PL_CHARTS.COLORS) || {
    purchase: '#6366f1', ad: '#f97316', shipping: '#0ea5e9',
    fees: '#8b5cf6', discount: '#ec4899', returns: '#94a3b8'
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function two(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDate(dt) {
    return MONTHS[dt.getMonth()] + ' ' + dt.getDate() + ', ' + dt.getFullYear() +
           ' \u00B7 ' + two(dt.getHours()) + ':' + two(dt.getMinutes());
  }

  /* =============================================================
     1) BUILD — all figures come from the user's entered data
     ============================================================= */
  function buildReport(products) {
    if (!products || !products.length) return null;

    var s = CALC.summarizePortfolio(products);
    var rows = products.map(function (p) {
      return { p: p, m: CALC.computeMetrics(p) };
    });

    var top5 = rows.slice()
      .sort(function (a, b) { return b.m.trueProfit - a.m.trueProfit; })
      .slice(0, 5);

    var worst5 = rows
      .filter(function (r) { return r.m.trueProfit < 0; })
      .sort(function (a, b) { return a.m.trueProfit - b.m.trueProfit; })
      .slice(0, 5);

    /* aggregate every cost category across all products */
    var byKey = {};
    products.forEach(function (p) {
      CALC.costBreakdown(p).forEach(function (c) {
        if (!byKey[c.key]) byKey[c.key] = { key: c.key, label: c.label, total: 0 };
        byKey[c.key].total += c.total;
      });
    });
    var leaks = Object.keys(byKey).map(function (k) { return byKey[k]; })
      .sort(function (a, b) { return b.total - a.total; });
    leaks.forEach(function (l) {
      l.shareOfCosts = s.totalCost > 0 ? (l.total / s.totalCost) * 100 : 0;
    });

    /* ---- smart recommendations (real numbers only) ---- */
    var recs = [];
    var T = CALC.THRESHOLDS.LOW_PROFIT_MARGIN_PCT;

    if (s.losing > 0 && worst5.length) {
      var w0 = worst5[0];
      recs.push(s.losing + (s.losing > 1 ? ' products are' : ' product is') +
        ' losing money \u2014 ' + CALC.money(-s.totalLosses) + ' in combined true losses at current volumes.' +
        ' The worst is \u201C' + w0.p.name + '\u201D at ' + CALC.money(w0.m.trueProfit) +
        ' (' + CALC.money(w0.m.profitPerUnit) + ' per sale). Pause or reprice ' +
        (s.losing > 1 ? 'these products' : 'it') + ' first.');
    }
    if (leaks.length) {
      var L = leaks[0];
      recs.push('Your largest cost category is ' + L.label.toLowerCase() + ' at ' +
        CALC.money(L.total) + ' \u2014 ' + CALC.pct(L.shareOfCosts) +
        ' of all your costs. Cutting it by 10% would add about ' +
        CALC.money(L.total * 0.1) + ' in profit.');
      if (leaks[1] && leaks[1].shareOfCosts >= 15) {
        var L2 = leaks[1];
        recs.push('Second largest: ' + L2.label.toLowerCase() + ' at ' + CALC.money(L2.total) +
          ' (' + CALC.pct(L2.shareOfCosts) + ' of costs). A 10% cut there is worth about ' +
          CALC.money(L2.total * 0.1) + '.');
      }
    }
    if (s.margin < T) {
      recs.push('Your overall margin is ' + CALC.pct1(s.margin) + ' \u2014 below the ' + T +
        '% healthy level. Fix the products under \u201CBiggest losses\u201D before adding new ones.');
    } else {
      recs.push('Your overall margin is ' + CALC.pct1(s.margin) +
        ' after every cost \u2014 healthy. Keep monitoring ad and shipping prices so it stays that way.');
    }
    if (top5.length && top5[0].m.trueProfit > 0) {
      var t0 = top5[0];
      recs.push('Your best product is \u201C' + t0.p.name + '\u201D: ' + CALC.money(t0.m.trueProfit) +
        ' true profit (' + CALC.money(t0.m.profitPerUnit) + ' per sale, ' +
        CALC.pct1(t0.m.profitMargin) + ' margin). Protect its cost structure and consider promoting it more.');
    }
    if (s.low > 0) {
      recs.push(s.low + (s.low > 1 ? ' products have' : ' product has') + ' a margin under ' + T +
        '% \u2014 profitable but fragile. Small cost increases could turn ' +
        (s.low > 1 ? 'them' : 'it') + ' into losses.');
    }

    return {
      summary: s,
      top5: top5,
      worst5: worst5,
      leaks: leaks,
      recommendations: recs,
      generatedAt: new Date()
    };
  }

  /* =============================================================
     2) RENDER — clean, printable document
     ============================================================= */
  function tile(label, value, sub, cls) {
    return '<div class="rep-tile' + (cls ? ' ' + cls : '') + '">' +
             '<div class="rep-tile-label">' + label + '</div>' +
             '<div class="rep-tile-value">' + value + '</div>' +
             (sub ? '<div class="rep-tile-sub">' + sub + '</div>' : '') +
           '</div>';
  }

  function sectionHead(num, title, sub) {
    return '<div class="rep-sec-head"><h2><span class="rep-num">' + num + '</span>' + title + '</h2>' +
           (sub ? '<p class="rep-sub">' + sub + '</p>' : '') + '</div>';
  }

  function renderHtml(r) {
    var s = r.summary;
    var dateStr = fmtDate(r.generatedAt);
    var profitCls = s.trueProfit < 0 ? 'rep-neg' : 'rep-pos';

    /* ---- header ---- */
    var html =
      '<div class="report-doc">' +
        '<div class="rep-head">' +
          '<div class="rep-brand">ProfitLeak AI</div>' +
          '<div class="rep-title">Profit Report</div>' +
          '<div class="rep-date">Generated ' + dateStr + ' \u00B7 based on ' + s.count +
            ' product' + (s.count > 1 ? 's' : '') + ' and the numbers you entered</div>' +
        '</div>';

    /* ---- 1 · business summary ---- */
    html += '<div class="rep-section">' + sectionHead(1, 'Business summary',
              'All figures calculated from your entered product data.') +
            '<div class="rep-grid">' +
              tile('Total products', s.count, 'in this report') +
              tile('Total revenue', CALC.money(s.revenue), 'selling price \u00D7 units sold') +
              tile('Total costs', CALC.money(s.totalCost), 'all costs, all products') +
              tile('True profit', '<span class="' + profitCls + '">' + CALC.money(s.trueProfit) + '</span>',
                   'revenue \u2212 all costs', s.trueProfit < 0 ? 'rep-tile-bad' : 'rep-tile-good') +
              tile('Overall margin', CALC.pct1(s.margin), 'true profit \u00F7 revenue') +
              tile('Profitable products', s.profitable, '\uD83D\uDFE2 margin \u2265 ' +
                   CALC.THRESHOLDS.LOW_PROFIT_MARGIN_PCT + '%', 'rep-tile-good') +
              tile('Losing products', s.losing,
                   s.losing ? '\u2212' + CALC.money(CALC.round2(s.totalLosses)) + ' in losses' : 'none',
                   s.losing ? 'rep-tile-bad' : '') +
              tile('Low-margin products', s.low, 'margin under ' +
                   CALC.THRESHOLDS.LOW_PROFIT_MARGIN_PCT + '%') +
            '</div></div>';

    /* ---- 2 · top performers ---- */
    var topRows = r.top5.map(function (row, i) {
      var cls = row.m.trueProfit < 0 ? 'rep-neg' : 'rep-pos';
      return '<tr>' +
        '<td class="rep-rank">' + (i + 1) + '</td>' +
        '<td>' + esc(row.p.name) + '</td>' +
        '<td class="num">' + CALC.money(row.p.sellingPrice) + '</td>' +
        '<td class="num">' + row.m.units + '</td>' +
        '<td class="num"><strong class="' + cls + '">' + CALC.money(row.m.trueProfit) + '</strong></td>' +
        '<td class="num">' + CALC.pct1(row.m.profitMargin) + '</td>' +
      '</tr>';
    }).join('');
    html += '<div class="rep-section rep-sec-top">' +
            sectionHead(2, 'Top performers', 'Your ' + r.top5.length +
              ' most profitable product' + (r.top5.length > 1 ? 's' : '') + '.') +
            '<div class="rep-table-wrap"><table class="rep-table">' +
              '<thead><tr><th>#</th><th>Product</th><th class="num">Price</th>' +
              '<th class="num">Units</th><th class="num">True profit</th><th class="num">Margin</th></tr></thead>' +
              '<tbody>' + topRows + '</tbody>' +
            '</table></div></div>';

    /* ---- 3 · biggest losses ---- */
    html += '<div class="rep-section rep-sec-losses">' +
            sectionHead(3, 'Biggest losses', 'Products losing money \u2014 fix these first.');
    if (r.worst5.length) {
      var lossRows = r.worst5.map(function (row, i) {
        var big = CALC.biggestCost(row.p);
        return '<tr>' +
          '<td class="rep-rank">' + (i + 1) + '</td>' +
          '<td>' + esc(row.p.name) + '</td>' +
          '<td class="num"><strong class="rep-neg">' + CALC.money(row.m.trueProfit) + '</strong></td>' +
          '<td class="num">' + CALC.money(row.m.profitPerUnit) + ' / sale</td>' +
          '<td>' + (big ? esc(big.label) + ' \u00B7 ' + CALC.money(big.perUnit) : '\u2014') + '</td>' +
        '</tr>';
      }).join('');
      html += '<div class="rep-table-wrap"><table class="rep-table">' +
                '<thead><tr><th>#</th><th>Product</th><th class="num">True loss</th>' +
                '<th class="num">Loss per sale</th><th>Biggest cost</th></tr></thead>' +
                '<tbody>' + lossRows + '</tbody>' +
              '</table></div>';
    } else {
      html += '<div class="rep-note-ok">\u2705 No losing products \u2014 every product is profitable after all costs.</div>';
    }
    html += '</div>';

    /* ---- 4 · profit leaks ---- */
    var maxLeak = r.leaks.length ? r.leaks[0].total : 0;
    var leakRows = r.leaks.map(function (l) {
      var w = maxLeak > 0 ? (l.total / maxLeak * 100) : 0;
      return '<tr>' +
        '<td><span class="rep-dot" style="background:' + (COLORS[l.key] || '#94a3b8') + '"></span>' +
          esc(l.label) + '</td>' +
        '<td class="num"><strong>' + CALC.money(l.total) + '</strong></td>' +
        '<td class="num">' + CALC.pct(l.shareOfCosts) + '</td>' +
        '<td class="rep-bar-cell"><span class="rep-bar"><span style="width:' +
          w.toFixed(2) + '%;background:' + (COLORS[l.key] || '#94a3b8') + '"></span></span></td>' +
      '</tr>';
    }).join('');
    html += '<div class="rep-section rep-sec-leaks">' +
            sectionHead(4, 'Profit leaks', 'Where your money goes \u2014 every cost category, totals across all products, biggest first.') +
            '<div class="rep-table-wrap"><table class="rep-table">' +
              '<thead><tr><th>Cost category</th><th class="num">Total</th>' +
              '<th class="num">% of all costs</th><th></th></tr></thead>' +
              '<tbody>' + leakRows + '</tbody>' +
            '</table></div></div>';

    /* ---- 5 · smart recommendations ---- */
    html += '<div class="rep-section rep-sec-recs">' +
            sectionHead(5, 'Smart recommendations',
              'Generated only from the numbers you entered \u2014 no external market data.') +
            '<ol class="recs">' +
              r.recommendations.map(function (rec) { return '<li>' + esc(rec) + '</li>'; }).join('') +
            '</ol></div>';

    /* ---- footer ---- */
    html += '<div class="rep-foot">Generated by ProfitLeak AI \u00B7 ' + dateStr +
      '<br>Every figure in this report is calculated from your own entered data. ' +
      'Recommendations are rules of thumb, not financial advice.</div>' +
      '</div>';

    return html;
  }

  var api = { buildReport: buildReport, renderHtml: renderHtml, fmtDate: fmtDate };

  global.PL_REPORT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);
