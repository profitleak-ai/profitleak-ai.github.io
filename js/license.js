/* =============================================================
   ProfitLeak AI — Pro license activation (v1.8)
   Buyers receive a Gumroad license key right after purchase and
   paste it on the Pricing page. The key is verified ONCE against
   Gumroad's license API; the result is stored in the browser.
   After activation the app keeps working fully offline, exactly
   as before — no account, no server of ours, data stays local.
   ============================================================= */
(function (global) {
  'use strict';

  var LICENSE_STORAGE_KEY = 'profitleak.license.v1';

  /* ==== STORE CONNECTION ===========================================
     These two constants connect the app to your Gumroad product.
     They are filled in when the store goes live. Until then the
     license box stays hidden and Pro stays available only
     upgrade flow, so nothing on the live site ever looks broken.
     ================================================================= */
  var GUMROAD_PRODUCT_ID = '_tMI22ClXjG_kUeB9tu37Q==';  // live listing (international)
  var GUMROAD_PRODUCT_URL = 'https://profitleakai.gumroad.com/l/ecommerce-profit-calculator';
  /* The same Pro license is also sold through an earlier Gumroad listing.
     Gumroad verifies a key against ONE product per call, so keys bought
     there are checked against these extra ids after the primary one. */
  var EXTRA_PRODUCT_IDS = ['HuG5_rdmz94J0jfKZ9mf_A=='];

  /* ---------- storage (localStorage with memory fallback) ---------- */
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
  var memoryLicense = null;

  function readLicense() {
    if (!persistent) return memoryLicense;
    try {
      var raw = localStorage.getItem(LICENSE_STORAGE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj.key !== 'string' || !obj.key) return null;
      return { key: obj.key, email: typeof obj.email === 'string' ? obj.email : '',
               activatedAt: typeof obj.activatedAt === 'string' ? obj.activatedAt : '',
               expiresAt: typeof obj.expiresAt === 'string' ? obj.expiresAt : '' };
    } catch (e) {
      return null;
    }
  }

  function writeLicense(license) {
    memoryLicense = license;
    if (!persistent) return;
    try {
      if (license) localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(license));
      else localStorage.removeItem(LICENSE_STORAGE_KEY);
    } catch (e) { /* storage blocked — keep going in memory */ }
  }

  var state = { license: readLicense() };

  /* ---------- key normalization ----------
     Gumroad keys look like 85DB562A-C11D4B06-A2335A6B-8C079166.
     Accept pastes with spaces, lowercase and stray characters. */
  function normalizeKey(k) {
    return String(k || '')
      .trim()
      .toUpperCase()
      .replace(/[\s\u00A0]+/g, '')
      .replace(/[^A-Z0-9-]/g, '');
  }

  /* ---------- Gumroad license verify API ----------
     gumroad.com/api — one call at activation time only. */
  function verifyWithGumroad(key, productId) {
    var body = new URLSearchParams();
    body.set('product_id', productId);
    body.set('license_key', key);
    body.set('increment_uses_count', 'false'); // activation may be repeated on new devices

    return fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).then(function (res) {
      /* Gumroad answers 404 with {success:false} for unknown keys —
         that is a normal rejection, not a network problem. */
      return res.json().catch(function () { return null; }).then(function (data) {
        if (data && data.success !== true) {
          return { valid: false, retry: true, reason: 'This license key was not recognized. Double-check the code from your purchase email.' };
        }
        if (!data) {
          return { valid: false, reason: 'Gumroad could not be reached (HTTP ' + res.status + '). Please try again in a moment.' };
        }
        var p = data.purchase || {};
        if (p.refunded) {
          return { valid: false, reason: 'This purchase was refunded \u2014 the license is no longer valid.' };
        }
        if (p.disputed) {
          return { valid: false, reason: 'This purchase is under payment dispute \u2014 the license cannot be activated.' };
        }
        return { valid: true, email: typeof p.email === 'string' ? p.email : '' };
      });
    });
  }

  /* ---------- site checkout keys (PL-…) ----------
     Keys bought through the on-site checkout (PayPal / card /
     crypto) are HMAC-signed and verified by our Netlify endpoint. */
  var SITE_VERIFY_URL = 'https://profitleak.netlify.app/.netlify/functions/license-verify';
  function verifyWithSite(key) {
    return fetch(SITE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key })
    }).then(function (res) {
      if (!res.ok) {
        return { valid: false, retry: false, reason: 'Could not reach the license server (HTTP ' + res.status + '). Please try again in a moment.' };
      }
      return res.json().then(function (d) {
        if (d && d.success) return { valid: true, email: d.email || '', expiresAt: d.expiresAt || '' };
        return { valid: false, retry: false, reason: 'This license key was not recognized. Double-check the code you received after payment.' };
      });
    }).catch(function () {
      return { valid: false, retry: false, reason: 'Activation needs an internet connection. Check your connection and try again.' };
    });
  }

  /* ---------- multi-store verification ----------
     A key that exists on any listing activates. Only plain
     \"not recognized\" rejections fall through to the next listing;
     refunded / disputed / unreachable stop immediately so the most
     accurate reason reaches the user. */
  function verifyAgainstStores(key) {
    var ids = [GUMROAD_PRODUCT_ID].concat(EXTRA_PRODUCT_IDS).filter(function (v, i, a) {
      return !!v && a.indexOf(v) === i;
    });
    var lastRejection = null;
    function attempt(i) {
      if (i >= ids.length) {
        return Promise.resolve(lastRejection || { valid: false, reason: 'This license key was not recognized. Double-check the code from your purchase email.' });
      }
      return verifyWithGumroad(key, ids[i]).then(function (r) {
        if (r.valid || !r.retry) return r;
        lastRejection = r;
        return attempt(i + 1);
      });
    }
    return attempt(0);
  }

  function activate(rawKey) {
    if (!GUMROAD_PRODUCT_ID) {
      return Promise.resolve({
        ok: false,
        reason: 'License activation is not connected yet \u2014 it becomes available the moment the store goes live.'
      });
    }
    var key = normalizeKey(rawKey);
    if (key.length < 8) {
      return Promise.resolve({
        ok: false,
        reason: 'That code looks too short \u2014 copy the complete license key from your purchase email.'
      });
    }
    /* PL-… (lifetime) and PLS-… (subscription) keys come from the on-site checkout */
    if (key.indexOf('PL-') === 0 || key.indexOf('PLS-') === 0) {
      return verifyWithSite(key).then(function (r) {
        if (!r.valid) return { ok: false, reason: r.reason };
        state.license = { key: key, email: r.email, activatedAt: new Date().toISOString(),
                          expiresAt: r.expiresAt || '' };
        writeLicense(state.license);
        notify();
        return { ok: true, license: getLicense() };
      });
    }
    return verifyAgainstStores(key).then(function (r) {
      if (!r.valid) return { ok: false, reason: r.reason };
      /* Gumroad purchases = one year of Pro (v1.21) */
      var y = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
      state.license = { key: key, email: r.email, activatedAt: new Date().toISOString(), expiresAt: y };
      writeLicense(state.license);
      notify();
      return { ok: true, license: getLicense() };
    }).catch(function () {
      return { ok: false, reason: 'Activation needs an internet connection. Check your connection and try again.' };
    });
  }

  function deactivate() {
    state.license = null;
    writeLicense(null);
    notify();
  }

  function getLicense() {
    return state.license ? {
      key: state.license.key,
      email: state.license.email,
      activatedAt: state.license.activatedAt
    } : null;
  }
  function isActive() {
    if (!state.license) return false;
    var exp = state.license.expiresAt;
    if (!exp) return true; /* lifetime (grandfathered) */
    var t = new Date(exp).getTime();
    return isFinite(t) ? t > Date.now() : true;
  }
  function isConfigured() { return !!GUMROAD_PRODUCT_ID; }
  function buyUrl() { return GUMROAD_PRODUCT_URL; }

  /* ---------- notify the plan layer (data.js) ---------- */
  var listeners = [];
  function onChange(cb) { if (typeof cb === 'function') listeners.push(cb); }
  function notify() {
    listeners.forEach(function (cb) {
      try { cb(!!state.license); } catch (e) { /* never break activation */ }
    });
  }

  var api = {
    activate: activate,
    deactivate: deactivate,
    getLicense: getLicense,
    isActive: isActive,
    isConfigured: isConfigured,
    buyUrl: buyUrl,
    onChange: onChange,
    /* exposed for the automated tests */
    _normalizeKey: normalizeKey,
    _setStoreConnection: function (id, url, extraIds) {
      GUMROAD_PRODUCT_ID = String(id || '');
      GUMROAD_PRODUCT_URL = String(url || '');
      EXTRA_PRODUCT_IDS = Array.isArray(extraIds) ? extraIds.map(String) : [];
    },
    _reset: function () { deactivate(); }
  };

  global.PL_LICENSE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);
