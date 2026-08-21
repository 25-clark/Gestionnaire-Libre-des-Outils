/**
 * GLO — Fonctionnalités communes pour les tableaux :
 * - Clic sur <th> = tri / filtre rapide
 * - Filtres personnalisés sauvegardés en localStorage
 * - Sélection multiple d'utilisateurs (checkbox + barre d'actions)
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'glo_filtres_personnalises';

  function getFiltres() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (_) { return {}; }
  }
  function setFiltres(obj) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }

  // ---- Tri au clic sur th ----
  function initTriTableaux() {
    document.querySelectorAll('table.tableau').forEach(function (table) {
      const thead = table.querySelector('thead');
      if (!thead) return;
      thead.querySelectorAll('th').forEach(function (th, colIndex) {
        if (th.dataset.noSort === '1') return;
        th.style.cursor = 'pointer';
        th.title = (th.title || '') + ' (cliquer pour trier)';
        th.addEventListener('click', function () {
          const tbody = table.querySelector('tbody');
          if (!tbody) return;
          const rows = Array.from(tbody.querySelectorAll('tr'));
          const asc = th.dataset.sortDir !== 'asc';
          th.dataset.sortDir = asc ? 'asc' : 'desc';
          // Reset other headers
          thead.querySelectorAll('th').forEach(function (h) {
            if (h !== th) delete h.dataset.sortDir;
          });
          rows.sort(function (a, b) {
            const ca = (a.children[colIndex] && a.children[colIndex].textContent || '').trim().toLowerCase();
            const cb = (b.children[colIndex] && b.children[colIndex].textContent || '').trim().toLowerCase();
            if (ca < cb) return asc ? -1 : 1;
            if (ca > cb) return asc ? 1 : -1;
            return 0;
          });
          rows.forEach(function (r) { tbody.appendChild(r); });
        });
      });
    });
  }

  // ---- Filtre texte simple (input .filtre-tableau) ----
  function initFiltresTexte() {
    document.querySelectorAll('.filtre-tableau').forEach(function (input) {
      const tableId = input.dataset.table;
      const table = tableId ? document.getElementById(tableId) : input.closest('.carte')?.querySelector('table.tableau');
      if (!table) return;
      input.addEventListener('input', function () {
        const q = input.value.trim().toLowerCase();
        table.querySelectorAll('tbody tr').forEach(function (tr) {
          const text = tr.textContent.toLowerCase();
          tr.style.display = !q || text.includes(q) ? '' : 'none';
        });
      });
    });
  }

  // ---- Sauvegarde / restauration de filtres personnalisés ----
  window.gloSauvegarderFiltre = function (nom, config) {
    const all = getFiltres();
    all[nom] = config;
    setFiltres(all);
  };
  window.gloChargerFiltres = function () {
    return getFiltres();
  };

  // ---- Sélection multiple (utilisateurs) ----
  function initMultiSelect() {
    const bar = document.getElementById('barre-actions-multi');
    if (!bar) return;
    const checkAll = document.getElementById('select-all-users');
    const checks = document.querySelectorAll('.select-user');
    function updateBar() {
      const selected = Array.from(checks).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      bar.style.display = selected.length ? 'flex' : 'none';
      const countEl = bar.querySelector('.count-selected');
      if (countEl) countEl.textContent = selected.length;
      bar.dataset.ids = selected.join(',');
    }
    if (checkAll) {
      checkAll.addEventListener('change', function () {
        checks.forEach(function (c) { c.checked = checkAll.checked; });
        updateBar();
      });
    }
    checks.forEach(function (c) {
      c.addEventListener('change', updateBar);
    });
  }

  // ---- Copie presse-papier (credentials) ----
  window.gloCopier = function (texte) {
    if (!texte) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texte).then(function () {
        toastCopy('Copié dans le presse-papier');
      }).catch(function () {
        fallbackCopy(texte);
      });
    } else {
      fallbackCopy(texte);
    }
  };
  function toastCopy(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0f172a;color:#fff;padding:10px 14px;border-radius:10px;z-index:9999;font-size:13px;';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1600);
  }
  function fallbackCopy(texte) {
    const ta = document.createElement('textarea');
    ta.value = texte;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      var ok = document.execCommand('copy');
      if (ok) toastCopy('Copié');
      else prompt('Copiez manuellement :', texte);
    } catch (_) {
      prompt('Copiez manuellement :', texte);
    }
    document.body.removeChild(ta);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTriTableaux();
    initFiltresTexte();
    initMultiSelect();
  });
})();
