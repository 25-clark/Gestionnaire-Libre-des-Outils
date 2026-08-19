(function () {
  function toast(msg, ok) {
    var el = document.getElementById('glo-toast-favori');
    if (!el) {
      el = document.createElement('div');
      el.id = 'glo-toast-favori';
      el.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;padding:12px 16px;border-radius:10px;font:600 13px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.15);transition:opacity .25s;max-width:280px;';
      document.body.appendChild(el);
    }
    el.style.background = ok ? '#ecfdf5' : '#fef2f2';
    el.style.color = ok ? '#047857' : '#b91c1c';
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; }, 2500);
  }

  function setPinState(btn, epingle) {
    var icon = btn.querySelector('i');
    if (icon) {
      icon.className = epingle ? 'bi bi-pin-angle-fill' : 'bi bi-pin-angle';
    }
    btn.classList.toggle('est-epingle', !!epingle);
    btn.title = epingle ? 'Retirer des épinglés' : 'Épingler';
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-favori-type]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.getAttribute('data-loading') === '1') return;

    var type = btn.getAttribute('data-favori-type');
    var id = btn.getAttribute('data-favori-id');
    if (!type || !id) return;

    var url = type === 'outil'
      ? '/outils/' + encodeURIComponent(id) + '/favori'
      : '/activites/' + encodeURIComponent(id) + '/favori';

    btn.setAttribute('data-loading', '1');
    btn.disabled = true;

    fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: '{}'
    })
      .then(function (r) {
        return r.text().then(function (text) {
          var data = {};
          try { data = text ? JSON.parse(text) : {}; } catch (e) {
            data = { message: r.ok ? 'Réponse invalide' : ('Erreur HTTP ' + r.status) };
          }
          return { ok: r.ok, d: data };
        });
      })
      .then(function (x) {
        btn.disabled = false;
        btn.removeAttribute('data-loading');
        if (!x.ok) {
          toast(x.d.message || 'Impossible d\'épingler', false);
          return;
        }
        setPinState(btn, !!x.d.epingle);
        toast(x.d.epingle ? 'Épinglé — visible sur le tableau de bord' : 'Retiré des épinglés', true);
        // Rafraîchir le dashboard pour mettre à jour l'arborescence des épinglés
        if (location.pathname === '/' || location.pathname === '') {
          setTimeout(function () { location.reload(); }, 450);
        }
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.removeAttribute('data-loading');
        toast('Erreur réseau', false);
        console.error('[favori]', err);
      });
  }, true);
})();
