/* =============================================================
   ProfitLeak AI — application controller
   Hash-based SPA:  #/  landing ·  #/dashboard  ·  #/add  ·
   #/edit/:id  ·  #/product/:id
   ============================================================= */
(function () {
  'use strict';

  var CALC = window.PL_CALC;
  var Store = window.PL_STORE;
  var Charts = window.PL_CHARTS;
  var CSV = window.PL_CSV;
  var Plan = window.PL_PLAN;
  var Report = window.PL_REPORT;
  var License = window.PL_LICENSE; // paid license layer (v1.8)
  var Trial = window.PL_TRIAL;     // one-session free trial gate (v1.9)
  var CHECKOUT = 'https://profitleak.netlify.app/.netlify/functions/checkout-start?method='; // on-site checkout (v1.10)
  var PLANS_EP = 'https://profitleak.netlify.app/.netlify/functions/license-plans'; // subscription plans (v1.21)
  var REDEEM_EP = 'https://profitleak.netlify.app/.netlify/functions/redeem-code'; // promo codes (v1.21)
  var PLANS_CACHE = null;
  function fetchPlans() {
    if (PLANS_CACHE) return Promise.resolve(PLANS_CACHE);
    if (typeof fetch !== 'function') return Promise.resolve(null); /* very old browsers */
    return fetch(PLANS_EP).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.success && d.plans && d.plans.yearly) PLANS_CACHE = d;
      return PLANS_CACHE;
    }).catch(function () { return null; });
  }
  function applyPlanUI() {
    var host = $('#pricing-body');
    if (host && PLANS_CACHE && PLANS_CACHE.freeYear && !$('.freeyear-box') && !Plan.isPro()) {
      var fy = PLANS_CACHE.freeYear;
      host.insertAdjacentHTML('afterbegin',
        '<div class="freeyear-box">\uD83C\uDF81 <b>Launch offer:</b> the first ' + fy.limit + ' sellers get their <b>first year FREE</b> \u2014 ' +
        'enter the code <b style="user-select:all;">' + esc(fy.code) + '</b> in \u201CActivate your license\u201D below. ' +
        (fy.remaining > 0 ? '<b>' + fy.remaining + ' of ' + fy.limit + ' left</b>' : 'All claimed!') + '</div>');
    }
    var tgl = $$('.plan-opt'), priceEl = $('#plan-price');
    if (!tgl.length || !priceEl) return;
    var sel = 'yearly';
    function refresh() {
      var p = PLANS_CACHE.plans[sel];
      priceEl.textContent = (sel === 'yearly' ? '$' + p.price.toFixed(2) + ' / year' : '$' + p.price.toFixed(2) + ' / month');
      $$('[data-pay]').forEach(function (a) {
        a.href = CHECKOUT + a.getAttribute('data-pay') + '&plan=' + sel;
      });
      tgl.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-plan') === sel); });
    }
    tgl.forEach(function (b) {
      b.addEventListener('click', function () { sel = b.getAttribute('data-plan'); refresh(); });
    });
    refresh();
  }
  var EMAIL_EP = 'https://profitleak.netlify.app/.netlify/functions/email-signup'; // bonus-sessions signup (v1.11)
  var STORE_CREATE_EP = 'https://profitleak.netlify.app/.netlify/functions/store-create'; // WhatsApp order links (v1.12)
  var STORE_DATA_EP = 'https://profitleak.netlify.app/.netlify/functions/store-data';
  var STORE_ORDER_EP = 'https://profitleak.netlify.app/.netlify/functions/store-order';
  var STORE_ORDERS_EP = 'https://profitleak.netlify.app/.netlify/functions/store-orders';
  var STORE_MANAGE_EP = 'https://profitleak.netlify.app/.netlify/functions/store-manage'; // edit/delete order links (v1.13)
  var SITE_URL = 'https://profitleak.netlify.app';

  /* ---------------- tiny helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  function fmtMoney(v) {
    var r = Math.round((Number(v) + Number.EPSILON) * 100) / 100;
    return (r < 0 ? '\u2212' : '') + usd.format(Math.abs(r));
  }
  function fmtPct(v, d) {
    var n = d === 0 ? Math.round(v) : Math.round(v * 10) / 10;
    return n + '%';
  }
  function toTop() { try { window.scrollTo(0, 0); } catch (e) { /* jsdom etc. */ } }

  var STATUS_META = {
    PROFITABLE: { label: '\uD83D\uDFE2 PROFITABLE', cls: 'badge-green' },
    LOW:        { label: '\uD83D\uDFE1 LOW PROFIT', cls: 'badge-amber' },
    LOSING:     { label: '\uD83D\uDD34 LOSING MONEY', cls: 'badge-red' }
  };
  var ISSUE_ICONS = {
    LOSING: '\uD83D\uDD3A',        // 🔻
    LOW_MARGIN: '\uD83D\uDCC9',    // 📉
    HIGH_AD: '\uD83D\uDCE3',       // 📣
    HIGH_SHIPPING: '\uD83D\uDE9A', // 🚚
    HIGH_FEES: '\uD83D\uDCA4',     // 💳
    HIGH_DISCOUNT: '\uD83C\uDFF7\uFE0F', // 🏷️
    HIGH_RETURNS: '\u21A9\uFE0F'   // ↩️
  };

  var ICONS = {
    eye: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
  };

  /* ---------------- state ---------------- */
  var state = {
    products: [],
    editingId: null,
    filter: 'all',
    sort: { key: 'trueProfit', dir: 'asc' } // worst profit first by default
  };

  /* Set after a successful save and cleared whenever the form route is
     opened again. A rapid double-submit (stuck Enter key, double-firing
     assistive tech) must never create the same product twice. */
  var formLocked = false;

  function persist() { Store.save(state.products); }

  /* =============================================================
     ROUTER
     ============================================================= */
  /* Malformed hashes (e.g. #/product/%) must never crash the router —
     a bad id simply falls back to a safe page. */
  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (e) { return ''; }
  }

  function parseRoute() {
    var h = location.hash.replace(/^#/, '');
    if (!h || h === '/') return { page: 'landing' };
    var parts = h.split('/').filter(Boolean);
    if (parts[0] === 'dashboard') return { page: 'dashboard' };
    if (parts[0] === 'pricing') return { page: 'pricing' };
    if (parts[0] === 'report') return { page: 'report' };
    if (parts[0] === 'orders') return { page: 'orders' };
    if (parts[0] === 'order') { var oId = safeDecode(parts[1]); return oId ? { page: 'order', id: oId } : { page: 'landing' }; }
    if (parts[0] === 's') { var sId = safeDecode(parts[1]); return sId ? { page: 'store', id: sId } : { page: 'landing' }; }
    if (parts[0] === 'add') return { page: 'form', mode: 'add' };
    if (parts[0] === 'edit') { var eId = safeDecode(parts[1]); return eId ? { page: 'form', mode: 'edit', id: eId } : { page: 'dashboard' }; }
    if (parts[0] === 'product') { var aId = safeDecode(parts[1]); return aId ? { page: 'analysis', id: aId } : { page: 'dashboard' }; }
    return { page: 'landing' };
  }

  /* visitor analytics (v1.22): one beacon per browser sitting. First-party
     endpoint when the API is deployed; a no-signup live counter meanwhile. */
  var VISIT_EP = 'https://profitleak.netlify.app/.netlify/functions/visit-log';
  function logVisit() {
    try {
      if (sessionStorage.getItem('profitleak.visit.v1')) return;
      sessionStorage.setItem('profitleak.visit.v1', '1');
    } catch (e) { /* private mode: once per page load */ }
    var src = '';
    try { src = (new URLSearchParams(location.search).get('ref') || ''); } catch (e) { /* ignore */ }
    var payload = JSON.stringify({
      ref: (document.referrer || '').slice(0, 120),
      lang: (navigator.language || '').slice(0, 8),
      path: (location.hash || '#/').slice(0, 40),
      src: src.slice(0, 30)
    });
    var counter = function () {
      try {
        fetch('https://abacus.jasoncameron.dev/hit/profitleak/all').catch(function () { /* silent */ });
        fetch('https://abacus.jasoncameron.dev/hit/profitleak/d-' + new Date().toISOString().slice(0, 10)).catch(function () { /* silent */ });
      } catch (e) { /* silent */ }
    };
    try {
      fetch(VISIT_EP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
        .then(function (r) { if (!r.ok) counter(); })
        .catch(counter);
    } catch (e) { counter(); }
  }

  function render() {
    var route = parseRoute();
    var isLanding = route.page === 'landing';

    /* public order/store pages (v1.12): customer-facing, no app chrome,
       never gated by the trial or the license paywall */
    var isPublic = route.page === 'order' || route.page === 'store';
    if (isPublic) {
      $('#view-landing').hidden = true;
      $('#view-app').hidden = true;
      $('#view-public').hidden = false;
      hideTrialPaywall(); /* customers are never gated — even mid-popup */
      renderPublicPage(route);
      return;
    }
    $('#view-public').hidden = true;

    /* one-session free trial: the gate re-evaluates the session FIRST
       (it may have ended since the last render); only then refresh it.
       v1.17: the popup shows on EVERY page for a locked visitor —
       including the landing page, so nobody misses the email offer
       just because they opened the site root. */
    var gated = trialGateEngaged();
    if (gated) {
      if (isLanding) { $('#view-app').hidden = true; $('#view-landing').hidden = false; }
      showTrialPaywall();
      return;
    }
    if (Trial) Trial.heartbeat();
    hideTrialPaywall();

    $('#view-landing').hidden = !isLanding;
    $('#view-app').hidden = isLanding;
    $('#storage-banner').hidden = isLanding || Store.isPersistent();

    $$('.page').forEach(function (s) { s.hidden = true; });
    $('[data-nav="dashboard"]').classList.toggle('active', route.page === 'dashboard');
    $('[data-nav="pricing"]').classList.toggle('active', route.page === 'pricing');
    $('[data-nav="orders"]').classList.toggle('active', route.page === 'orders');
    renderPlanNav();

    if (isLanding) {
      renderLandingExample();
    } else if (route.page === 'dashboard') {
      $('#page-dashboard').hidden = false;
      renderDashboard();
    } else if (route.page === 'orders') {
      $('#page-orders').hidden = false;
      renderOrdersPage();
    } else if (route.page === 'pricing') {
      $('#page-pricing').hidden = false;
      renderPricing();
    } else if (route.page === 'report') {
      $('#page-report').hidden = false;
      renderReport();
    } else if (route.page === 'form') {
      $('#page-form').hidden = false;
      renderForm(route);
    } else if (route.page === 'analysis') {
      if (!renderAnalysis(route.id)) { location.hash = '#/dashboard'; return; }
      $('#page-analysis').hidden = false;
    }
    toTop();
  }

  /* =============================================================
     LANDING — real example computed by the engine itself
     ============================================================= */
  function renderLandingExample() {
    var host = $('#hero-example');
    if (!host) return;
    var p = null;
    Store.samples().forEach(function (s) { if (s.id === 'sample-phone-case') p = s; });
    if (!p) return;

    var m = CALC.computeMetrics(p);
    var naive = p.sellingPrice - p.purchaseCost;
    var total = Math.max(m.totalCostPerUnit, p.sellingPrice);

    var segs = CALC.costBreakdown(p).filter(function (c) { return c.perUnit > 0; });
    var track = segs.map(function (c) {
      var w = Math.max(c.perUnit / total * 100, 0.75);
      return '<span class="mini-seg" style="width:' + w.toFixed(2) + '%;background:' +
             Charts.COLORS[c.key] + '" title="' + esc(c.label) + ': ' + fmtMoney(c.perUnit) + ' per sale"></span>';
    }).join('');
    var markerAt = (p.sellingPrice / total * 100).toFixed(2);

    host.innerHTML = '' +
      '<div class="he-badge">Real example — one of the sample products inside the app</div>' +
      '<div class="he-grid">' +
        '<div class="he-col">' +
          '<h3>What most sellers see</h3>' +
          '<div class="he-line"><span>Selling price</span><strong>' + fmtMoney(p.sellingPrice) + '</strong></div>' +
          '<div class="he-line"><span>Product cost</span><strong>\u2212' + fmtMoney(p.purchaseCost) + '</strong></div>' +
          '<div class="he-line he-total"><span>\u201CProfit\u201D</span><strong>' + fmtMoney(naive) + '</strong></div>' +
          '<p class="he-note">Looks like a winner, right?</p>' +
        '</div>' +
        '<div class="he-col he-truth">' +
          '<h3>The truth, after ALL costs</h3>' +
          '<div class="mini-bar-wrap">' +
            '<div class="mini-bar">' + track +
              '<span class="mini-marker" style="left:' + markerAt + '%"></span>' +
            '</div>' +
            '<div class="mini-caption">your price ' + fmtMoney(p.sellingPrice) + ' vs. true cost ' + fmtMoney(m.totalCostPerUnit) + ' per sale</div>' +
          '</div>' +
          '<div class="he-line he-total he-bad"><span>True profit per sale</span><strong>' + fmtMoney(m.profitPerUnit) + '</strong></div>' +
          '<p class="he-note">\u00D7 ' + m.units + ' units sold = <strong>' + fmtMoney(m.trueProfit) + ' in real losses</strong></p>' +
        '</div>' +
      '</div>' +
      '<a class="he-cta" href="#/dashboard">Open the dashboard and analyze your own products \u2192</a>';
  }

  /* =============================================================
     DASHBOARD
     ============================================================= */
  /* Plain-language help for the key metrics (dashboard tooltips) */
  var HELP = {
    products: 'Everything you have added to your dashboard. Click any product to see its full analysis.',
    revenue: 'All the money your customers paid you, before any costs. It is selling price \u00D7 units sold.',
    costs: 'Everything you spend to make the sale: purchase, advertising, shipping, platform fees, discounts and returns.',
    profit: 'What really remains after subtracting ALL costs from your revenue. Green means you are earning, red means you are losing. The percentage shown underneath is your profit margin \u2014 the share of every sales dollar you actually keep.',
    losing: 'Products that lose money on every sale. They quietly eat your profit \u2014 fix or pause these first.',
    low: 'Products earning less than a 15% margin. Profitable, but fragile \u2014 a small cost increase could turn them into losses.',
    leak: 'The single cost that takes the biggest share of your money on this product.'
  };

  function helpBtn(key) {
    return '<button type="button" class="help-btn" data-help="' + key +
           '" aria-label="What does this mean?" aria-expanded="false">?</button>';
  }
  function helpBox(key) {
    return '<div class="help-box" hidden>' + HELP[key] + '</div>';
  }

  function kpi(label, value, sub, tone, help) {
    return '<div class="kpi' + (tone ? ' ' + tone : '') + '">' +
             '<div class="kpi-label">' + label + (help ? helpBtn(help) : '') + '</div>' +
             '<div class="kpi-value">' + value + '</div>' +
             '<div class="kpi-sub">' + sub + '</div>' +
             (help ? helpBox(help) : '') +
           '</div>';
  }

  function renderDashboard() {
    var s = CALC.summarizePortfolio(state.products);
    var T = CALC.THRESHOLDS.LOW_PROFIT_MARGIN_PCT;

    /* ----- plan banner (free users) ----- */
    renderPlanBanner();

    /* ----- Clear Demo Data button: only shown when demo products exist ----- */
    var clearDemoBtn = $('#btn-clear-demo');
    if (clearDemoBtn) clearDemoBtn.hidden = !state.products.some(Store.isDemoProduct);

    /* ----- KPI cards (with plain-language help) ----- */
    $('#kpi-grid').innerHTML = [
      kpi('Total products', s.count, 'in your dashboard', '', 'products'),
      kpi('Total revenue', fmtMoney(s.revenue), 'selling price \u00D7 units sold', '', 'revenue'),
      kpi('Total costs', fmtMoney(s.totalCost), 'all costs, all products', '', 'costs'),
      kpi('True profit',
          '<span class="' + (s.trueProfit < 0 ? 'text-neg' : 'text-pos') + '">' + fmtMoney(s.trueProfit) + '</span>',
          fmtPct(s.margin) + ' overall margin', s.trueProfit < 0 ? 'kpi-red' : 'kpi-green', 'profit'),
      kpi('Losing products', s.losing,
          s.losing ? '\u2212' + usd.format(CALC.round2(s.totalLosses)) + ' in total losses' : 'none \u2014 nice work \uD83C\uDF89',
          'kpi-red', 'losing'),
      kpi('Low-profit products', s.low,
          s.low ? 'margin under ' + T + '% \u2014 fragile' : 'none \u2014 nice work \uD83C\uDF89',
          'kpi-amber', 'low')
    ].join('');

    /* ----- Alert banners ----- */
    var alerts = '';
    if (s.losing > 0) {
      alerts += '<div class="alert alert-red"><span class="alert-icon" aria-hidden="true">\u26A0\uFE0F</span><div>' +
                '<strong>' + s.losing + (s.losing > 1 ? ' products are' : ' product is') + ' losing money.</strong> ' +
                'At current volumes that\u2019s <strong>\u2212' + usd.format(CALC.round2(s.totalLosses)) + '</strong> in true losses. ' +
                'They\u2019re listed first in your table below.</div></div>';
    }
    if (s.low > 0) {
      alerts += '<div class="alert alert-amber"><span class="alert-icon" aria-hidden="true">\u26A0\uFE0F</span><div>' +
                '<strong>' + s.low + (s.low > 1 ? ' products have' : ' product has') + ' a low profit margin</strong> (under ' + T + '%). ' +
                'A small cost increase could push ' + (s.low > 1 ? 'them' : 'it') + ' into a loss.</div></div>';
    }
    $('#alerts').innerHTML = alerts;

    /* ----- Charts ----- */
    var rows = state.products.map(function (p) {
      return { id: p.id, name: p.name, m: CALC.computeMetrics(p) };
    }).sort(function (a, b) { return a.m.trueProfit - b.m.trueProfit; });
    $('#chart-profit').innerHTML = Charts.profitBars(rows);

    var byKey = {};
    state.products.forEach(function (p) {
      CALC.costBreakdown(p).forEach(function (c) {
        if (!byKey[c.key]) byKey[c.key] = { key: c.key, label: c.label, total: 0 };
        byKey[c.key].total += c.total;
      });
    });
    $('#chart-costs').innerHTML = Charts.costDonut(Object.keys(byKey).map(function (k) { return byKey[k]; }));

    /* ----- filter chips + table ----- */
    var chips = [
      { key: 'all', label: 'All', count: s.count },
      { key: 'losing', label: 'Losing money', count: s.losing },
      { key: 'low', label: 'Low profit', count: s.low },
      { key: 'profitable', label: 'Profitable', count: s.profitable }
    ];
    $('#table-filters').innerHTML = chips.map(function (c) {
      return '<button type="button" class="chip' + (state.filter === c.key ? ' chip-active' : '') +
        '" data-filter="' + c.key + '"><span class="chip-dot chip-dot-' + c.key + '"></span>' +
        c.label + '<span class="chip-count">' + c.count + '</span></button>';
    }).join('');

    $('#table-wrap').innerHTML = buildTable();
  }

  function sortedRows() {
    var rows = state.products.map(function (p) { return { p: p, m: CALC.computeMetrics(p) }; });
    var key = state.sort.key, dir = state.sort.dir;
    function val(r) {
      if (key === 'name') return r.p.name.toLowerCase();
      if (key === 'sellingPrice') return r.p.sellingPrice;
      if (key === 'unitsSold') return r.p.unitsSold;
      return r.m[key];
    }
    rows.sort(function (a, b) {
      var va = val(a), vb = val(b);
      var c = va < vb ? -1 : va > vb ? 1 : 0;
      return dir === 'asc' ? c : -c;
    });
    return rows;
  }

  function buildTable() {
    if (!state.products.length) {
      return '<div class="empty-state">' +
               '<div class="empty-icon" aria-hidden="true">\uD83D\uDCE6</div>' +
               '<h3>No products yet.</h3>' +
               '<p>Add your first product or try the demo.</p>' +
               '<div class="empty-actions">' +
                 '<a class="btn btn-primary" href="#/add">Add Product</a>' +
                 '<button class="btn btn-ghost" type="button" data-action="load-samples">Try Demo Data</button>' +
               '</div>' +
             '</div>';
    }

    var cols = [
      ['name', 'Product'], ['sellingPrice', 'Selling price'], ['unitsSold', 'Units sold'],
      ['revenue', 'Revenue'], ['totalCost', 'Total cost'], ['trueProfit', 'True profit'],
      ['profitMargin', 'Profit margin'], [null, 'Status'], [null, 'Recommendation'], [null, '']
    ];

    var head = cols.map(function (c) {
      var isNumeric = c[0] && c[0] !== 'name';
      var classes = [];
      if (c[0]) classes.push('sortable');
      if (isNumeric) classes.push('num');
      var attrs = c[0] ? ' data-sort="' + c[0] + '"' + (classes.length ? ' class="' + classes.join(' ') + '"' : '') :
                          (classes.length ? ' class="' + classes.join(' ') + '"' : '');
      var ind = (c[0] && state.sort.key === c[0])
        ? '<span class="sort-ind">' + (state.sort.dir === 'asc' ? '\u25B2' : '\u25BC') + '</span>' : '';
      return '<th scope="col"' + attrs + '>' + c[1] + ind + '</th>';
    }).join('');

    var body = sortedRows();
    if (state.filter && state.filter !== 'all') {
      body = body.filter(function (r) { return CALC.getStatus(r.m).toLowerCase() === state.filter; });
    }
    if (!body.length) {
      return '<div class="empty-state">' +
               '<div class="empty-icon" aria-hidden="true">\uD83D\uDD0E</div>' +
               '<h3>No products in this view</h3>' +
               '<p>No products currently match this filter.</p>' +
               '<div class="empty-actions">' +
                 '<button class="btn btn-ghost" type="button" data-filter="all">Show all products</button>' +
               '</div>' +
             '</div>';
    }
    body = body.map(rowHtml).join('');

    return '<table class="data-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function rowHtml(row) {
    var p = row.p, m = row.m;
    var meta = STATUS_META[CALC.getStatus(m)];
    var rec0 = CALC.shortRecommendation(p, m);
    var profitCls = m.trueProfit < 0 ? 'text-neg' : 'text-pos';

    var demoTag = Store.isDemoProduct(p) ? ' <span class="badge badge-demo">Demo Data</span>' : '';
    return '<tr class="clickable" data-id="' + esc(p.id) + '" tabindex="0" role="button" ' +
             'aria-label="View analysis for ' + esc(p.name) + '">' +
      '<td data-label="Product"><span class="p-name">' + esc(p.name) + '</span>' + demoTag + '</td>' +
      '<td data-label="Selling price" class="num">' + fmtMoney(p.sellingPrice) + '</td>' +
      '<td data-label="Units sold" class="num">' + m.units + '</td>' +
      '<td data-label="Revenue" class="num">' + fmtMoney(m.revenue) + '</td>' +
      '<td data-label="Total cost" class="num">\u2212' + fmtMoney(m.totalCost) + '</td>' +
      '<td data-label="True profit" class="num"><strong class="' + profitCls + '">' + fmtMoney(m.trueProfit) + '</strong></td>' +
      '<td data-label="Profit margin" class="num">' + fmtPct(m.profitMargin) + '</td>' +
      '<td data-label="Status"><span class="badge ' + meta.cls + '">' + meta.label + '</span></td>' +
      '<td data-label="Recommendation"><div class="cell-rec">' + esc(rec0) + '</div></td>' +
      '<td data-label="Actions" class="row-actions">' +
        '<button class="btn-view" type="button" data-action="view" data-id="' + esc(p.id) + '" aria-label="View Analysis: ' + esc(p.name) + '" title="View Analysis">' + ICONS.eye + '<span>View Analysis</span></button>' +
        '<button class="icon-btn" type="button" data-action="edit" data-id="' + esc(p.id) + '" aria-label="Edit ' + esc(p.name) + '" title="Edit product">' + ICONS.pencil + '</button>' +
        '<button class="icon-btn icon-btn-danger" type="button" data-action="delete" data-id="' + esc(p.id) + '" aria-label="Delete ' + esc(p.name) + '" title="Delete product">' + ICONS.trash + '</button>' +
      '</td>' +
    '</tr>';
  }

  /* =============================================================
     ADD / EDIT PRODUCT FORM
     ============================================================= */
  var FORM_FIELDS = [
    ['f-name', 'name', 'text'],
    ['f-price', 'sellingPrice', 'number'],
    ['f-units', 'unitsSold', 'number'],
    ['f-purchase', 'purchaseCost', 'number'],
    ['f-ad', 'adCostPerSale', 'number'],
    ['f-ship', 'shippingCost', 'number'],
    ['f-fees', 'platformFees', 'number'],
    ['f-discount', 'discountPerSale', 'number'],
    ['f-returns', 'returnCostPerSale', 'number']
  ];

  function renderForm(route) {
    var form = $('#product-form');
    form.reset();
    formLocked = false; // reopening the form unlocks saving
    var upsell = $('#form-upsell');
    var layout = $('.form-layout');

    /* FREE plan: adding is blocked once the product limit is reached */
    var blocked = route.mode === 'add' && !Plan.isPro() &&
                  Plan.freeSlotsFor(state.products.length) <= 0;
    if (blocked) {
      layout.hidden = true;
      upsell.hidden = false;
      upsell.innerHTML =
        '<div class="upsell-icon" aria-hidden="true">\uD83D\uDCB0</div>' +
        '<h2>You\u2019ve reached the free plan limit</h2>' +
        '<p class="upsell-text">The free plan holds <strong>' + Plan.freeLimit() +
        ' products</strong>. Upgrade to Pro for <strong>unlimited products</strong>, the What-If Simulator, cost ranking and profit goals.</p>' +
        '<div class="empty-actions">' +
          '<a class="btn btn-primary btn-lg" href="#/pricing">Upgrade to Pro</a>' +
          '<a class="btn btn-ghost" href="#/dashboard">Back to dashboard</a>' +
        '</div>' +
        '<p class="upsell-note">Pro is $19 one-time \u2014 a lifetime license, no subscription.</p>';
      return;
    }
    layout.hidden = false;
    upsell.hidden = true;

    if (route.mode === 'edit') {
      var p = null;
      state.products.forEach(function (x) { if (x.id === route.id) p = x; });
      if (!p) { location.hash = '#/dashboard'; return; }
      state.editingId = p.id;
      $('#form-title').textContent = 'Edit product';
      $('#form-subtitle').textContent = 'Update the numbers for \u201C' + p.name + '\u201D.';
      $('#form-submit').textContent = 'Update product';
      $('#f-name').value = p.name;
      $('#f-price').value = p.sellingPrice;
      $('#f-units').value = p.unitsSold;
      $('#f-purchase').value = p.purchaseCost;
      $('#f-ad').value = p.adCostPerSale;
      $('#f-ship').value = p.shippingCost;
      $('#f-fees').value = p.platformFees;
      $('#f-discount').value = p.discountPerSale;
      $('#f-returns').value = p.returnCostPerSale;
    } else {
      state.editingId = null;
      $('#form-title').textContent = 'Add product';
      $('#form-subtitle').textContent = 'Enter your product\u2019s numbers. Fields marked \u201Cper sale\u201D are the cost for one single order.';
      $('#form-submit').textContent = 'Save product';
    }
    clearAllErrors();
    updateLivePreview();
  }

  function readForm() {
    var d = {};
    FORM_FIELDS.forEach(function (f) {
      var el = document.getElementById(f[0]);
      d[f[1]] = f[2] === 'text' ? el.value.trim() : (el.value === '' ? '' : Number(el.value));
    });
    return d;
  }

  function validateForm(d) {
    var errors = {};
    var moneyKeys = ['sellingPrice', 'purchaseCost', 'adCostPerSale', 'shippingCost',
                     'platformFees', 'discountPerSale', 'returnCostPerSale'];

    if (!d.name) errors.name = 'Please enter a product name.';

    moneyKeys.forEach(function (key) {
      var v = d[key];
      if (v === '') v = key === 'sellingPrice' ? NaN : 0; // empty costs count as $0
      if (!isFinite(v)) {
        errors[key] = key === 'sellingPrice' ? 'Enter the price your customer pays (greater than $0).' : 'Enter a valid number.';
      } else if (v < 0) {
        errors[key] = 'This amount cannot be negative.';
      } else {
        d[key] = v;
      }
      if (key === 'sellingPrice' && isFinite(v) && v <= 0 && !errors[key]) {
        errors[key] = 'Enter the price your customer pays (greater than $0).';
      }
    });

    var u = d.unitsSold;
    if (u === '' || !isFinite(u)) errors.unitsSold = 'Enter how many units you sold.';
    else if (u < 1) errors.unitsSold = 'Units sold must be at least 1.';
    else if (!Number.isInteger(u)) errors.unitsSold = 'Units must be a whole number.';
    else d.unitsSold = u;

    return errors;
  }

  function showErrors(errors) {
    $$('.field', $('#product-form')).forEach(function (field) {
      var key = field.getAttribute('data-field');
      var msg = errors[key] || '';
      field.classList.toggle('has-error', !!msg);
      var p = field.querySelector('[data-error="' + key + '"]');
      if (p) p.textContent = msg;
    });
  }

  function clearAllErrors() {
    $$('.field.has-error', $('#product-form')).forEach(function (field) {
      field.classList.remove('has-error');
      var p = field.querySelector('.field-error');
      if (p) p.textContent = '';
    });
  }

  function updateLivePreview() {
    var d = readForm();
    var moneyOk = ['purchaseCost', 'adCostPerSale', 'shippingCost', 'platformFees',
                   'discountPerSale', 'returnCostPerSale'].every(function (k) {
      return d[k] === '' || (isFinite(d[k]) && d[k] >= 0);
    });
    var valid = moneyOk &&
                isFinite(d.sellingPrice) && d.sellingPrice > 0 &&
                isFinite(d.unitsSold) && d.unitsSold >= 1 && Number.isInteger(d.unitsSold);

    if (!valid) {
      $('#lp-rows').innerHTML =
        '<div class="lp-row"><span>Revenue</span><span>\u2014</span></div>' +
        '<div class="lp-row"><span>Total cost</span><span>\u2014</span></div>' +
        '<div class="lp-row"><span>True profit</span><span>\u2014</span></div>' +
        '<div class="lp-row"><span>Profit per unit</span><span>\u2014</span></div>' +
        '<div class="lp-row"><span>Profit margin</span><span>\u2014</span></div>';
      $('#lp-status').innerHTML = '<p class="lp-hint">Enter a selling price and units sold to see the numbers.</p>';
      return;
    }

    var p = {
      sellingPrice: d.sellingPrice, purchaseCost: d.purchaseCost || 0,
      adCostPerSale: d.adCostPerSale || 0, shippingCost: d.shippingCost || 0,
      platformFees: d.platformFees || 0, discountPerSale: d.discountPerSale || 0,
      returnCostPerSale: d.returnCostPerSale || 0, unitsSold: d.unitsSold
    };
    var m = CALC.computeMetrics(p);
    var meta = STATUS_META[CALC.getStatus(m)];
    var cls = m.trueProfit < 0 ? 'text-neg' : 'text-pos';

    $('#lp-rows').innerHTML =
      '<div class="lp-row"><span>Revenue</span><span>' + fmtMoney(m.revenue) + '</span></div>' +
      '<div class="lp-row"><span>Total cost</span><span>\u2212' + fmtMoney(m.totalCost) + '</span></div>' +
      '<div class="lp-row lp-strong"><span>True profit</span><span class="' + cls + '">' + fmtMoney(m.trueProfit) + '</span></div>' +
      '<div class="lp-row"><span>Profit per unit</span><span class="' + cls + '">' + fmtMoney(m.profitPerUnit) + '</span></div>' +
      '<div class="lp-row"><span>Profit margin</span><span>' + fmtPct(m.profitMargin) + '</span></div>';
    $('#lp-status').innerHTML = '<span class="badge ' + meta.cls + '">' + meta.label + '</span>';
  }

  function onFormSubmit(e) {
    e.preventDefault();
    if (formLocked) return; // ignore rapid double-submits of the same save

    /* FREE plan guard (the form is normally hidden at the limit) */
    if (!state.editingId && !Plan.isPro() &&
        Plan.freeSlotsFor(state.products.length) <= 0) {
      toast('Free plan limit reached \u2014 upgrade to Pro to add more products.');
      location.hash = '#/pricing';
      return;
    }

    var d = readForm();
    var errors = validateForm(d);
    showErrors(errors);

    if (Object.keys(errors).length) {
      var first = $('#product-form .has-error input');
      if (first) first.focus();
      return;
    }

    if (state.editingId) {
      state.products.forEach(function (p) {
        if (p.id === state.editingId) Object.assign(p, d);
      });
      persist();
      toast('\u201C' + esc(d.name) + '\u201D updated \u2713');
    } else {
      state.products.push(Object.assign({ id: Store.uid(), createdAt: new Date().toISOString() }, d));
      persist();
      toast('\u201C' + esc(d.name) + '\u201D added \u2713');
    }
    formLocked = true; // one save per form visit — no duplicates
    location.hash = '#/dashboard';
  }

  /* =============================================================
     SMART PROFIT DIAGNOSIS + WHAT-IF SIMULATOR
     ============================================================= */
  var WI_FIELDS = [
    ['sellingPrice', 'Selling price'],
    ['purchaseCost', 'Purchase cost'],
    ['adCostPerSale', 'Advertising cost'],
    ['shippingCost', 'Shipping cost'],
    ['platformFees', 'Platform/payment fees'],
    ['discountPerSale', 'Discount'],
    ['returnCostPerSale', 'Return/refund cost']
  ];

  function wiNiceMax(v) { return Math.ceil(Math.max(v * 2, 1) * 10) / 10; }
  function wiStep(v) { return v >= 50 ? 1 : v >= 10 ? 0.5 : v >= 1 ? 0.1 : 0.05; }

  function renderDiagnosis(p, m) {
    var host = $('#diagnosis-section');
    var d = CALC.diagnose(p, m);
    var profitCls = m.trueProfit < 0 ? 'text-neg' : 'text-pos';

    /* --- top tiles: current profit / biggest leak / recommended action --- */
    var tiles =
      '<div class="diag-tile diag-current ' + (m.trueProfit < 0 ? 'diag-bad' : 'diag-good') + '">' +
        '<div class="diag-label">Current profit</div>' +
        '<div class="diag-value ' + profitCls + '">' + fmtMoney(m.trueProfit) + '</div>' +
        '<div class="diag-sub">' + fmtMoney(m.profitPerUnit) + ' per sale \u00B7 ' + fmtPct(m.profitMargin) +
          ' margin \u00B7 ' + m.units + ' units</div>' +
      '</div>';

    if (d.biggest) {
      tiles +=
        '<div class="diag-tile diag-leak">' +
          '<div class="diag-label">Biggest profit leak ' + helpBtn('leak') + '</div>' +
          '<div class="diag-value">' + esc(d.biggest.label) + '</div>' +
          '<div class="diag-sub">' + fmtMoney(d.biggest.perUnit) + ' per sale \u00B7 ' +
            CALC.pct(d.biggest.shareOfCosts) + ' of your total costs</div>' +
          helpBox('leak') +
        '</div>' +
        '<div class="diag-tile diag-action">' +
          '<div class="diag-label">Recommended action</div>' +
          '<div class="diag-value">' + esc(d.action.title) + '</div>' +
          '<div class="diag-sub">' + esc(d.action.detail) + '</div>' +
          (d.action.secondary ? '<div class="diag-secondary">' + esc(d.action.secondary) + '</div>' : '') +
        '</div>';
    } else {
      tiles +=
        '<div class="diag-tile diag-leak">' +
          '<div class="diag-label">Biggest profit leak</div>' +
          '<div class="diag-value">None</div>' +
          '<div class="diag-sub">No costs recorded for this product.</div>' +
        '</div>' +
        '<div class="diag-tile diag-action">' +
          '<div class="diag-label">Recommended action</div>' +
          '<div class="diag-value">' + esc(d.action.title) + '</div>' +
          '<div class="diag-sub">' + esc(d.action.detail) + '</div>' +
        '</div>';
    }

    /* --- what-if simulator rows --- */
    var wiRows = WI_FIELDS.map(function (f) {
      var v = p[f[0]];
      return '<div class="wi-row">' +
          '<div class="wi-info"><span class="wi-name">' + f[1] + '</span>' +
            '<span class="wi-current">currently ' + fmtMoney(v) + '</span></div>' +
          '<input type="range" class="wi-slider" data-wi-slider="' + f[0] +
            '" min="0" max="' + wiNiceMax(v) + '" step="' + wiStep(v) + '" value="' + v +
            '" aria-label="What-if: ' + f[1] + '">' +
          '<input type="number" class="wi-num" data-wi-num="' + f[0] +
            '" min="0" step="any" inputmode="decimal" value="' + v +
            '" aria-label="What-if ' + f[1] + ' new value">' +
        '</div>';
    }).join('');

    /* Pro sections are locked on the FREE plan */
    var pro = Plan.isPro();

    var rankSection = pro
      ? '<div class="rank-block">' +
          '<p class="rank-block-title">Cost ranking \u2014 highest to lowest</p>' +
          Charts.costRanking(p) +
        '</div>'
      : proLocked('Cost ranking is a Pro feature',
          'See all six costs ranked from highest to lowest \u2014 and find exactly where your money goes.');

    var wiSection = pro
      ? '<div class="wi-block">' +
          '<div class="wi-head">' +
            '<div>' +
              '<h3 class="wi-title">\u201CWhat if I change this?\u201D</h3>' +
              '<p class="card-sub">Move a slider or type a new number \u2014 the effect on your profit is calculated instantly. Nothing is saved until you press Apply.</p>' +
            '</div>' +
            '<div class="wi-buttons">' +
              '<button class="btn btn-ghost btn-sm" type="button" id="wi-reset">Reset</button>' +
              '<button class="btn btn-primary btn-sm" type="button" id="wi-apply">Apply to product</button>' +
            '</div>' +
          '</div>' +
          '<div class="wi-rows">' + wiRows + '</div>' +
          '<div class="wi-results" id="wi-results"></div>' +
        '</div>'
      : proLocked('The What-If Simulator is a Pro feature',
          'Change your price or any cost and instantly see the profit impact \u2014 before you touch anything real.');

    var goalSection = pro
      ? '<div class="goal-block">' +
          '<div class="goal-head">' +
            '<label for="goal-input">\uD83C\uDFAF Profit goal \u2014 I want to earn</label>' +
            '<span class="goal-input-wrap">' +
              '<span class="goal-currency">$</span>' +
              '<input type="number" id="goal-input" min="0" step="any" inputmode="decimal" placeholder="2.00" aria-label="Target profit per sale">' +
              '<span class="goal-per">per sale</span>' +
            '</span>' +
          '</div>' +
          '<div class="goal-out" id="goal-out"></div>' +
        '</div>'
      : proLocked('The Profit Goal planner is a Pro feature',
          'Set a target profit per sale and get the exact price or cost cut that reaches it.');

    host.innerHTML =
      '<div class="card diagnosis-card">' +
        '<div class="diag-head">' +
          '<h2 class="card-title"><span class="diag-icon" aria-hidden="true">\uD83D\uDD0D</span> Smart Profit Diagnosis</h2>' +
          '<p class="card-sub">An automatic analysis of where your profit is going \u2014 calculated only from the numbers you entered.</p>' +
        '</div>' +
        '<div class="diag-grid">' + tiles + '</div>' +
        '<p class="diag-sentence">' + esc(d.sentence) + '</p>' +
        rankSection + wiSection + goalSection +
      '</div>';

    if (pro) {
      wireWhatIf(p);
      wireGoal(p, m);
    }
  }

  /* ---------- profit goal finder ---------- */
  function wireGoal(p, m) {
    var input = $('#goal-input');
    var out = $('#goal-out');

    function recalc() {
      var t = parseFloat(input.value);
      /* a goal must be a positive amount: $0 or negative is meaningless AND
         goalPlan() returns null for targets <= 0 (previously crashed recalc) */
      if (input.value === '' || !isFinite(t) || t <= 0) {
        out.innerHTML = '<p class="goal-hint">Type a target profit per sale \u2014 we\u2019ll show the exact price or cost cut that reaches it.</p>';
        return;
      }
      var g = CALC.goalPlan(p, m, t);
      if (g.met) {
        out.innerHTML = '<p class="goal-met">\u2705 You already earn <strong>' + fmtMoney(g.current) +
          '</strong> per sale \u2014 above your ' + fmtMoney(g.target) + ' goal. No changes needed.</p>';
        return;
      }
      var html = '<p>To reach <strong>' + fmtMoney(g.target) + ' per sale</strong> you need <strong>+' +
        fmtMoney(g.gap) + ' per sale</strong>. ' +
        (g.canCut ? 'Two ways to get there:' :
          'Even with <strong>all costs at $0.00</strong>, your current price only earns ' +
          fmtMoney(p.sellingPrice) + ' per sale, so:') + '</p>';
      html += '<ul class="goal-ways">';
      html += '<li>\uD83D\uDCB0 Raise your selling price to <strong>' + fmtMoney(g.requiredPrice) +
        '</strong> (currently ' + fmtMoney(p.sellingPrice) + ')</li>';
      if (g.canCut) {
        if (g.big && g.big.perUnit >= g.gap) {
          html += '<li>\u2702\uFE0F Cut total costs by <strong>' + fmtMoney(g.gap) +
            ' per sale</strong> \u2014 for example your biggest cost (' + esc(g.big.label) + ', ' +
            fmtMoney(g.big.perUnit) + '/sale) would drop to <strong>' + fmtMoney(g.big.perUnit - g.gap) + '</strong></li>';
        } else if (g.big) {
          html += '<li>\u2702\uFE0F Cut total costs by <strong>' + fmtMoney(g.gap) +
            ' per sale</strong> \u2014 your biggest cost (' + esc(g.big.label) + ', ' + fmtMoney(g.big.perUnit) +
            '/sale) isn\u2019t big enough on its own, so combine several costs</li>';
        } else {
          html += '<li>\u2702\uFE0F Cut total costs by <strong>' + fmtMoney(g.gap) + ' per sale</strong></li>';
        }
      }
      html += '</ul>';
      out.innerHTML = html;
    }

    input.addEventListener('input', recalc);
    recalc();
  }

  function wireWhatIf(p) {
    var sliders = {}, nums = {};
    WI_FIELDS.forEach(function (f) {
      sliders[f[0]] = $('#diagnosis-section [data-wi-slider="' + f[0] + '"]');
      nums[f[0]] = $('#diagnosis-section [data-wi-num="' + f[0] + '"]');
    });

    function readChanges() {
      var c = {};
      WI_FIELDS.forEach(function (f) {
        var raw = parseFloat(nums[f[0]].value);
        c[f[0]] = isFinite(raw) && raw >= 0 ? raw : p[f[0]];
      });
      return c;
    }

    function recalc() {
      var r = CALC.simulate(p, readChanges());
      var m = r.metrics;
      var meta = STATUS_META[CALC.getStatus(m)];
      var cls = m.trueProfit < 0 ? 'text-neg' : 'text-pos';
      var diff = r.diffTotal;

      var verdict;
      if (diff > 0.004) {
        verdict = '<div class="wi-verdict wi-verdict-pos">\u25B2 This change <strong>improves</strong> your profit by ' +
                  fmtMoney(diff) + '</div>';
      } else if (diff < -0.004) {
        verdict = '<div class="wi-verdict wi-verdict-neg">\u25BC This change <strong>reduces</strong> your profit by ' +
                  fmtMoney(-diff) + ' \u2014 think twice before doing this.</div>';
      } else {
        verdict = '<div class="wi-verdict wi-verdict-neutral">No change yet \u2014 move a slider or type a new number to see what happens.</div>';
      }

      $('#wi-results').innerHTML =
        '<div class="wi-res-tile"><div class="wi-res-label">New profit per unit</div>' +
          '<div class="wi-res-value ' + cls + '">' + fmtMoney(m.profitPerUnit) + '</div></div>' +
        '<div class="wi-res-tile"><div class="wi-res-label">New total profit</div>' +
          '<div class="wi-res-value ' + cls + '">' + fmtMoney(m.trueProfit) + '</div></div>' +
        '<div class="wi-res-tile"><div class="wi-res-label">New profit margin</div>' +
          '<div class="wi-res-value">' + fmtPct(m.profitMargin) + '</div></div>' +
        '<div class="wi-res-tile"><div class="wi-res-label">Difference from current profit</div>' +
          '<div class="wi-res-value ' + (diff > 0.004 ? 'text-pos' : diff < -0.004 ? 'text-neg' : '') + '">' +
          (diff > 0.004 ? '+' : '') + fmtMoney(diff) + '</div></div>' +
        '<div class="wi-res-tile"><div class="wi-res-label">New status</div>' +
          '<div class="wi-res-badge"><span class="badge ' + meta.cls + '">' + meta.label + '</span></div></div>' +
        verdict;
    }

    WI_FIELDS.forEach(function (f) {
      var key = f[0];
      sliders[key].addEventListener('input', function () {
        nums[key].value = sliders[key].value;
        recalc();
      });
      nums[key].addEventListener('input', function () {
        var v = parseFloat(nums[key].value);
        if (!isFinite(v) || v < 0) return; // wait for a valid, non-negative number
        if (v > parseFloat(sliders[key].max)) sliders[key].max = String(v);
        sliders[key].value = String(v);
        recalc();
      });
    });

    $('#wi-reset').addEventListener('click', function () {
      WI_FIELDS.forEach(function (f) {
        var key = f[0];
        sliders[key].max = String(wiNiceMax(p[key]));
        sliders[key].value = String(p[key]);
        nums[key].value = String(p[key]);
      });
      recalc();
    });

    $('#wi-apply').addEventListener('click', function () {
      var changes = readChanges();
      var changed = WI_FIELDS.some(function (f) {
        return Math.abs(changes[f[0]] - p[f[0]]) > 1e-9;
      });
      if (!changed) {
        toast('No changes to apply \u2014 these numbers already match your product.');
        return;
      }
      WI_FIELDS.forEach(function (f) { p[f[0]] = CALC.round2(changes[f[0]]); });
      persist();
      renderAnalysis(p.id); // re-render everything with the new baseline
      toast('Simulation applied to \u201C' + esc(p.name) + '\u201D \u2713');
    });

    recalc(); // initial "no change yet" state
  }

  /* =============================================================
     PRODUCT ANALYSIS PAGE
     ============================================================= */
  function renderAnalysis(id) {
    var p = null;
    state.products.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return false;

    var m = CALC.computeMetrics(p);
    var meta = STATUS_META[CALC.getStatus(m)];
    var issues = CALC.detectIssues(p, m);
    var recs = CALC.buildRecommendations(p, m, issues);

    /* --- header --- */
    $('#analysis-head').innerHTML =
      '<a class="back-link" href="#/dashboard">\u2190 All products</a>' +
      '<div class="an-head-main">' +
        '<div>' +
          '<h1>' + esc(p.name) + (Store.isDemoProduct(p) ? ' <span class="badge badge-demo">Demo Data</span>' : '') + '</h1>' +
          '<p class="analysis-meta">' + m.units + ' units sold \u00B7 ' + fmtMoney(p.sellingPrice) + ' selling price</p>' +
        '</div>' +
        '<div class="an-head-actions">' +
          '<span class="badge ' + meta.cls + '">' + meta.label + '</span>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-id="' + esc(p.id) + '">Edit</button>' +
          '<button class="btn btn-ghost btn-sm danger-text" type="button" data-action="delete" data-id="' + esc(p.id) + '">Delete</button>' +
        '</div>' +
      '</div>';

    /* --- headline stats --- */
    function stat(label, value, sub, cls) {
      return '<div class="stat-tile' + (cls ? ' ' + cls : '') + '">' +
               '<div class="stat-label">' + label + '</div>' +
               '<div class="stat-value">' + value + '</div>' +
               '<div class="stat-sub">' + sub + '</div>' +
             '</div>';
    }
    var profitCls = m.trueProfit < 0 ? 'text-neg' : 'text-pos';
    var big = CALC.biggestCost(p);
    var statsHtml =
      stat('True profit', '<span class="' + profitCls + '">' + fmtMoney(m.trueProfit) + '</span>',
           'revenue \u2212 all costs', m.trueProfit < 0 ? 'stat-red' : 'stat-green') +
      stat('Profit per unit', '<span class="' + profitCls + '">' + fmtMoney(m.profitPerUnit) + '</span>',
           'per single sale', m.trueProfit < 0 ? 'stat-red' : 'stat-green') +
      stat('Profit margin', fmtPct(m.profitMargin), 'true profit \u00F7 revenue') +
      stat('Break-even price', fmtMoney(m.totalCostPerUnit), 'price that covers all costs');
    if (big) {
      statsHtml += stat('Biggest cost', fmtMoney(big.perUnit),
                        big.label + ' \u00B7 ' + CALC.pct(big.shareOfPrice) + ' of price');
    }
    $('#analysis-stats').innerHTML = statsHtml;

    /* --- smart profit diagnosis + what-if simulator --- */
    renderDiagnosis(p, m);

    /* --- the numbers table --- */
    function pctOfRev(v) { return m.revenue > 0 ? fmtPct(v / m.revenue * 100, 0) : '\u2014'; }
    var rowsHtml = CALC.costBreakdown(p).map(function (c) {
      return '<tr><td>' + c.label + '</td>' +
        '<td class="num" data-label="Total">\u2212' + fmtMoney(c.total) + '</td>' +
        '<td class="num" data-label="Per unit">\u2212' + fmtMoney(c.perUnit) + '</td>' +
        '<td class="num" data-label="% of revenue">' + pctOfRev(c.total) + '</td></tr>';
    }).join('');

    $('#analysis-numbers').innerHTML =
      '<table class="numbers-table">' +
        '<thead><tr><th scope="col">Item</th><th scope="col" class="num">Total</th>' +
        '<th scope="col" class="num">Per unit</th><th scope="col" class="num">% of revenue</th></tr></thead>' +
        '<tbody>' +
          '<tr class="rev-row"><td>Revenue</td><td class="num" data-label="Total">' + fmtMoney(m.revenue) + '</td>' +
            '<td class="num" data-label="Per unit">' + fmtMoney(p.sellingPrice) + '</td><td class="num" data-label="% of revenue">100%</td></tr>' +
          rowsHtml +
          '<tr class="total-row"><td>Total cost</td><td class="num" data-label="Total">\u2212' + fmtMoney(m.totalCost) + '</td>' +
            '<td class="num" data-label="Per unit">\u2212' + fmtMoney(m.totalCostPerUnit) + '</td><td class="num" data-label="% of revenue">' + pctOfRev(m.totalCost) + '</td></tr>' +
          '<tr class="profit-row"><td>True profit</td><td class="num" data-label="Total"><strong class="' + profitCls + '">' + fmtMoney(m.trueProfit) + '</strong></td>' +
            '<td class="num" data-label="Per unit"><strong class="' + profitCls + '">' + fmtMoney(m.profitPerUnit) + '</strong></td>' +
            '<td class="num" data-label="% of revenue"><strong>' + fmtPct(m.profitMargin) + '</strong></td></tr>' +
        '</tbody>' +
      '</table>';

    /* --- unit economics bar --- */
    $('#analysis-bar').innerHTML = Charts.unitBar(p, m);

    /* --- where are you losing money? --- */
    if (issues.length) {
      $('#analysis-issues').innerHTML = issues.map(function (i) {
        var cls = i.severity === 'danger' ? 'finding-danger' : 'finding-warn';
        return '<div class="finding ' + cls + '">' +
                 '<span class="finding-icon" aria-hidden="true">' + (ISSUE_ICONS[i.type] || '\u26A0\uFE0F') + '</span>' +
                 '<div><h3>' + esc(i.title) + '</h3><p>' + esc(i.detail) + '</p></div>' +
               '</div>';
      }).join('');
    } else {
      $('#analysis-issues').innerHTML =
        '<div class="finding finding-ok">' +
          '<span class="finding-icon" aria-hidden="true">\u2705</span>' +
          '<div><h3>No leaks detected</h3><p>All costs are within healthy limits. This product keeps a ' +
          fmtPct(m.profitMargin) + ' margin after every single cost.</p></div>' +
        '</div>';
    }

    /* --- what should you change? --- */
    $('#analysis-recs').innerHTML = recs.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('');

    return true;
  }

  /* =============================================================
     ACTIONS — delete / samples / clear all (with undo + confirm)
     ============================================================= */
  function requestDelete(id) {
    var p = null;
    state.products.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return;

    confirmDialog({
      title: 'Delete \u201C' + p.name + '\u201D?',
      message: 'This removes the product from your dashboard. You can undo it right after deleting.',
      confirmText: 'Delete',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      var snapshot = state.products.slice();
      state.products = state.products.filter(function (x) { return x.id !== id; });
      persist();

      var route = parseRoute();
      if (route.page === 'analysis' && route.id === id) {
        location.hash = '#/dashboard'; // triggers render via hashchange
      } else {
        render();
      }
      toast('\u201C' + esc(p.name) + '\u201D deleted', {
        actionLabel: 'Undo',
        onAction: function () {
          state.products = snapshot;
          persist();
          render();
          toast('Restored \u2713');
        }
      });
    });
  }

  function loadSamplesFlow() {
    var hasDemo = state.products.some(Store.isDemoProduct);
    var hasOwn = state.products.some(function (p) { return !Store.isDemoProduct(p); });
    var proceed = Promise.resolve(true);

    if (hasDemo) {
      proceed = confirmDialog({
        title: 'Reload demo data?',
        message: 'This replaces the current demo products with a fresh set. Your own products stay untouched.',
        confirmText: 'Reload demo'
      });
    } else if (hasOwn) {
      proceed = confirmDialog({
        title: 'Add demo data?',
        message: 'This adds demo products alongside your current ones, so you can explore how ProfitLeak AI works. Remove them anytime with \u201CClear Demo Data\u201D \u2014 your own products are never touched.',
        confirmText: 'Add demo data'
      });
    }

    proceed.then(function (ok) {
      if (!ok) return;
      state.products = state.products
        .filter(function (p) { return !Store.isDemoProduct(p); })
        .concat(Store.samplesForPlan());
      persist();
      render();
      toast('Demo data loaded \u2713 \u2014 explore freely, then clear it anytime.');
    });
  }

  function clearDemoFlow() {
    var demo = state.products.filter(Store.isDemoProduct);
    if (!demo.length) {
      toast('No demo data to clear.');
      return;
    }
    confirmDialog({
      title: 'Clear demo data?',
      message: 'This removes the ' + demo.length + ' demo product' + (demo.length > 1 ? 's' : '') +
               '. Your own products stay untouched.',
      confirmText: 'Clear Demo Data',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      var snapshot = state.products.slice();
      state.products = state.products.filter(function (p) { return !Store.isDemoProduct(p); });
      persist();
      render();
      toast('Demo data cleared \u2713', {
        actionLabel: 'Undo',
        onAction: function () {
          state.products = snapshot;
          persist();
          render();
          toast('Restored \u2713');
        }
      });
    });
  }

  function clearAllFlow() {
    confirmDialog({
      title: 'Clear all products?',
      message: 'This removes every product from your dashboard. You can undo it right after.',
      confirmText: 'Clear all',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      var snapshot = state.products.slice();
      state.products = [];
      persist();
      try { Store.markOnboarded(); } catch (e) { /* never a new visitor again after clearing */ }
      render();
      /* v1.20: for a locked visitor the payment popup pops right after clearing —
         clearing data can never become a way back to free attempts */
      if (trialGateEngaged()) showTrialPaywall();
      toast('All products cleared', {
        actionLabel: 'Undo',
        onAction: function () {
          state.products = snapshot;
          persist();
          render();
          toast('Restored \u2713');
        }
      });
    });
  }

  /* =============================================================
     CSV EXPORT / IMPORT
     ============================================================= */
  function exportCsv() {
    if (!requireProForFiles('CSV export')) return;
    if (!state.products.length) {
      toast('Add a product first \u2014 there is nothing to export yet.');
      return;
    }
    downloadCsvFile('profitleak-products.csv', CSV.toCsv(state.products));
    toast('Exported ' + state.products.length + ' product(s) to CSV \u2713');
  }

  function downloadCsvFile(fileName, csvText) {
    var a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvText);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /* Example file with the exact column names the importer expects */
  function downloadCsvTemplate() {
    if (!requireProForFiles('The CSV template')) return;
    var template = CSV.toCsv([
      { name: 'Example: Wireless Earbuds', sellingPrice: 49.99, purchaseCost: 18.50,
        adCostPerSale: 6.00, shippingCost: 4.50, platformFees: 7.00,
        discountPerSale: 2.00, returnCostPerSale: 1.50, unitsSold: 320 },
      { name: 'Example: Cotton T-Shirt (costs can be 0)', sellingPrice: 19.00, purchaseCost: 6.50,
        adCostPerSale: 3.20, shippingCost: 3.80, platformFees: 2.85,
        discountPerSale: 0, returnCostPerSale: 0.60, unitsSold: 150 }
    ]);
    downloadCsvFile('profitleak-template.csv', template);
    toast('Template downloaded \u2014 fill in your products and import it back \u2713');
  }

  /* ---------- import preview modal ---------- */
  var pendingImport = [];
  var importKeydown = null;

  function closeImportPreview() {
    $('#import-overlay').hidden = true;
    document.body.classList.remove('modal-open');
    if (importKeydown) {
      document.removeEventListener('keydown', importKeydown);
      importKeydown = null;
    }
    pendingImport = [];
  }

  function errorsHtml(errors) {
    return '<div class="imp-errors"><p class="imp-errors-title">' + errors.length +
      ' row(s) will be skipped:</p><ul>' +
      errors.map(function (er) {
        return '<li><span class="imp-row">Row ' + er.row + '</span>' +
          (er.name ? ' \u201C' + esc(er.name) + '\u201D' : '') +
          ' \u2014 ' + esc(er.reason) + '</li>';
      }).join('') + '</ul></div>';
  }

  function openImportPreview(res, fileName) {
    var overlay = $('#import-overlay');
    var confirmBtn = $('#import-confirm');
    pendingImport = [];

    if (res.missingColumns) {
      /* header row lacks required columns */
      $('#import-summary').innerHTML =
        '<span class="imp-bad">\u26A0\uFE0F This file is missing required columns: <strong>' +
        esc(res.missingColumns.join(', ')) + '</strong></span>';
      $('#import-body').innerHTML =
        '<div class="imp-notice imp-notice-red">' +
          '<p>Your CSV needs a header row (the first line) with at least these columns:</p>' +
          '<p><strong>' + esc(res.missingColumns.join(' \u00B7 ')) + '</strong></p>' +
          '<p>Tip: download our template to see the exact column names \u2014 then paste your data underneath.</p>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-action="csv-template" title="Pro feature \u2014 upgrade to unlock">Download CSV template \uD83D\uDD12</button>' +
        '</div>';
      confirmBtn.disabled = true;
    } else if (!res.products.length) {
      $('#import-summary').innerHTML =
        '<span class="imp-bad">\u26A0\uFE0F No valid products found in \u201C' + esc(fileName) + '\u201D</span>';
      $('#import-body').innerHTML = res.errors.length ? errorsHtml(res.errors) :
        '<div class="imp-notice imp-notice-red"><p>The file appears to be empty. Check it and try again.</p></div>';
      confirmBtn.disabled = true;
    } else {
      /* preview table of valid products */
      var slots = Plan.freeSlotsFor(state.products.length);
      var importable = Math.min(res.products.length, slots);
      var capped = importable < res.products.length;

      var rows = res.products.map(function (p) {
        var m = CALC.computeMetrics(p);
        var meta = STATUS_META[CALC.getStatus(m)];
        var cls = m.trueProfit < 0 ? 'text-neg' : 'text-pos';
        return '<tr>' +
          '<td>' + esc(p.name) + '</td>' +
          '<td class="num">' + fmtMoney(p.sellingPrice) + '</td>' +
          '<td class="num">' + p.unitsSold + '</td>' +
          '<td class="num"><strong class="' + cls + '">' + fmtMoney(m.trueProfit) + '</strong></td>' +
          '<td><span class="badge ' + meta.cls + '">' + meta.label + '</span></td>' +
        '</tr>';
      }).join('');

      var html =
        '<div class="imp-table-wrap"><table class="imp-table">' +
          '<thead><tr><th>Product</th><th class="num">Price</th><th class="num">Units</th>' +
          '<th class="num">True profit</th><th>Status</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>';

      if (capped) {
        html += '<div class="imp-notice imp-notice-amber">' +
          (importable > 0
            ? '<p><strong>Free plan:</strong> only ' + importable + ' of ' + res.products.length +
              ' products will be imported \u2014 your plan is nearly full. ' +
              '<a href="#/pricing" data-close-import>Upgrade to Pro</a> for unlimited imports.</p>'
            : '<p><strong>Free plan is full (' + Plan.freeLimit() + ' of ' + Plan.freeLimit() +
              ' products).</strong> <a href="#/pricing" data-close-import>Upgrade to Pro</a> to import these products.</p>') +
        '</div>';
      }
      if (res.errors.length) html += errorsHtml(res.errors);

      $('#import-summary').innerHTML =
        '<span class="imp-good">\u2705 ' + res.products.length + ' valid product(s) found in \u201C' +
        esc(fileName) + '\u201D</span>' +
        (res.errors.length
          ? ' <span class="imp-bad">\u00B7 ' + res.errors.length + ' row(s) with problems</span>'
          : '');

      $('#import-body').innerHTML = html;
      confirmBtn.disabled = importable <= 0;
      if (importable > 0) pendingImport = res.products.slice(0, importable);
    }

    overlay.hidden = false;
    document.body.classList.add('modal-open');
    importKeydown = function (e) { if (e.key === 'Escape') closeImportPreview(); };
    document.addEventListener('keydown', importKeydown);
    if (!confirmBtn.disabled) confirmBtn.focus();
  }

  function importCsvText(text, fileName) {
    openImportPreview(CSV.fromCsv(text), fileName);
  }

  function onImportConfirm() {
    if (!pendingImport.length) return;
    var n = pendingImport.length;
    state.products = state.products.concat(pendingImport);
    persist();
    closeImportPreview();
    render(); // refreshes KPIs, alerts, charts, table, banners
    toast('Imported ' + n + ' product(s) \u2713');
  }

  function onCsvFileChosen(e) {
    if (!requireProForFiles('CSV import')) { e.target.value = ''; return; }
    var input = e.target;
    var file = input.files && input.files[0];
    input.value = ''; // allow re-choosing the same file
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { importCsvText(String(reader.result), file.name); };
    reader.onerror = function () { toast('Could not read the file. Please try again.'); };
    reader.readAsText(file);
  }

  /* =============================================================
     PLAN (FREE / PRO) — nav, banner, pricing page, upgrade dialog
     ============================================================= */
  function renderPlanNav() {
    var host = $('#plan-nav');
    if (!host) return;
    host.innerHTML = Plan.isPro()
      ? '<span class="pro-badge" title="' + (Plan.hasLicense() ? 'Pro licensed \u2014 manage in Pricing' : 'Pro \u2014 manage in Pricing') + '">PRO</span>'
      : '<a class="btn btn-gold btn-sm" href="#/pricing">\u26A1 Upgrade to Pro</a>';
  }

  function renderPlanBanner() {
    var host = $('#plan-banner');
    if (!host) return;
    if (Plan.isPro()) { host.hidden = true; host.innerHTML = ''; return; }
    var n = state.products.length;
    var limit = Plan.freeLimit();
    var usage = n > limit
      ? n + ' products \u2014 over the free limit (everything stays safe)'
      : n + ' of ' + limit + ' products used';
    host.hidden = false;
    host.innerHTML =
      '<div class="free-banner">' +
        '<div class="fb-text"><strong>\u26A1 Free plan</strong> \u00B7 ' + usage +
        ' \u2014 Pro adds unlimited products, the What-If Simulator and cost ranking.</div>' +
        '<a class="btn btn-light btn-sm" href="#/pricing">Upgrade to Pro</a>' +
      '</div>';
  }

  /* Reusable locked panel shown to free users where Pro features live */
  function proLocked(title, desc) {
    return '<div class="pro-locked">' +
             '<div class="pro-locked-icon" aria-hidden="true">\uD83D\uDD12</div>' +
             '<div class="pro-locked-body">' +
               '<h3>' + title + '</h3>' +
               '<p>' + desc + '</p>' +
               '<a class="btn btn-primary btn-sm" href="#/pricing">Upgrade to Pro</a>' +
             '</div>' +
           '</div>';
  }

  function renderPricing() {
    var hadPlans = !!PLANS_CACHE;
    if (!hadPlans) fetchPlans().then(function (d) {
      if (d && parseRoute().page === 'pricing') render(); /* got plans \u2192 re-render with the new UI */
    });
    if (PLANS_CACHE) setTimeout(function () { try { applyPlanUI(); } catch (e) { /* cosmetic only */ } }, 0);
    var pro = Plan.isPro();

    var freeFeats = [
      ['check', 'One full free session (up to 3 products)'],
      ['check', 'True profit calculator \u2014 every cost counted'],
      ['check', 'Basic profit diagnosis \u2014 biggest leak + action'],
      ['check', 'Dashboard, product table & status filters'],
      ['check', 'CSV export & import'],
      ['check', 'Your data stays in your browser']
    ];
    var proFeats = [
      ['check', 'Unlimited products'],
      ['check', 'Advanced profit diagnosis'],
      ['check', 'What-if simulator \u2014 test any change safely'],
      ['check', 'Cost ranking \u2014 all six costs, biggest first'],
      ['check', 'Profit goal planner \u2014 \u201Cwhat do I need to earn $X?\u201D'],
      ['check', 'Advanced recommendations'],
      ['soon', 'Amazon \u00B7 eBay \u00B7 Shopify integrations'],
      ['check', 'Priority support']
    ];

    function featList(feats) {
      return '<ul class="price-feats">' + feats.map(function (f) {
        if (f[0] === 'soon') {
          return '<li><span class="feat-soon">soon</span><span>' + f[1] + '</span></li>';
        }
        return '<li><span class="feat-check" aria-hidden="true">\u2713</span><span>' + f[1] + '</span></li>';
      }).join('') + '</ul>';
    }

    var freeBtn = pro
      ? '<a class="btn btn-ghost btn-lg" href="#/dashboard">Back to dashboard</a>'
      : '<span class="badge badge-green">Your current plan</span>';

    var licensed = Plan.hasLicense();
    var proBtn;
    if (pro && licensed) {
      var licInfo = License.getLicense();
      proBtn = '<div class="pro-active-box"><span class="badge badge-green">\u2713 Pro licensed \u2014 thank you!</span>' +
        (licInfo && licInfo.expiresAt ? '<div class="price-note">Active until <b>' + esc(licInfo.expiresAt.slice(0, 10)) + '</b> \u2014 <a href="' + CHECKOUT + 'paypal&plan=yearly" target="_blank" rel="noopener">renew</a></div>' : '<div class="price-note">Lifetime license \u2014 early buyer, thank you!</div>') +
        '<button type="button" class="link-btn" data-action="license-remove">Remove license</button></div>';
    } else if (!pro && PLANS_CACHE) {
      proBtn = '<div class="plan-toggle" role="tablist">' +
          '<button type="button" class="plan-opt" data-plan="monthly" role="tab">Monthly</button>' +
          '<button type="button" class="plan-opt active" data-plan="yearly" role="tab">Yearly <span class="plan-save">best value</span></button>' +
        '</div>' +
        '<div class="plan-price" id="plan-price">$' + PLANS_CACHE.plans.yearly.price.toFixed(2) + ' / year</div>' +
        '<a class="btn btn-light btn-lg" data-pay="paypal" href="' + CHECKOUT + 'paypal&plan=yearly" target="_blank" rel="noopener">Subscribe \u2014 PayPal \u00B7 Visa \u00B7 Mastercard</a>' +
        '<a class="btn btn-ghost btn-lg" data-pay="crypto" href="' + CHECKOUT + 'crypto&plan=yearly" target="_blank" rel="noopener">Pay with Crypto \u2014 BTC, USDT &amp; 100+</a>' +
        '<p class="price-note">No auto-charge \u2014 pay once per period, cancel by simply not renewing. Your data stays in your browser forever.</p>';
    } else if (License && License.isConfigured()) {
      proBtn = '<a class="btn btn-light btn-lg" href="' + esc(License.buyUrl()) + '" target="_blank" rel="noopener">Buy Pro \u2014 $19 one-time</a>' +
        '<p class="price-note">Gumroad checkout \u00B7 license key delivered instantly by email</p>' +
        '<div class="pay-opts">' +
          '<a href="' + CHECKOUT + 'paypal" target="_blank" rel="noopener">PayPal \u00B7 Visa \u00B7 Mastercard</a>' +
          '<a href="' + CHECKOUT + 'crypto" target="_blank" rel="noopener">Crypto \u2014 BTC, USDT &amp; 100+</a>' +
        '</div>';
    } else {
      proBtn = '<button type="button" class="btn btn-light btn-lg" data-action="upgrade">Upgrade to Pro \u2014 $19 one-time</button>' +
        '<p class="price-note">One-time payment \u00B7 secure checkout via Gumroad</p>';
    }

    /* activate-a-license box (only once the store is connected) */
    var licenseBox = '';
    if (License && License.isConfigured() && !pro) {
      licenseBox = '<div class="license-box">' +
          '<div class="license-title">Already bought? Activate your Pro license</div>' +
          '<div class="license-row">' +
            '<input id="license-input" type="text" placeholder="Paste the license key from your purchase email" aria-label="License key" autocomplete="off">' +
            '<button class="btn btn-primary btn-sm" type="button" data-action="license-activate" id="license-activate-btn">Activate</button>' +
          '</div>' +
          '<div class="license-error" id="license-error" hidden></div>' +
        '</div>';
    }

    $('#pricing-body').innerHTML =
      '<div class="pricing-grid">' +
        '<div class="price-card">' +
          '<div class="price-name">FREE</div>' +
          '<div class="price-value">$0</div>' +
          '<p class="price-tag">Your first session \u2014 free</p>' +
          featList(freeFeats) +
          '<div class="price-actions">' + freeBtn + '</div>' +
        '</div>' +
        '<div class="price-card price-card-pro">' +
          '<div class="price-ribbon">Most popular</div>' +
          '<div class="price-name">PRO</div>' +
          '<div class="price-value">$19<small> one-time</small></div>' +
          '<p class="price-tag">For serious online sellers</p>' +
          featList(proFeats) +
          '<div class="price-actions">' + proBtn + '</div>' +
          licenseBox +
        '</div>' +
      '</div>' +
      '<p class="pricing-trust">One-time payment \u00B7 Card, PayPal &amp; crypto on site \u00B7 Refunds via Gumroad \u00B7 Your data never leaves your browser</p>';
  }

  /* ---------- paid license activation (v1.8) ---------- */
  function activateLicenseFlow() {
    var input = $('#license-input');
    var btn = $('#license-activate-btn');
    var err = $('#license-error');
    if (!input || !btn) return;
    if (err) { err.hidden = true; }
    if (input.value.trim().toUpperCase() === 'FREEYEAR') {
      btn.disabled = true; btn.textContent = 'Checking\u2026';
      fetch(REDEEM_EP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'FREEYEAR' }) })
        .then(function (r) { return r.json(); }).then(function (d) {
          btn.disabled = false; btn.textContent = 'Activate';
          if (d && d.success) { input.value = d.key; activateLicenseFlow(); }
          else if (err) { err.textContent = (d && d.reason) || 'Code not available.'; err.hidden = false; }
        }).catch(function () { btn.disabled = false; btn.textContent = 'Activate'; if (err) { err.textContent = 'Connection problem \u2014 try again.'; err.hidden = false; } });
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Verifying\u2026';
    License.activate(input.value).then(function (r) {
      btn.disabled = false;
      btn.textContent = 'Activate';
      if (r.ok) {
        toast('Pro activated \u2014 welcome aboard, and thank you! \uD83C\uDF89');
        render();
      } else {
        if (err) { err.textContent = r.reason; err.hidden = false; }
        input.focus();
      }
    });
  }

  /* =============================================================
     FREE-TRIAL PAYWALL (v1.9)
     Shown when the one free session is over and no license is
     active. Offers the buy link + instant license activation.
     ============================================================= */
  function trialGateEngaged() {
    if (!Trial || !License || !License.isConfigured()) return false;
    Trial.evaluate(); /* refresh: the session may have ended since the last render */
    return Trial.isLocked();
  }

  function showTrialPaywall() {
    var ov = $('#trial-overlay');
    if (!ov) return;
    var buy = $('#trial-buy');
    if (buy && License && License.buyUrl) buy.href = License.buyUrl();
    var ppo = $('#trial-paypal'), cpo = $('#trial-crypto');
    if (ppo) ppo.href = CHECKOUT + 'paypal&plan=yearly';
    if (cpo) cpo.href = CHECKOUT + 'crypto&plan=yearly';
    var n = state.products.length;
    /* v1.16: once the visitor has used their email bonus, the popup is buy-only */
    var usedEmail = (Trial && Trial.getEmail) ? Trial.getEmail() : '';
    var emailBox = document.querySelector('.trial-email');
    if (emailBox) emailBox.hidden = !!usedEmail;
    $('#trial-text').textContent = usedEmail
      ? (n > 0
          ? 'You have used your free session and your 2 bonus sessions. Your ' + n +
            (n === 1 ? ' product' : ' products') + ' and every calculation are saved in this browser \u2014 ready the moment you activate Pro.'
          : 'You have used your free session and your 2 bonus sessions. Activate Pro to keep analyzing your true profit \u2014 every feature, unlimited products, lifetime license.')
      : (n > 0
          ? 'You explored ProfitLeak AI with your free session. Your ' + n +
            (n === 1 ? ' product' : ' products') + ' and every calculation are saved in this browser \u2014 ready the moment you activate Pro.'
          : 'You explored ProfitLeak AI with your free session. Activate Pro to keep analyzing your true profit \u2014 every feature, unlimited products, lifetime license.');
    ov.hidden = false;
    document.body.classList.add('modal-open');
    var wo = $('#welcome-overlay');
    if (wo) wo.hidden = true;
  }

  function hideTrialPaywall() {
    var ov = $('#trial-overlay');
    if (!ov || ov.hidden) return;
    ov.hidden = true;
    var anyOpen = ['#modal-overlay', '#import-overlay', '#welcome-overlay'].some(function (s) {
      var el = $(s); return el && !el.hidden;
    });
    if (!anyOpen) document.body.classList.remove('modal-open');
  }

  /* email signup: 2 extra free sessions (v1.11) */
  function trialEmailFlow() {
    var input = $('#trial-email-input');
    var btn = $('#trial-email-btn');
    var err = $('#trial-email-error');
    if (!input || !btn) return;
    if (err) { err.hidden = true; }
    var email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      if (err) { err.textContent = 'Please enter a valid email address.'; err.hidden = false; }
      input.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = '\u2026';
    fetch(EMAIL_EP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    }).then(function (r) { return r.json(); }).then(function (d) {
      btn.disabled = false;
      btn.textContent = 'Send';
      if (d && d.success && Trial) {
        Trial.grantEmailSessions(email, d.extraSessions || 2);
        toast('2 extra free sessions unlocked \u2713');
        render();
      } else {
        if (err) { err.textContent = (d && d.reason) || 'Something went wrong \u2014 please try again.'; err.hidden = false; }
      }
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = 'Send';
      if (err) { err.textContent = 'Connection problem \u2014 please try again.'; err.hidden = false; }
    });
  }

  function trialActivateFlow() {
    var input = $('#trial-license-input');
    var btn = $('#trial-activate-btn');
    var err = $('#trial-license-error');
    if (!input || !btn || !License || !License.isConfigured()) return;
    if (err) { err.hidden = true; }
    var key = input.value.trim();
    if (key.toUpperCase() === 'FREEYEAR') {
      btn.disabled = true; btn.textContent = 'Checking\u2026';
      fetch(REDEEM_EP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'FREEYEAR' }) })
        .then(function (r) { return r.json(); }).then(function (d) {
          btn.disabled = false; btn.textContent = 'Activate';
          if (d && d.success) { input.value = d.key; trialActivateFlow(); }
          else if (err) { err.textContent = (d && d.reason) || 'Code not available.'; err.hidden = false; }
        }).catch(function () { btn.disabled = false; btn.textContent = 'Activate'; if (err) { err.textContent = 'Connection problem \u2014 try again.'; err.hidden = false; } });
      return;
    }
    if (!key) {
      if (err) { err.textContent = 'Paste the license key from your purchase email first.'; err.hidden = false; }
      input.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Verifying\u2026';
    License.activate(key).then(function (r) {
      btn.disabled = false;
      btn.textContent = 'Activate';
      if (r.ok) {
        if (Trial) Trial.evaluate(); /* licensed users are never gated */
        toast('Pro activated \u2014 welcome aboard, and thank you! \uD83C\uDF89');
        render();
      } else {
        if (err) { err.textContent = r.reason; err.hidden = false; }
        input.focus();
      }
    });
  }


  /* =============================================================
     WHATSAPP ORDERS (v1.12) — Pro sellers get public order pages:
     the customer clicks from the ad, orders on the site, and the
     sale lands here automatically (name, qty, revenue, true profit)
     and updates the product numbers — no manual entry.
     ============================================================= */
  var SVG_GEAR = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
  var SVG_TRASH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 14h10l1-14"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
  var WA_KEY = 'profitleak.wa.v1';
  function waData() {
    try { return JSON.parse(localStorage.getItem(WA_KEY)) || {}; } catch (e) { return {}; }
  }
  function waSave(d) {
    try { localStorage.setItem(WA_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
  }
  function waLink(code) { return SITE_URL + '/#/order/' + code; }
  function waProductByCode(code) {
    var wa = waData(), links = wa.links || {};
    var pid = null;
    Object.keys(links).forEach(function (k) { if (links[k] && links[k].code === code) pid = k; });
    return pid ? state.products.find(function (p) { return p.id === pid; }) : null;
  }

  function renderOrdersPage() {
    var host = $('#orders-body');
    if (!host) return;
    if (!Plan.isPro()) {
      host.innerHTML = '<div class="wa-upsell">' +
        '<div class="upsell-icon" aria-hidden="true">\uD83D\uDCF1</div>' +
        '<h2>WhatsApp Orders is a Pro feature</h2>' +
        '<p class="upsell-text">Share an order link in your ads \u2014 every sale lands here automatically, with its true profit, and updates your product numbers for you.</p>' +
        '<div class="empty-actions"><a class="btn btn-primary btn-lg" href="#/pricing">Upgrade to Pro</a></div></div>';
      return;
    }
    var wa = waData();
    var lic = (License && License.getLicense()) ? License.getLicense().key : '';
    var links = wa.links || {};

    var rows = state.products.map(function (p, i) {
      var l = links[p.id];
      return '<tr>' +
        '<td class="wa-num-cell">' + (i + 1) + '</td>' +
        '<td><b>' + esc(p.name) + '</b></td>' +
        '<td>' + fmtMoney(p.sellingPrice) + '</td>' +
        '<td>' + (l ? '<span class="badge badge-green">\u2713 order link</span>' : '<span class="badge">not linked</span>') + '</td>' +
        '<td class="wa-actions">' +
          (l
            ? '<button type="button" class="btn btn-ghost btn-sm" data-wa-copy="' + esc(waLink(l.code)) + '">Copy link</button> ' +
              '<a class="btn btn-ghost btn-sm" href="' + esc(waLink(l.code)) + '" target="_blank" rel="noopener">View</a> '
            : '<button type="button" class="btn btn-primary btn-sm" data-wa-create="' + esc(p.id) + '">Create order link</button> ') +
          '<button type="button" class="icon-btn" data-wa-edit="' + esc(p.id) + '" title="Edit product (name, price)' + (l ? ' and its order page' : '') + '" aria-label="Edit product">' + SVG_GEAR + '</button>' +
          '<button type="button" class="icon-btn icon-danger" data-wa-del="' + esc(p.id) + '" title="Delete this product' + (l ? ' and its order link' : '') + '" aria-label="Delete product">' + SVG_TRASH + '</button>' +
        '</td></tr>';
    }).join('');

    host.innerHTML =
      '<div class="wa-grid">' +
        '<div class="wa-box">' +
          '<div class="license-title">Your WhatsApp number (orders go here)</div>' +
          '<div class="license-row">' +
            '<input id="wa-number" type="tel" placeholder="+212 6XX XXX XXX" value="' + esc(wa.whatsapp || '') + '" aria-label="WhatsApp number">' +
            '<button class="btn btn-primary btn-sm" type="button" id="wa-save">Save</button>' +
            '<button type="button" class="icon-btn icon-danger" id="wa-clear" title="Remove the saved number from this device" aria-label="Remove number">' + SVG_TRASH + '</button>' +
          '</div>' +
          '<div class="license-error" id="wa-error" hidden></div>' +
          '<p class="wa-hint">Include the country code. Saving updates the number on <b>every order page you created</b>. Customers see it only when they order.</p>' +
        '</div>' +
        '<div class="wa-box">' +
          '<div class="license-title">Your store link (for your bio)</div>' +
          (wa.store
            ? '<div class="license-row"><input readonly value="' + esc(SITE_URL + '/#/s/' + wa.store) + '" aria-label="Store link">' +
              '<button class="btn btn-primary btn-sm" type="button" id="wa-store-copy">Copy</button>' +
              '<a class="btn btn-ghost btn-sm" href="' + esc(SITE_URL + '/#/s/' + wa.store) + '" target="_blank" rel="noopener">View</a> ' +
              '<button type="button" class="icon-btn" id="wa-store-edit" title="Edit store name (shown on your store page)" aria-label="Edit store">' + SVG_GEAR + '</button>' +
              '<button type="button" class="icon-btn icon-danger" id="wa-store-del" title="Delete your store page" aria-label="Delete store">' + SVG_TRASH + '</button></div>' +
              '<div id="wa-store-editor"></div>' +
              '<p class="wa-hint">' + (wa.storeName ? '\u201C' + esc(wa.storeName) + '\u201D \u2014 ' : '') + 'One link with all your products \u2014 perfect for Instagram bio or WhatsApp status.</p>'
            : '<p class="wa-hint">Create your first product order link and your store link appears here automatically.</p>') +
        '</div>' +
      '</div>' +
      (state.products.length
        ? '<div class="card-table-wrap"><table class="table"><thead><tr><th>#</th><th>Product</th><th>Price</th><th>Order page</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="wa-hint">Add a product first \u2014 then create its WhatsApp order link here.</p>') +
      '<div class="wa-feed-head"><h2>Recent sales</h2>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="wa-refresh">Refresh</button></div>' +
      '<div id="wa-feed"><p class="wa-hint">Loading orders\u2026</p></div>';

    $('#wa-save').addEventListener('click', function () {
      var v = $('#wa-number').value.replace(/[^0-9+]/g, '');
      var digits = v.replace(/[^0-9]/g, '');
      var err = $('#wa-error');
      if (digits.length < 8) { err.textContent = 'Enter a valid number with the country code (e.g. +212 6XX XXX XXX).'; err.hidden = false; return; }
      err.hidden = true;
      var d = waData(); d.whatsapp = digits; waSave(d);
      var hasLinks = d.links && Object.keys(d.links).length > 0;
      var btn = $('#wa-save');
      if (lic && hasLinks) {
        btn.disabled = true;
        fetch(STORE_MANAGE_EP, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license: lic, action: 'wa', whatsapp: digits })
        }).then(function (r) { return r.json(); }).then(function (res) {
          btn.disabled = false;
          if (res && res.success) toast('Number updated on all your order pages \u2713');
          else toast('Saved \u2014 but the order pages could not update. Try again.');
        }).catch(function () {
          btn.disabled = false;
          toast('Saved \u2014 connection problem updating the order pages.');
        });
      } else {
        toast('WhatsApp number saved \u2713');
      }
    });
    var clearBtn = $('#wa-clear');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      var d = waData();
      if (!d.whatsapp) return;
      confirmDialog({
        title: 'Remove your WhatsApp number?',
        message: 'The number is removed from this device. Your order links keep using it until you save a new one.',
        confirmText: 'Remove',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        delete d.whatsapp;
        waSave(d);
        renderOrdersPage();
        toast('Number removed \u2014 enter a new one any time.');
      });
    });
    var storeCopy = $('#wa-store-copy');
    if (storeCopy) storeCopy.addEventListener('click', function () { waCopy(SITE_URL + '/#/s/' + waData().store); });
    var storeEdit = $('#wa-store-edit');
    if (storeEdit) storeEdit.addEventListener('click', function () {
      var host = $('#wa-store-editor');
      if (!host) return;
      if (host.innerHTML) { host.innerHTML = ''; return; }
      host.innerHTML = '<div class="wa-edit">' +
        '<input id="wa-s-name" type="text" maxlength="80" placeholder="Store name (e.g. Casablanca Gadgets)" aria-label="Store name">' +
        '<button type="button" class="btn btn-primary btn-sm" id="wa-s-save">Save</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="wa-s-cancel">Cancel</button>' +
        '</div><div class="wa-hint">This name appears as the title of your public store page. Leave it empty for the default.</div>';
      var inp = $('#wa-s-name');
      inp.value = waData().storeName || '';
      fetch(STORE_DATA_EP + '?code=' + encodeURIComponent(waData().store))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.success && d.type === 'store' && $('#wa-s-name')) $('#wa-s-name').value = d.name || '';
        })
        .catch(function () { /* keep the local value */ });
      $('#wa-s-save').addEventListener('click', function () {
        var name = String(($('#wa-s-name') && $('#wa-s-name').value) || '').trim();
        var sbtn = $('#wa-s-save');
        sbtn.disabled = true;
        fetch(STORE_MANAGE_EP, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license: lic, action: 'store-update', name: name })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.success) {
            var wd = waData();
            wd.storeName = name;
            waSave(wd);
            toast('Store name updated \u2713');
            renderOrdersPage();
          } else {
            sbtn.disabled = false;
            toast((d && d.reason) || 'Could not save \u2014 try again.');
          }
        }).catch(function () {
          sbtn.disabled = false;
          toast('Connection problem \u2014 try again.');
        });
      });
      $('#wa-s-cancel').addEventListener('click', function () { host.innerHTML = ''; });
    });
    var storeDel = $('#wa-store-del');
    if (storeDel) storeDel.addEventListener('click', function () {
      confirmDialog({
        title: 'Delete your store page?',
        message: 'The store link will stop working. Your product order links are not affected.',
        confirmText: 'Delete store',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        fetch(STORE_MANAGE_EP, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license: lic, action: 'store-delete' })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.success) {
            var wd = waData();
            delete wd.store;
            delete wd.storeName;
            waSave(wd);
            toast('Store page deleted \u2713');
            renderOrdersPage();
          } else {
            toast((d && d.reason) || 'Could not delete \u2014 try again.');
          }
        }).catch(function () {
          toast('Connection problem \u2014 try again.');
        });
      });
    });
    var refresh = $('#wa-refresh');
    if (refresh) refresh.addEventListener('click', function () { waRefreshFeed(lic); });
    $$('[data-wa-create]').forEach(function (b) {
      b.addEventListener('click', function () { waCreateLink(b.getAttribute('data-wa-create'), lic, b); });
    });
    $$('[data-wa-copy]').forEach(function (b) {
      b.addEventListener('click', function () { waCopy(b.getAttribute('data-wa-copy')); });
    });
    $$('[data-wa-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var pid = b.getAttribute('data-wa-edit');
        var l = (waData().links || {})[pid];
        var tr = b.closest ? b.closest('tr') : null;
        if (!tr) return;
        closeWaEdit();
        var p = state.products.find(function (x) { return x.id === pid; });
        if (!p) return;
        var er = document.createElement('tr');
        er.className = 'wa-edit-row';
        er.innerHTML = '<td colspan="5"><div class="wa-edit">' +
          '<input id="wa-e-name" type="text" maxlength="80" value="' + esc(p.name) + '" aria-label="Product name">' +
          '<input id="wa-e-price" type="number" min="1" step="any" value="' + esc(p.sellingPrice) + '" aria-label="Price">' +
          '<button type="button" class="btn btn-primary btn-sm" id="wa-e-save">Save</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="wa-e-cancel">Cancel</button>' +
          (l ? '<button type="button" class="btn btn-ghost btn-sm danger-text" id="wa-e-unlink">Remove link only</button>' : '') +
          '</div><div class="wa-hint">' + (l ? 'Updates your product AND the public order page ' + esc(waLink(l.code)) : 'Updates your product in this app.') + '</div></td>';
        tr.parentNode.insertBefore(er, tr.nextSibling);
        $('#wa-e-save').addEventListener('click', function () { waSaveEdit(pid, lic, l ? l.code : null); });
        $('#wa-e-cancel').addEventListener('click', function () { closeWaEdit(); });
        var un = $('#wa-e-unlink');
        if (un) un.addEventListener('click', function () { closeWaEdit(); waDeleteLink(pid, lic, l.code); });
      });
    });
    $$('[data-wa-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var pid = b.getAttribute('data-wa-del');
        var l = (waData().links || {})[pid];
        var p = state.products.find(function (x) { return x.id === pid; });
        if (!p) return;
        confirmDialog({
          title: 'Delete \u201C' + p.name + '\u201D?',
          message: l
            ? 'This removes the product and its order link. The public order page will stop working.'
            : 'This removes the product from your app.',
          confirmText: 'Delete',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          var finish = function () {
            var wd = waData();
            if (wd.links) delete wd.links[pid];
            waSave(wd);
            state.products = state.products.filter(function (x) { return x.id !== pid; });
            persist();
            toast('\u201C' + esc(p.name) + '\u201D deleted \u2713');
            renderOrdersPage();
          };
          if (l) {
            fetch(STORE_MANAGE_EP, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ license: lic, action: 'delete', code: l.code })
            }).then(function (r) { return r.json(); }).then(function (d) {
              if (d && d.success) finish();
              else toast((d && d.reason) || 'Could not delete \u2014 try again.');
            }).catch(function () { toast('Connection problem \u2014 try again.'); });
          } else finish();
        });
      });
    });
    waRefreshFeed(lic);
  }

  function closeWaEdit() {
    var er = $('.wa-edit-row');
    if (er && er.parentNode) er.parentNode.removeChild(er);
  }

  function waSaveEdit(pid, lic, code) {
    var name = String(($('#wa-e-name') && $('#wa-e-name').value) || '').trim();
    var price = Number(($('#wa-e-price') && $('#wa-e-price').value) || 0);
    if (!name) { toast('The name cannot be empty.'); return; }
    if (!(price > 0)) { toast('Enter a valid price.'); return; }
    var applyLocal = function () {
      var p = state.products.find(function (x) { return x.id === pid; });
      if (p) { p.name = name; p.sellingPrice = price; persist(); }
    };
    if (!code) {
      applyLocal();
      toast('Product updated \u2713');
      renderOrdersPage();
      return;
    }
    var btn = $('#wa-e-save');
    if (btn) btn.disabled = true;
    fetch(STORE_MANAGE_EP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license: lic, action: 'update', code: code, name: name, price: price })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.success) {
        var p = state.products.find(function (x) { return x.id === pid; });
        if (p) { p.name = name; p.sellingPrice = price; persist(); }
        toast('Order page updated \u2713');
        renderOrdersPage();
      } else {
        if (btn) btn.disabled = false;
        toast((d && d.reason) || 'Could not save \u2014 try again.');
      }
    }).catch(function () {
      if (btn) btn.disabled = false;
      toast('Connection problem \u2014 try again.');
    });
  }

  function waDeleteLink(pid, lic, code) {
    confirmDialog({
      title: 'Remove this order link?',
      message: 'The public order page will stop working. Your product stays in your app.',
      confirmText: 'Remove link',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      waDeleteLinkNow(pid, lic, code);
    });
  }

  function waDeleteLinkNow(pid, lic, code) {
    fetch(STORE_MANAGE_EP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license: lic, action: 'delete', code: code })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.success) {
        var wd = waData();
        if (wd.links) delete wd.links[pid];
        waSave(wd);
        toast('Order link removed \u2014 product kept \u2713');
        renderOrdersPage();
      } else {
        toast((d && d.reason) || 'Could not delete \u2014 try again.');
      }
    }).catch(function () {
      toast('Connection problem \u2014 try again.');
    });
  }

  function waCopy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        toast('Link copied \u2713'); return;
      }
    } catch (e) { /* fallback below */ }
    try {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      toast('Link copied \u2713');
    } catch (e) { toast('Copy failed \u2014 select the link manually.'); }
  }

  function waCreateLink(productId, lic, btn) {
    var wa = waData();
    var err = function (m) { toast(m); };
    if (!lic) { err('Activate your Pro license first (Pricing page).'); return; }
    if (!wa.whatsapp) { err('Save your WhatsApp number first.'); return; }
    var p = state.products.find(function (x) { return x.id === productId; });
    if (!p) return;
    btn.disabled = true; btn.textContent = 'Creating\u2026';
    fetch(STORE_CREATE_EP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license: lic, name: p.name, price: p.sellingPrice, whatsapp: wa.whatsapp })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.success) {
        var w = waData();
        w.links = w.links || {};
        w.links[productId] = { code: d.code };
        w.store = d.store || w.store;
        waSave(w);
        waCopy(waLink(d.code));
        renderOrdersPage();
      } else {
        btn.disabled = false; btn.textContent = 'Create order link';
        err((d && d.reason) || 'Could not create the link \u2014 try again.');
      }
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Create order link';
      err('Connection problem \u2014 try again.');
    });
  }

  function waApplyOrders(orders) {
    if (!orders || !orders.length) return 0;
    var wa = waData();
    var seen = wa.seen || [];
    var links = wa.links || {};
    var byCode = {};
    Object.keys(links).forEach(function (pid) { if (links[pid]) byCode[links[pid].code] = pid; });
    var applied = 0;
    orders.forEach(function (o) {
      if (seen.indexOf(o.oc) !== -1) return;
      seen.push(o.oc);
      var pid = byCode[o.lc];
      var p = pid ? state.products.find(function (x) { return x.id === pid; }) : null;
      if (p) { p.unitsSold = (Number(p.unitsSold) || 0) + (Number(o.qty) || 1); applied++; }
    });
    wa.seen = seen; waSave(wa);
    if (applied) {
      persist();
      toast(applied + ' new WhatsApp sale' + (applied > 1 ? 's' : '') + ' applied \u2014 numbers updated \u2713');
    }
    return applied;
  }

  function waFeedRow(o) {
    var p = waProductByCode(o.lc);
    var revenue = (Number(o.price) || 0) * (Number(o.qty) || 1);
    var cost = 0;
    if (p) {
      cost = (Number(p.purchaseCost) + Number(p.adCostPerSale) + Number(p.shippingCost) +
        Number(p.platformFees) + Number(p.discountPerSale) + Number(p.returnCostPerSale)) * (Number(o.qty) || 1);
    }
    var profit = revenue - cost;
    var when = String(o.at || '').replace('T', ' ').slice(0, 16);
    return '<tr>' +
      '<td>' + esc(when) + '</td>' +
      '<td><b>' + esc(o.name || 'Customer') + '</b></td>' +
      '<td>' + (o.ph ? '<a class="wa-phone" href="https://wa.me/' + esc(o.ph) + '" target="_blank" rel="noopener">+' + esc(o.ph) + '</a>' : '\u2014') + '</td>' +
      '<td>' + esc(o.p || '') + '</td>' +
      '<td>\u00D7' + (Number(o.qty) || 1) + '</td>' +
      '<td>' + fmtMoney(revenue) + '</td>' +
      '<td class="' + (profit < 0 ? 'val-bad' : 'val-good') + '">' + (p ? fmtMoney(profit) : '\u2014') + '</td>' +
      '</tr>';
  }

  function waRefreshFeed(lic) {
    var feed = $('#wa-feed');
    if (!feed) return;
    var wa = waData();
    var codes = Object.keys(wa.links || {}).map(function (k) { return wa.links[k].code; });
    if (!lic || !codes.length) {
      feed.innerHTML = '<p class="wa-hint">No order links yet \u2014 create one for a product above, share it in your ads, and sales will appear here automatically.</p>';
      return;
    }
    fetch(STORE_ORDERS_EP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license: lic, codes: codes })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.success) {
        feed.innerHTML = '<p class="wa-hint">Could not load orders right now \u2014 tap Refresh.</p>';
        return;
      }
      waApplyOrders(d.orders);
      if (!d.orders.length) {
        feed.innerHTML = '<p class="wa-hint">No sales yet. Share your order link in your ads \u2014 every order will appear here automatically.</p>';
        return;
      }
      feed.innerHTML = '<div class="card-table-wrap"><table class="table"><thead><tr>' +
        '<th>Date</th><th>Buyer</th><th>Phone</th><th>Product</th><th>Qty</th><th>Revenue</th><th>True profit</th>' +
        '</tr></thead><tbody>' + d.orders.map(waFeedRow).join('') + '</tbody></table></div>';
    }).catch(function () {
      feed.innerHTML = '<p class="wa-hint">Connection problem \u2014 tap Refresh.</p>';
    });
  }

  /* silent auto-sync on boot: new orders apply themselves */
  function waAutoSync() {
    if (!Plan.isPro() || !License || !License.isActive()) return;
    var wa = waData();
    var codes = Object.keys(wa.links || {}).map(function (k) { return wa.links[k].code; });
    if (!codes.length) return;
    var lic = License.getLicense() ? License.getLicense().key : '';
    if (!lic) return;
    fetch(STORE_ORDERS_EP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license: lic, codes: codes })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.success && waApplyOrders(d.orders)) render();
    }).catch(function () { /* silent */ });
  }

  /* ---------- public pages (customer side) ---------- */
  function renderPublicPage(route) {
    var host = $('#public-body');
    if (!host) return;
    host.innerHTML = '<div class="pub-loading">Loading\u2026</div>';
    fetch(STORE_DATA_EP + '?code=' + encodeURIComponent(route.id))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.success) {
          host.innerHTML = pubShell('<h1>Order page not found</h1><p class="pub-sub">This link may be wrong or expired.</p>');
          return;
        }
        if (d.type === 'store') {
          var items = (d.products || []).map(function (p) {
            return '<a class="pub-item" href="' + SITE_URL + '/#/order/' + esc(p.code) + '">' +
              '<b>' + esc(p.name) + '</b><span>' + fmtMoney(p.price) + '</span></a>';
          }).join('');
          host.innerHTML = pubShell('<h1>' + esc(d.name || 'Our products') + '</h1>' +
            '<p class="pub-sub">Tap a product to order on WhatsApp \u2014 pay on delivery.</p>' +
            '<div class="pub-grid">' + (items || '<p class="pub-sub">No products yet.</p>') + '</div>');
        } else {
          host.innerHTML = pubShell(
            '<h1>' + esc(d.name) + '</h1>' +
            '<div class="pub-price">' + fmtMoney(d.price) + '</div>' +
            '<p class="pub-sub">Order on WhatsApp \u00B7 \u0627\u0637\u0644\u0628 \u0639\u0628\u0631 \u0648\u0627\u062A\u0633\u0627\u0628 \u00B7 \u0627\u0644\u062F\u0641\u0639 \u0639\u0646\u062F \u0627\u0644\u0627\u0633\u062A\u0644\u0627\u0645</p>' +
            '<label class="pub-label">Your name (optional)<input id="pub-name" type="text" maxlength="60" autocomplete="name"></label>' +
            '<label class="pub-label">Your WhatsApp number \u00B7 \u0631\u0642\u0645 \u0648\u0627\u062A\u0633\u0627\u0628\u0643<input id="pub-phone" type="tel" inputmode="tel" maxlength="16" placeholder="06 XX XX XX XX" autocomplete="tel"></label>' +
            '<label class="pub-label">Quantity<input id="pub-qty" type="number" value="1" min="1" max="99"></label>' +
            '<div id="pub-err" class="pub-err" hidden></div>' +
            '<button type="button" class="pub-wa-btn" id="pub-order" data-code="' + esc(route.id) + '" data-price="' + Number(d.price) + '">\uD83D\uDFE2 Order via WhatsApp \u00B7 \u0627\u0637\u0644\u0628 \u0627\u0644\u0622\u0646</button>' +
            '<div id="pub-done" hidden><p class="pub-ok">\u2713 Order sent \u2014 WhatsApp should open now.</p>' +
            '<a id="pub-wa-link" class="pub-wa-btn" href="#" target="_blank" rel="noopener">Tap here if WhatsApp did not open</a></div>' +
            '<p class="pub-note">Powered by ProfitLeak AI</p>');
          $('#pub-order').addEventListener('click', function () { publicOrderSubmit(); });
        }
      })
      .catch(function () {
        host.innerHTML = pubShell('<h1>Connection problem</h1><p class="pub-sub">Check your internet and refresh.</p>');
      });
  }

  function pubShell(inner) {
    return '<div class="pub-card">' +
      '<div class="pub-logo" aria-hidden="true"></div>' + inner + '</div>';
  }

  function publicOrderSubmit() {
    var btn = $('#pub-order');
    var code = btn.getAttribute('data-code');
    var name = ($('#pub-name') && $('#pub-name').value || '').trim();
    var qty = Math.min(99, Math.max(1, parseInt($('#pub-qty') && $('#pub-qty').value, 10) || 1));
    var phone = String(($('#pub-phone') && $('#pub-phone').value) || '').replace(/[^0-9]/g, '');
    var err = $('#pub-err');
    if (err) err.hidden = true;
    if (phone.length < 8) {
      if (err) { err.textContent = 'Enter your WhatsApp number \u00B7 \u0627\u0643\u062A\u0628 \u0631\u0642\u0645 \u0648\u0627\u062A\u0633\u0627\u0628\u0643'; err.hidden = false; }
      return;
    }
    btn.disabled = true; btn.textContent = 'Sending\u2026';
    fetch(STORE_ORDER_EP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, name: name, qty: qty, phone: phone })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.success) {
        btn.disabled = false; btn.textContent = '\uD83D\uDFE2 Order via WhatsApp \u00B7 \u0627\u0637\u0644\u0628 \u0627\u0644\u0622\u0646';
        if (err) { err.textContent = (d && d.reason) || 'Could not send \u2014 try again.'; err.hidden = false; }
        return;
      }
      var msg = 'New order ' + d.orderCode +
        '\nProduct: ' + d.product + ' \u00D7' + d.qty +
        '\nTotal: $' + (Number(d.price) * d.qty).toFixed(2) +
        (name ? '\nName: ' + name : '') +
        '\nBuyer WhatsApp: +' + phone +
        '\n(from ProfitLeak order page)';
      var url = 'https://wa.me/' + d.wa + '?text=' + encodeURIComponent(msg);
      try { window.open(url, '_blank'); } catch (e) { /* link below */ }
      $('#pub-done').hidden = false;
      $('#pub-wa-link').href = url;
      btn.textContent = '\u2713 Order sent';
    }).catch(function () {
      btn.disabled = false; btn.textContent = '\uD83D\uDFE2 Order via WhatsApp \u00B7 \u0627\u0637\u0644\u0628 \u0627\u0644\u0622\u0646';
    });
  }

  /* v1.19: file export / import / print are Pro-only — even during the
     free trial sittings. The trial is for exploring the app; moving data
     in and out is what buyers pay for. */
  function requireProForFiles(featureName) {
    if (Plan.isPro()) return true;
    confirmDialog({
      title: featureName + ' is a Pro feature \uD83D\uDD12',
      message: 'Exporting, importing and printing your data is part of Pro. Everything you create in your free session stays saved in this browser \u2014 upgrade to move your data in and out, forever.',
      confirmText: 'Upgrade to Pro \u2014 $19',
      cancelText: 'Not now'
    }).then(function (ok) {
      if (ok) location.hash = '#/pricing';
    });
    return false;
  }

  function showProComingSoon() {
    confirmDialog({
      title: 'Get Pro \u2014 $19 one-time \uD83D\uDE80',
      message: 'Pro includes unlimited products, the What-If Simulator, cost ranking, profit goals and marketplace integrations. Pay with card, PayPal or crypto right here \u2014 or via Gumroad. Your license key activates on this Pricing page.',
      confirmText: 'Continue to checkout',
      cancelText: 'Not now'
    }).then(function (ok) {
      if (!ok) return;
      var url = License && License.buyUrl ? License.buyUrl() : '';
      if (url) window.open(url, '_blank', 'noopener');
    });
  }

  /* =============================================================
     PROFIT REPORT
     ============================================================= */
  function renderReport() {
    var host = $('#report-body');
    var printBtn = $('#report-print');
    var r = Report.buildReport(state.products);

    if (!r) {
      printBtn.disabled = true;
      host.innerHTML =
        '<div class="card upsell-card">' +
          '<div class="upsell-icon" aria-hidden="true">\uD83D\uDCC4</div>' +
          '<h2>Nothing to report yet</h2>' +
          '<p class="upsell-text">Add at least one product and ProfitLeak AI will generate a professional profit report from your numbers.</p>' +
          '<div class="empty-actions">' +
            '<a class="btn btn-primary btn-lg" href="#/add">+ Add your first product</a>' +
            '<button class="btn btn-ghost" type="button" data-action="load-samples">Try Demo Data</button>' +
          '</div>' +
        '</div>';
      return;
    }

    printBtn.disabled = false;
    host.innerHTML = Report.renderHtml(r);
  }

  /* =============================================================
     TOASTS + CONFIRM DIALOG
     ============================================================= */
  function toast(message, opts) {
    opts = opts || {};
    var host = $('#toast-container');
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span class="toast-msg">' + message + '</span>' +
      (opts.actionLabel ? '<button type="button" class="toast-action">' + esc(opts.actionLabel) + '</button>' : '') +
      '<button type="button" class="toast-close" aria-label="Dismiss">\u00D7</button>';
    host.appendChild(el);

    var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
    raf(function () { el.classList.add('show'); });

    var closed = false;
    function dismiss() {
      if (closed) return;
      closed = true;
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }
    var timer = setTimeout(dismiss, opts.timeout || 6000);

    el.querySelector('.toast-close').addEventListener('click', dismiss);
    var act = el.querySelector('.toast-action');
    if (act) {
      act.addEventListener('click', function () {
        clearTimeout(timer);
        dismiss();
        if (opts.onAction) opts.onAction();
      });
    }
  }

  var modalCleanup = null;

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var overlay = $('#modal-overlay');
      var confirmBtn = $('#modal-confirm');
      var cancelBtn = $('#modal-cancel');

      $('#modal-title').textContent = opts.title || 'Are you sure?';
      $('#modal-message').textContent = opts.message || '';
      confirmBtn.textContent = opts.confirmText || 'Confirm';
      cancelBtn.textContent = opts.cancelText || 'Cancel';
      confirmBtn.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
      overlay.hidden = false;
      document.body.classList.add('modal-open');
      confirmBtn.focus();

      function close(val) {
        overlay.hidden = true;
        document.body.classList.remove('modal-open');
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onOverlay);
        document.removeEventListener('keydown', onKey);
        modalCleanup = null;
        resolve(val);
      }
      function onConfirm() { close(true); }
      function onCancel() { close(false); }
      function onOverlay(e) { if (e.target === overlay) close(false); }
      function onKey(e) { if (e.key === 'Escape') close(false); }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onOverlay);
      document.addEventListener('keydown', onKey);
      modalCleanup = function () { close(false); };
    });
  }

  /* =============================================================
     GLOBAL EVENTS (delegation)
     ============================================================= */
  function onGlobalClick(e) {
    if (Trial) Trial.heartbeat();
    /* plain-language metric help (works on touch + desktop) */
    var helpEl = e.target.closest ? e.target.closest('[data-help]') : null;
    if (helpEl) {
      var box = helpEl.closest('.kpi') || helpEl.closest('.diag-tile');
      var helpBoxEl = box ? box.querySelector('.help-box') : null;
      if (helpBoxEl) {
        var opening = helpBoxEl.hidden;
        helpBoxEl.hidden = !opening;
        helpEl.setAttribute('aria-expanded', String(opening));
      }
      return;
    }

    var closeImp = e.target.closest ? e.target.closest('[data-close-import]') : null;
    if (closeImp) { closeImportPreview(); return; }

    var actionEl = e.target.closest ? e.target.closest('[data-action]') : null;
    if (actionEl) {
      var act = actionEl.getAttribute('data-action');
      var id = actionEl.getAttribute('data-id');
      if (act === 'delete') { e.preventDefault(); e.stopPropagation(); requestDelete(id); }
      else if (act === 'edit') { e.preventDefault(); location.hash = '#/edit/' + encodeURIComponent(id); }
      else if (act === 'view') { e.preventDefault(); location.hash = '#/product/' + encodeURIComponent(id); }
      else if (act === 'load-samples') { loadSamplesFlow(); }
      else if (act === 'clear-demo') { clearDemoFlow(); }
      else if (act === 'clear-all') { clearAllFlow(); }
      else if (act === 'export-csv') { exportCsv(); }
      else if (act === 'import-csv') { if (requireProForFiles('CSV import')) $('#csv-file').click(); }
      else if (act === 'csv-template') { downloadCsvTemplate(); }
      else if (act === 'upgrade') { showProComingSoon(); }
      else if (act === 'license-activate') { activateLicenseFlow(); }
      else if (act === 'license-remove') {
        License.deactivate();
        render();
        toast('License removed \u2014 you are back on the Free plan. Your products are safe.');
      }
      return;
    }

    var chip = e.target.closest ? e.target.closest('[data-filter]') : null;
    if (chip) {
      state.filter = chip.getAttribute('data-filter');
      renderDashboard();
      return;
    }

    var th = e.target.closest ? e.target.closest('th[data-sort]') : null;
    if (th) {
      var key = th.getAttribute('data-sort');
      if (state.sort.key === key) {
        state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = { key: key, dir: key === 'name' ? 'asc' : 'desc' };
      }
      renderDashboard();
      return;
    }

    var row = e.target.closest ? e.target.closest('tr.clickable') : null;
    if (row) location.hash = '#/product/' + encodeURIComponent(row.getAttribute('data-id'));
  }

  function onGlobalKeydown(e) {
    if (e.key === 'Escape' && modalCleanup) { modalCleanup(); return; }
    var row = e.target.closest && e.target.closest('tr.clickable');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      location.hash = '#/product/' + encodeURIComponent(row.getAttribute('data-id'));
    }
  }

  /* =============================================================
     FIRST-TIME WELCOME
     ============================================================= */
  function maybeShowWelcome() {
    var r0 = parseRoute();
    if (r0.page === 'order' || r0.page === 'store') return; /* customer pages: no welcome */
    if (trialGateEngaged()) return; /* the paywall replaces the welcome for locked visitors */
    if (Store.isOnboarded() || state.products.length) {
      if (!Store.isOnboarded()) Store.markOnboarded(); // returning user with data: skip
      return;
    }

    var overlay = $('#welcome-overlay');
    overlay.hidden = false;
    document.body.classList.add('modal-open');

    function close() {
      overlay.hidden = true;
      document.body.classList.remove('modal-open');
      Store.markOnboarded();
    }

    $('#welcome-start').addEventListener('click', function () {
      close();
      if (parseRoute().page === 'landing') location.hash = '#/dashboard';
      toast('Start by adding a product \u2014 or press \u201CTry Demo Data\u201D to explore first.');
    });

    $('#welcome-demo').addEventListener('click', function () {
      close();
      state.products = Store.samplesForPlan();
      persist();
      location.hash = '#/dashboard';
      render();
      toast('Demo data loaded \u2713 \u2014 explore freely, then clear it anytime.');
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onKey);
      }
    });
  }

  /* =============================================================
     INIT
     ============================================================= */
  function init() {
    state.products = Store.load();

    /* paid license (v1.8): restores Pro instantly for licensed users */
    if (License) {
      Plan.setLicenseActive(License.isActive());
      License.onChange(function (active) {
        Plan.setLicenseActive(active);
        render();
      });
    }

    /* one-session free trial (v1.9) */
    if (Trial) Trial.evaluate();

    /* WhatsApp orders (v1.12): new sales apply themselves on open */
    setTimeout(function () { try { waAutoSync(); } catch (e) { /* never block boot */ } }, 900);

    /* visitor analytics (v1.22): fire-and-forget, never blocks the app */
    try { logVisit(); } catch (e) { /* never block boot */ }

    /* v1.18: enforce the 20-minute sitting cap — the popup appears even if
       the visitor never navigates (render re-checks the gate) */
    setInterval(function () {
      try {
        var rr = parseRoute();
        if (rr.page === 'order' || rr.page === 'store') return; /* customers are never gated */
        var ovl = $('#trial-overlay');
        if (ovl && ovl.hidden && trialGateEngaged()) render();
      } catch (e) { /* never break the app */ }
    }, 30000);

    $('#product-form').addEventListener('submit', onFormSubmit);
    $('#product-form').addEventListener('input', function (e) {
      if (Trial) Trial.heartbeat();
      var field = e.target.closest('.field');
      if (field && field.classList.contains('has-error')) {
        field.classList.remove('has-error');
        var p = field.querySelector('.field-error');
        if (p) p.textContent = '';
      }
      updateLivePreview();
    });

    $('#csv-file').addEventListener('change', onCsvFileChosen);

    $('#report-print').addEventListener('click', function () {
      if (!requireProForFiles('Printing the report')) return;
      try { window.print(); } catch (e) { /* non-browser environments */ }
    });

    $('#import-cancel').addEventListener('click', closeImportPreview);
    $('#import-confirm').addEventListener('click', onImportConfirm);
    $('#import-overlay').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) closeImportPreview();
    });

    var trialActivateBtn = $('#trial-activate-btn');
    if (trialActivateBtn) {
      trialActivateBtn.addEventListener('click', trialActivateFlow);
      $('#trial-license-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') trialActivateFlow();
      });
    }
    var trialEmailBtn = $('#trial-email-btn');
    if (trialEmailBtn) {
      trialEmailBtn.addEventListener('click', trialEmailFlow);
      $('#trial-email-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') trialEmailFlow();
      });
    }

    document.addEventListener('click', onGlobalClick);
    document.addEventListener('keydown', onGlobalKeydown);
    window.addEventListener('hashchange', render);

    render();
    maybeShowWelcome();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
