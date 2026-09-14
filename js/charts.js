/* =============================================================
   ProfitLeak AI — lightweight charts
   Hand-rolled HTML/CSS bars + an SVG donut. No external
   libraries, so the app works completely offline and inside
   sandboxed previews.
   Each renderer returns an HTML string; app.js inserts it.
   ============================================================= */
(function (global) {
  'use strict';

  var CALC = global.PL_CALC;

  var COLORS = {
    purchase: '#6366f1', // indigo
    ad:       '#f97316', // orange
    shipping: '#0ea5e9', // sky
    fees:     '#8b5cf6', // violet
    discount: '#ec4899', // pink
    returns:  '#94a3b8', // slate
    profit:   '#10b981', // emerald
    loss:     '#ef4444'  // red
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 1) Horizontal "true profit by product" bars ---------- */
  function profitBars(rows) {
    if (!rows.length) {
      return '<div class="chart-empty">Add a product to see this chart.</div>';
    }
    var maxAbs = 1;
    rows.forEach(function (r) {
      maxAbs = Math.max(maxAbs, Math.abs(r.m.trueProfit));
    });

    var html = rows.map(function (r) {
      var v = r.m.trueProfit;
      var w = Math.max(Math.abs(v) / maxAbs * 100, 1.5);
      var cls = v < 0 ? 'neg' : 'pos';
      return '' +
        '<button type="button" class="bar-row" data-action="view" data-id="' + esc(r.id) + '" title="View analysis for ' + esc(r.name) + '">' +
          '<span class="bar-name">' + esc(r.name) + '</span>' +
          '<span class="bar-track"><span class="bar-fill bar-' + cls + '" style="width:' + w.toFixed(2) + '%"></span></span>' +
          '<span class="bar-val bar-val-' + cls + '">' + CALC.money(v) + '</span>' +
        '</button>';
    }).join('');

    return '<div class="bars">' + html + '</div>';
  }

  /* ---------- 2) Donut: where the money goes (cost categories) ---------- */
  function costDonut(categories) {
    var cats = categories.filter(function (c) { return c.total > 0; });
    var total = 0;
    cats.forEach(function (c) { total += c.total; });

    if (!cats.length || total <= 0) {
      return '<div class="chart-empty">No costs recorded yet.</div>';
    }

    cats.sort(function (a, b) { return b.total - a.total; });

    var R = 62;
    var C = 2 * Math.PI * R;
    var acc = 0;
    var segs = cats.map(function (c) {
      var len = c.total / total * C;
      var gap = Math.min(2, Math.max(0, len - 0.5));
      var seg = '<circle cx="80" cy="80" r="' + R + '" fill="none" stroke="' + COLORS[c.key] +
                '" stroke-width="24" stroke-dasharray="' + (len - gap).toFixed(2) + ' ' + (C - len + gap).toFixed(2) +
                '" stroke-dashoffset="' + (-acc).toFixed(2) + '" />';
      acc += len;
      return seg;
    }).join('');

    var legend = cats.map(function (c) {
      return '' +
        '<div class="legend-row">' +
          '<span class="dot" style="background:' + COLORS[c.key] + '"></span>' +
          '<span class="legend-label">' + esc(c.label) + '</span>' +
          '<span class="legend-val">' + usd.format(CALC.round2(c.total)) + '</span>' +
          '<span class="legend-pct">' + Math.round(c.total / total * 100) + '%</span>' +
        '</div>';
    }).join('');

    return '' +
      '<div class="donut-wrap">' +
        '<div class="donut">' +
          '<svg viewBox="0 0 160 160" role="img" aria-label="Cost breakdown donut chart"><g transform="rotate(-90 80 80)">' + segs + '</g></svg>' +
          '<div class="donut-center"><strong>' + usd.format(CALC.round2(total)) + '</strong><span>total costs</span></div>' +
        '</div>' +
        '<div class="legend">' + legend + '</div>' +
      '</div>';
  }

  /* ---------- 3) "What's inside one sale" stacked bar (unit economics) ---------- */
  function unitBar(p, m) {
    var parts = CALC.costBreakdown(p).filter(function (c) { return c.perUnit > 0; });
    var profit = m.profitPerUnit;
    var losing = profit < -(CALC.LOSS_EPSILON || 0.005); // ignore sub-cent float dust
    var total = losing ? m.totalCostPerUnit : p.sellingPrice;

    if (!(total > 0) || !parts.length) {
      return '<div class="chart-empty">No costs to show yet.</div>';
    }

    var segs = parts.map(function (c) {
      return { label: c.label, perUnit: c.perUnit, color: COLORS[c.key], shareOfPrice: c.shareOfPrice };
    });
    if (!losing) {
      segs.push({ label: 'True profit', perUnit: profit, color: COLORS.profit,
                  shareOfPrice: p.sellingPrice > 0 ? profit / p.sellingPrice * 100 : 0 });
    }

    var track = segs.map(function (s) {
      var w = Math.max(s.perUnit / total * 100, 0.75);
      return '<span class="anatomy-seg" style="width:' + w.toFixed(2) + '%;background:' + s.color +
             '" title="' + esc(s.label) + ': ' + CALC.money(s.perUnit) + ' per sale"></span>';
    }).join('');

    var marker = '';
    if (losing) {
      var at = (p.sellingPrice / total * 100).toFixed(2);
      var labelCls = parseFloat(at) > 78 ? ' anatomy-marker-label-end' : '';
      marker = '<span class="anatomy-marker" style="left:' + at + '%">' +
                 '<span class="anatomy-marker-label' + labelCls + '">your price ' + CALC.money(p.sellingPrice) + '</span>' +
               '</span>';
    }

    var legendRows = segs.slice().sort(function (a, b) { return b.perUnit - a.perUnit; });
    if (losing) {
      legendRows.push({ label: 'Loss (not covered by your price)', perUnit: profit, color: COLORS.loss, shareOfPrice: 0 });
    }
    var legend = legendRows.map(function (s) {
      return '' +
        '<div class="legend-row">' +
          '<span class="dot" style="background:' + s.color + '"></span>' +
          '<span class="legend-label">' + esc(s.label) + '</span>' +
          '<span class="legend-val">' + CALC.money(s.perUnit) + '/sale</span>' +
          '<span class="legend-pct">' + Math.round(s.shareOfPrice) + '% of price</span>' +
        '</div>';
    }).join('');

    var caption;
    if (losing) {
      caption = '<p class="anatomy-caption">Your selling price covers only <strong>' +
                Math.round(p.sellingPrice / m.totalCostPerUnit * 100) +
                '%</strong> of your true cost per sale. The gap is your loss: <strong class="text-neg">' +
                CALC.money(profit) + ' per sale</strong>.</p>';
    } else {
      caption = '<p class="anatomy-caption">Out of every sale, <strong class="text-pos">' +
                CALC.money(profit) + ' (' + Math.round(profit / p.sellingPrice * 100) +
                '%)</strong> is true profit. The rest covers your costs.</p>';
    }

    return '' +
      '<div class="anatomy">' +
        '<div class="anatomy-track">' + track + marker + '</div>' +
        '<div class="legend">' + legend + '</div>' +
        caption +
      '</div>';
  }

  /* ---------- 4) Cost ranking — "your costs, biggest first" ---------- */
  function costRanking(p) {
    var TH = CALC.THRESHOLDS;
    var limits = {
      purchase: null, // purchase cost has no "healthy ceiling" — it's ranked by size instead
      ad: TH.AD_SHARE_PCT, shipping: TH.SHIPPING_SHARE_PCT, fees: TH.FEES_SHARE_PCT,
      discount: TH.DISCOUNT_SHARE_PCT, returns: TH.RETURNS_SHARE_PCT
    };
    var parts = CALC.costBreakdown(p)
      .filter(function (c) { return c.perUnit > 0; })
      .sort(function (a, b) { return b.perUnit - a.perUnit; });

    if (!parts.length) return '<div class="chart-empty">No costs recorded.</div>';

    var max = parts[0].perUnit;
    var rows = parts.map(function (c, i) {
      var over = limits[c.key] !== null && c.shareOfPrice > limits[c.key];
      return '<div class="rank-row' + (i === 0 ? ' rank-first' : '') + (over ? ' rank-over' : '') + '">' +
        '<span class="rank-pos">' + (i + 1) + '</span>' +
        '<span class="rank-label">' + esc(c.label) +
          (i === 0 ? ' <span class="rank-tag">biggest</span>' : '') + '</span>' +
        '<span class="rank-track"><span class="rank-fill" style="width:' +
          (c.perUnit / max * 100).toFixed(2) + '%;background:' + COLORS[c.key] + '"></span></span>' +
        '<span class="rank-val">' + CALC.money(c.perUnit) +
          '<span class="rank-pct">' + Math.round(c.shareOfPrice) + '% of price' + (over ? ' \u26A0\uFE0F' : '') + '</span></span>' +
      '</div>';
    }).join('');

    return '<div class="rank-list">' + rows + '</div>';
  }

  var api = { COLORS: COLORS, profitBars: profitBars, costDonut: costDonut, unitBar: unitBar, costRanking: costRanking };

  global.PL_CHARTS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);
