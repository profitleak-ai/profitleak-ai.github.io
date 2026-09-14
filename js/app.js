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
    if (parts[0] === 'add') return { page: 'form', mode: 'add' };
    if (parts[0] === 'edit') { var eId = safeDecode(parts[1]); return eId ? { page: 'form', mode: 'edit', id: eId } : { page: 'dashboard' }; }
    if (parts[0] === 'product') { var aId = safeDecode(parts[1]); return aId ? { page: 'analysis', id: aId } : { page: 'dashboard' }; }
    return { page: 'landing' };
  }

  function render() {
    var route = parseRoute();
    var isLanding = route.page === 'landing';

    if (Trial) Trial.heartbeat();

    /* one-session free trial: app pages require an active session or a license */
    if (!isLanding && trialGateEngaged()) { showTrialPaywall(); return; }
    hideTrialPaywall();

    $('#view-landing').hidden = !isLanding;
    $('#view-app').hidden = isLanding;
    $('#storage-banner').hidden = isLanding || Store.isPersistent();

    $$('.page').forEach(function (s) { s.hidden = true; });
    $('[data-nav="dashboard"]').classList.toggle('active', route.page === 'dashboard');
    $('[data-nav="pricing"]').classList.toggle('active', route.page === 'pricing');
    renderPlanNav();

    if (isLanding) {
      renderLandingExample();
    } else if (route.page === 'dashboard') {
      $('#page-dashboard').hidden = false;
      renderDashboard();
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
      render();
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
          '<button class="btn btn-ghost btn-sm" type="button" data-action="csv-template">Download CSV template</button>' +
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
      proBtn = '<div class="pro-active-box"><span class="badge badge-green">\u2713 Pro licensed \u2014 thank you!</span>' +
        '<button type="button" class="link-btn" data-action="license-remove">Remove license</button></div>';
    } else if (License && License.isConfigured()) {
      proBtn = '<a class="btn btn-light btn-lg" href="' + esc(License.buyUrl()) + '" target="_blank" rel="noopener">Buy Pro \u2014 $19 one-time</a>' +
        '<p class="price-note">Secure checkout via Gumroad \u00B7 license key delivered instantly by email</p>';
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
      '<p class="pricing-trust">One-time payment \u00B7 Refunds handled via Gumroad \u00B7 Your data never leaves your browser</p>';
  }

  /* ---------- paid license activation (v1.8) ---------- */
  function activateLicenseFlow() {
    var input = $('#license-input');
    var btn = $('#license-activate-btn');
    var err = $('#license-error');
    if (!input || !btn) return;
    if (err) { err.hidden = true; }
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
    return !!(Trial && License && License.isConfigured() && Trial.isLocked());
  }

  function showTrialPaywall() {
    var ov = $('#trial-overlay');
    if (!ov) return;
    var buy = $('#trial-buy');
    if (buy && License && License.buyUrl) buy.href = License.buyUrl();
    var n = state.products.length;
    $('#trial-text').textContent = n > 0
      ? 'You explored ProfitLeak AI with your free session. Your ' + n +
        (n === 1 ? ' product' : ' products') + ' and every calculation are saved in this browser \u2014 ready the moment you activate Pro.'
      : 'You explored ProfitLeak AI with your free session. Activate Pro to keep analyzing your true profit \u2014 every feature, unlimited products, lifetime license.';
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

  function trialActivateFlow() {
    var input = $('#trial-license-input');
    var btn = $('#trial-activate-btn');
    var err = $('#trial-license-error');
    if (!input || !btn || !License || !License.isConfigured()) return;
    if (err) { err.hidden = true; }
    var key = input.value.trim();
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

  function showProComingSoon() {
    confirmDialog({
      title: 'Get Pro \u2014 $19 one-time \uD83D\uDE80',
      message: 'Pro includes unlimited products, the What-If Simulator, cost ranking, profit goals and marketplace integrations. Secure checkout on Gumroad \u2014 your license key arrives by email within minutes and activates right here on the Pricing page.',
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
      else if (act === 'import-csv') { $('#csv-file').click(); }
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
