/* =============================================================
   ProfitLeak AI — data layer
   - Sample products (so the app is useful the moment it opens)
   - Safe localStorage wrapper (falls back to memory when storage
     is blocked, e.g. inside sandboxed preview iframes)
   - Tiny CRUD helpers used by the UI
   No DOM usage here, so this file also loads cleanly in Node.js
   for automated tests.
   ============================================================= */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'profitleak.products.v1';
  var ONBOARD_KEY = 'profitleak.onboarded.v1';
  var memoryOnboarded = false;

  /* ---------- Sample products ----------
     Deliberately cover every status and every type of "leak":
     🟢 profitable · 🟡 low profit · 🔴 losing money
     (high ads / high shipping / fees / discounts / returns)      */
  var SAMPLE_PRODUCTS = [
    {
      id: 'sample-earbuds', name: 'Wireless Earbuds Pro',
      sellingPrice: 49.99, purchaseCost: 18.50, adCostPerSale: 6.00,
      shippingCost: 4.50, platformFees: 7.00, discountPerSale: 2.00,
      returnCostPerSale: 1.50, unitsSold: 320,
      createdAt: '2026-09-01T09:00:00.000Z'
    },
    {
      id: 'sample-yoga-mat', name: 'Eco Yoga Mat',
      sellingPrice: 39.00, purchaseCost: 13.00, adCostPerSale: 7.50,
      shippingCost: 6.50, platformFees: 6.00, discountPerSale: 4.00,
      returnCostPerSale: 1.00, unitsSold: 150,
      createdAt: '2026-09-01T09:05:00.000Z'
    },
    {
      id: 'sample-phone-case', name: 'Clear Phone Case',
      sellingPrice: 12.99, purchaseCost: 3.00, adCostPerSale: 5.50,
      shippingCost: 2.50, platformFees: 1.95, discountPerSale: 0.50,
      returnCostPerSale: 0.30, unitsSold: 500,
      createdAt: '2026-09-01T09:10:00.000Z'
    },
    {
      id: 'sample-candle', name: 'Lavender Candle Set',
      sellingPrice: 29.00, purchaseCost: 10.00, adCostPerSale: 4.00,
      shippingCost: 9.50, platformFees: 4.00, discountPerSale: 0.00,
      returnCostPerSale: 2.50, unitsSold: 210,
      createdAt: '2026-09-01T09:15:00.000Z'
    },
    {
      id: 'sample-speaker', name: 'Mini Bluetooth Speaker',
      sellingPrice: 39.99, purchaseCost: 15.00, adCostPerSale: 9.00,
      shippingCost: 5.00, platformFees: 5.25, discountPerSale: 2.00,
      returnCostPerSale: 1.25, unitsSold: 260,
      createdAt: '2026-09-01T09:20:00.000Z'
    },
    {
      id: 'sample-baking-mats', name: 'Silicone Baking Mat Set',
      sellingPrice: 24.99, purchaseCost: 7.50, adCostPerSale: 3.00,
      shippingCost: 3.50, platformFees: 3.60, discountPerSale: 0.00,
      returnCostPerSale: 0.75, unitsSold: 430,
      createdAt: '2026-09-01T09:25:00.000Z'
    }
  ];

  /* ---------- Detect whether browser storage is usable ----------
     In sandboxed iframes (e.g. embedded previews) even *touching*
     localStorage can throw a SecurityError — so wrap everything. */
  function storageAvailable() {
    try {
      if (typeof localStorage === 'undefined') return false;
      var k = '__profitleak_test__';
      localStorage.setItem(k, k);
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }
  var persistent = storageAvailable();
  var memory = null; // fallback used when localStorage is blocked

  /* =============================================================
     PLAN (FREE / PRO) — monetization layer (v1.4)
     No authentication: the plan is a simple local flag.
     Default: FREE (up to 3 products). PRO comes exclusively from
     a verified Gumroad license (see js/license.js).
     ============================================================= */
  var PLAN_KEY = 'profitleak.plan.v1';
  var FREE_PRODUCT_LIMIT = 3;
  var FREE_SAMPLE_IDS = ['sample-earbuds', 'sample-speaker', 'sample-phone-case'];

  var memoryPlan = 'free';

  /* Pro comes from a paid license (see js/license.js).
     The license layer reports its state here. Any pre-launch
     preview flag left in storage is cleared below. */
  var licenseActive = false;

  function readPlan() {
    if (!persistent) return memoryPlan;
    try {
      return localStorage.getItem(PLAN_KEY) === 'pro' ? 'pro' : 'free';
    } catch (e) {
      return memoryPlan;
    }
  }

  function writePlan(v) {
    memoryPlan = (v === 'pro') ? 'pro' : 'free';
    if (!persistent) return;
    try { localStorage.setItem(PLAN_KEY, memoryPlan); } catch (e) { /* ignore */ }
  }

  var Plan = {
    isPro: function () { return readPlan() === 'pro' || licenseActive; },
    setLicenseActive: function (v) { licenseActive = !!v; },
    hasLicense: function () { return licenseActive; },
    setPlan: function (v) { writePlan(v); },
    freeLimit: function () { return FREE_PRODUCT_LIMIT; },
    /** How many more products can be added on the current plan. */
    freeSlotsFor: function (currentCount) {
      if (Plan.isPro()) return Infinity;
      return Math.max(0, FREE_PRODUCT_LIMIT - currentCount);
    }
  };

  /* The pre-launch free preview ended when the store opened.
     A leftover preview flag is cleared on load; licensed users
     keep Pro via licenseActive (set by app.js at boot). */
  if (readPlan() === 'pro') writePlan('free');

  /* ==== FREE TRIAL — ONE SESSION (v1.9) ======================
     The Free plan is a one-session trial: the visitor's first
     session has full free access. When that session ends (all
     tabs closed, or away for more than TRIAL_GRACE_MS), the app
     asks for a Pro license (paywall in app.js). Licensed users
     are never gated, and the gate only engages when the store
     is connected (checked in app.js, so self-hosted builds of
     this open-source app stay fully free).
     ============================================================= */
  var TRIAL_KEY = 'profitleak.trial.v1';
  var TRIAL_SESSION_KEY = 'profitleak.trial.session.v1';
  var TRIAL_GRACE_MS = 30 * 60 * 1000; /* back within 30 min = same sitting */

  var memoryTrial = null;    /* fallback when localStorage is blocked */
  var memorySession = false; /* fallback when sessionStorage is blocked */

  function readTrial() {
    if (persistent) {
      try {
        var raw = localStorage.getItem(TRIAL_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return memoryTrial; }
    }
    return memoryTrial;
  }
  function writeTrial(t) {
    memoryTrial = t;
    if (!persistent) return;
    try { localStorage.setItem(TRIAL_KEY, JSON.stringify(t)); } catch (e) { /* ignore */ }
  }
  function hasSessionMarker() {
    try { return sessionStorage.getItem(TRIAL_SESSION_KEY) === '1'; } catch (e) { return memorySession; }
  }
  function markSession() {
    memorySession = true;
    try { sessionStorage.setItem(TRIAL_SESSION_KEY, '1'); } catch (e) { /* ignore */ }
  }

  var Trial = {
    active: true, /* set properly by evaluate() at boot */
    evaluate: function () {
      if (Plan.isPro()) return true; /* licensed: open, without touching the trial state */
      var now = Date.now();
      var t = readTrial();
      if (!t || !t.startedAt) {                 /* first ever visit: start the free session */
        writeTrial({ startedAt: now, lastActive: now });
        markSession();
        this.active = true; return true;
      }
      var resume = t.lastActive && (now - t.lastActive) < TRIAL_GRACE_MS;
      if (hasSessionMarker() || resume) {       /* same sitting: tab still open, or quick return */
        t.lastActive = now; writeTrial(t); markSession();
        this.active = true; return true;
      }
      this.active = false; return false;        /* the one free session is over */
    },
    isLocked: function () { return !Plan.isPro() && !this.active; },
    heartbeat: function () {
      if (this.isLocked()) return;
      var t = readTrial();
      if (t && t.startedAt) { t.lastActive = Date.now(); writeTrial(t); }
    },
    /* test/dev hook: simulate time passing + a fresh browser session */
    _age: function (ms) {
      memorySession = false;
      try { sessionStorage.removeItem(TRIAL_SESSION_KEY); } catch (e) { /* ignore */ }
      var t = readTrial();
      if (t) { t.lastActive -= ms; writeTrial(t); }
    },
    _reset: function () {
      memoryTrial = null; memorySession = false; this.active = false;
      try { localStorage.removeItem(TRIAL_KEY); } catch (e) { /* ignore */ }
      try { sessionStorage.removeItem(TRIAL_SESSION_KEY); } catch (e) { /* ignore */ }
    }
  };

  /* ---------- Sanitize products loaded from storage ---------- */
  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) && n >= 0 ? n : fallback;
  }

  function sanitizeProduct(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var price = Number(raw.sellingPrice);
    var units = Number(raw.unitsSold);
    if (!isFinite(price) || price <= 0) return null;      // unusable entry
    if (!isFinite(units) || units < 1) units = 1;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      name: String(raw.name || 'Unnamed product').slice(0, 120),
      sellingPrice: price,
      purchaseCost: num(raw.purchaseCost, 0),
      adCostPerSale: num(raw.adCostPerSale, 0),
      shippingCost: num(raw.shippingCost, 0),
      platformFees: num(raw.platformFees, 0),
      discountPerSale: num(raw.discountPerSale, 0),
      returnCostPerSale: num(raw.returnCostPerSale, 0),
      unitsSold: Math.round(units),
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
    };
  }

  function uid() {
    try {
      if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    } catch (e) { /* fall through */ }
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function samples() {
    return SAMPLE_PRODUCTS.map(function (p) {
      return Object.assign({}, p);
    });
  }

  /* Sample set depends on the plan: FREE loads 3 illustrative
     products (profitable / low / losing); PRO loads all 6. */
  function samplesForPlan() {
    var all = samples();
    if (Plan.isPro()) return all;
    return all.filter(function (p) {
      return FREE_SAMPLE_IDS.indexOf(p.id) !== -1;
    });
  }

  /* =============================================================
     CSV export / import (pure functions — also used by the tests)
     ============================================================= */
  var CSV_HEADERS = ['Name', 'Selling Price', 'Purchase Cost', 'Ad Cost per Sale',
                     'Shipping Cost', 'Platform Fees', 'Discount per Sale',
                     'Return Cost per Sale', 'Units Sold'];

  var CSV_KEYS = ['name', 'sellingPrice', 'purchaseCost', 'adCostPerSale',
                  'shippingCost', 'platformFees', 'discountPerSale',
                  'returnCostPerSale', 'unitsSold'];

  function csvEscape(v) {
    var s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(products) {
    var lines = [CSV_HEADERS.join(',')];
    products.forEach(function (p) {
      lines.push(CSV_KEYS.map(function (k) { return csvEscape(p[k]); }).join(','));
    });
    return lines.join('\n') + '\n';
  }

  /* Minimal but correct CSV parser: handles quoted fields, doubled
     quotes, commas inside quotes and CRLF line endings. */
  function parseCsv(text) {
    var rows = [], cur = [], field = '', inQ = false, i, c;
    text = String(text);
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else if (c === '"') {
        inQ = true;
      } else if (c === ',') {
        cur.push(field); field = '';
      } else if (c === '\n') {
        cur.push(field); field = ''; rows.push(cur); cur = [];
      } else if (c !== '\r') {
        field += c;
      }
    }
    if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
    return rows.filter(function (r) { return !(r.length === 1 && r[0].trim() === ''); });
  }

  var HEADER_ALIASES = (function () {
    var map = {};
    CSV_KEYS.forEach(function (k, i) {
      map[CSV_HEADERS[i].toLowerCase().replace(/[^a-z0-9]/g, '')] = k;
    });
    // a few friendly alternatives
    map['price'] = 'sellingPrice';
    map['sellingprice'] = 'sellingPrice';
    map['adcost'] = 'adCostPerSale';
    map['advertisingcost'] = 'adCostPerSale';
    map['units'] = 'unitsSold';
    map['qty'] = 'unitsSold';
    return map;
  })();

  var COLUMN_LABELS = {
    name: 'Product name', sellingPrice: 'Selling price', purchaseCost: 'Purchase cost',
    adCostPerSale: 'Advertising cost per sale', shippingCost: 'Shipping cost',
    platformFees: 'Platform/payment fees', discountPerSale: 'Discount per sale',
    returnCostPerSale: 'Return/refund cost per sale', unitsSold: 'Units sold'
  };

  /* Returns null when the row is valid, or a human-readable reason
     explaining exactly what is wrong with it. */
  function rowError(o) {
    if (!o.name || !String(o.name).trim()) return 'Missing product name';
    var price = Number(o.sellingPrice);
    if (!isFinite(price) || price <= 0) return 'Selling price must be a number greater than $0';
    var units = Number(o.unitsSold);
    if (!isFinite(units) || units < 1 || !Number.isInteger(units)) return 'Units sold must be a whole number of at least 1';
    var costKeys = ['purchaseCost', 'adCostPerSale', 'shippingCost',
                    'platformFees', 'discountPerSale', 'returnCostPerSale'];
    for (var i = 0; i < costKeys.length; i++) {
      var raw = o[costKeys[i]];
      if (raw === undefined || String(raw).trim() === '') continue; // blank cost = $0
      var v = Number(raw);
      if (!isFinite(v)) return 'Invalid number in \u201C' + COLUMN_LABELS[costKeys[i]] + '\u201D';
      if (v < 0) return 'Negative value in \u201C' + COLUMN_LABELS[costKeys[i]] + '\u201D';
    }
    return null;
  }

  /* Parse CSV text into products.
     Returns:
       products        — valid products, ready to add
       errors          — [{ row: <line number>, name, reason }] for invalid rows
       skipped         — errors.length (kept for backward compatibility)
       missingColumns  — friendly names of required columns absent from the header
       rowCount        — number of data rows in the file                          */
  function fromCsv(text) {
    var rows = parseCsv(text);
    if (!rows.length) return { products: [], errors: [], skipped: 0, missingColumns: null, rowCount: 0 };

    var header = rows[0].map(function (h) {
      return HEADER_ALIASES[String(h).toLowerCase().replace(/[^a-z0-9]/g, '')] || null;
    });

    if (header.indexOf('name') === -1 || header.indexOf('sellingPrice') === -1 ||
        header.indexOf('unitsSold') === -1) {
      var missing = [];
      if (header.indexOf('name') === -1) missing.push(COLUMN_LABELS.name);
      if (header.indexOf('sellingPrice') === -1) missing.push(COLUMN_LABELS.sellingPrice);
      if (header.indexOf('unitsSold') === -1) missing.push(COLUMN_LABELS.unitsSold);
      return { products: [], errors: [], skipped: 0, missingColumns: missing,
               rowCount: Math.max(0, rows.length - 1) };
    }

    var products = [], errors = [];
    rows.slice(1).forEach(function (cells, i) {
      var o = {};
      header.forEach(function (key, idx) {
        if (!key) return; // unknown column — ignored
        var cell = cells[idx];
        if (cell === undefined) return;
        if (key === 'name') o.name = String(cell).trim().slice(0, 120);
        else if (cell !== '') o[key] = cell.trim();
      });
      if (!Object.keys(o).length) return; // completely empty line
      var reason = rowError(o);
      if (!reason) {
        products.push({
          id: uid(),
          name: o.name,
          sellingPrice: Number(o.sellingPrice),
          purchaseCost: Number(o.purchaseCost || 0),
          adCostPerSale: Number(o.adCostPerSale || 0),
          shippingCost: Number(o.shippingCost || 0),
          platformFees: Number(o.platformFees || 0),
          discountPerSale: Number(o.discountPerSale || 0),
          returnCostPerSale: Number(o.returnCostPerSale || 0),
          unitsSold: Number(o.unitsSold),
          createdAt: new Date().toISOString()
        });
      } else {
        errors.push({ row: i + 2, name: String(o.name || '').slice(0, 40), reason: reason });
      }
    });
    return { products: products, errors: errors, skipped: errors.length,
             missingColumns: null, rowCount: rows.length - 1 };
  }

  var CSV = { HEADERS: CSV_HEADERS, KEYS: CSV_KEYS, toCsv: toCsv, parseCsv: parseCsv, fromCsv: fromCsv };

  /* ---------- Public store API ---------- */
  var Store = {

    /** True when products persist in localStorage; false in preview/memory mode. */
    isPersistent: function () { return persistent; },

    /** Load products. First visit starts empty — the welcome screen
        and the "Try Demo Data" button handle onboarding. */
    load: function () {
      if (!persistent) {
        return memory ? memory.slice() : [];
      }
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw !== null) {
          var arr = JSON.parse(raw);
          if (!Array.isArray(arr)) return [];
          return arr.map(sanitizeProduct).filter(Boolean);
        }
        return []; // first visit, or the user cleared their data
      } catch (e) {
        return [];
      }
    },

    /** One-time onboarding flag (welcome screen). */
    isOnboarded: function () {
      if (!persistent) return memoryOnboarded;
      try { return localStorage.getItem(ONBOARD_KEY) === '1'; }
      catch (e) { return memoryOnboarded; }
    },
    markOnboarded: function () {
      memoryOnboarded = true;
      if (!persistent) return;
      try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) { /* ignore */ }
    },

    /** Demo products ship with the app and can be removed in one click.
        User-created products never match this test. */
    isDemoProduct: function (p) {
      return !!p && typeof p.id === 'string' && p.id.indexOf('sample-') === 0;
    },

    /** Persist the products array. */
    save: function (products) {
      memory = products.slice();
      if (!persistent) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
      } catch (e) { /* storage full or blocked — keep going in memory */ }
    },

    samples: samples,
    samplesForPlan: samplesForPlan,
    uid: uid
  };

  global.PL_STORE = Store;
  global.PL_CSV = CSV;
  global.PL_PLAN = Plan;
  global.PL_TRIAL = Trial;

  /* Node.js export (used by the automated tests) */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Store: Store, SAMPLE_PRODUCTS: SAMPLE_PRODUCTS, CSV: CSV, Plan: Plan, Trial: Trial };
  }

})(typeof window !== 'undefined' ? window : globalThis);
