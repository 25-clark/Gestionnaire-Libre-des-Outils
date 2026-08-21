(function () {
  function boot() {
    if (document.getElementById('glo-palette')) return;

    var root = document.createElement('div');
    root.id = 'glo-palette';
    root.className = 'glo-palette-overlay';
    root.hidden = true;
    root.innerHTML =
      '<div class="glo-palette-box" role="dialog" aria-label="Recherche rapide">' +
      '<div class="glo-palette-input-wrap"><i class="bi bi-search"></i>' +
      '<input type="text" id="glo-palette-input" placeholder="Rechercher outils, tickets, activités… (Ctrl+K)" autocomplete="off" />' +
      '</div><ul id="glo-palette-results" class="glo-palette-results"></ul>' +
      '<div class="glo-palette-foot"><span>↑↓ naviguer</span><span>Entrée ouvrir</span><span>Échap fermer</span></div></div>';
    document.body.appendChild(root);

    var input = document.getElementById('glo-palette-input');
    var list = document.getElementById('glo-palette-results');
    var active = -1;
    var items = [];
    var timer = null;

    function openPalette() {
      root.hidden = false;
      input.value = '';
      list.innerHTML = '<li class="glo-palette-item" style="opacity:.6">Tapez pour rechercher…</li>';
      items = [];
      active = -1;
      setTimeout(function () { input.focus(); }, 20);
    }
    function closePalette() {
      root.hidden = true;
    }
    function escapeHtml(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function render() {
      if (!items.length) {
        list.innerHTML = '<li class="glo-palette-item" style="opacity:.6">Aucun résultat</li>';
        return;
      }
      list.innerHTML = items.map(function (it, i) {
        return '<li class="glo-palette-item' + (i === active ? ' actif' : '') + '" data-i="' + i + '">' +
          '<i class="bi ' + (it.icon || 'bi-circle') + '"></i>' +
          '<span class="lab">' + escapeHtml(it.label) + '</span>' +
          '<span class="meta">' + escapeHtml(it.meta || it.type || '') + '</span></li>';
      }).join('');
    }
    function search(q) {
      if (!q) {
        list.innerHTML = '<li class="glo-palette-item" style="opacity:.6">Tapez pour rechercher…</li>';
        items = [];
        return;
      }
      list.innerHTML = '<li class="glo-palette-item" style="opacity:.6">Recherche…</li>';
      fetch('/recherche/api?q=' + encodeURIComponent(q), {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) {
          items = data.resultats || [];
          active = items.length ? 0 : -1;
          render();
        })
        .catch(function (err) {
          console.error('[palette]', err);
          list.innerHTML = '<li class="glo-palette-item" style="color:#b91c1c">Erreur de recherche</li>';
          items = [];
        });
    }

    document.addEventListener('keydown', function (e) {
    try {
      var pr = JSON.parse(localStorage.getItem('glo_prefs') || '{}');
      if (pr && pr.raccourci_ctrl_k === false) return;
    } catch (err) {}

      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (root.hidden) openPalette(); else closePalette();
        return;
      }
      if (root.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length) { active = (active + 1) % items.length; render(); }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length) { active = (active - 1 + items.length) % items.length; render(); }
        return;
      }
      if (e.key === 'Enter' && active >= 0 && items[active]) {
        e.preventDefault();
        var href = items[active].href;
        if (href && href !== '#') {
          if (items[active].type === 'outil' && /^https?:/i.test(href)) window.open(href, '_blank');
          else window.location.href = href;
        }
        closePalette();
      }
    });

    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      timer = setTimeout(function () { search(q); }, 150);
    });
    list.addEventListener('click', function (e) {
      var li = e.target.closest('.glo-palette-item');
      if (!li || li.getAttribute('data-i') == null) return;
      var i = parseInt(li.getAttribute('data-i'), 10);
      if (items[i] && items[i].href && items[i].href !== '#') {
        if (items[i].type === 'outil' && /^https?:/i.test(items[i].href)) window.open(items[i].href, '_blank');
        else window.location.href = items[i].href;
      }
      closePalette();
    });
    root.addEventListener('click', function (e) {
      if (e.target === root) closePalette();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
