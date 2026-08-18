(function () {
  function toast(msg, ok) {
    var el = document.getElementById('glo-toast-favori');
    if (!el) {
      el = document.createElement('div');
      el.id = 'glo-toast-favori';
      el.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;padding:12px 16px;border-radius:10px;font:600 13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.15);transition:opacity .2s;';
      document.body.appendChild(el);
    }
    el.style.background = ok ? '#ecfdf5' : '#fef2f2';
    el.style.color = ok ? '#047857' : '#b91c1c';
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(function () { el.style.opacity = '0'; }, 2200);
  }

  function setPinState(btn, epingle) {
    var icon = btn.querySelector('i');
    if (icon) {
      icon.classList.toggle('bi-pin-angle-fill', !!epingle);
      icon.classList.toggle('bi-pin-angle', !epingle);
    }
    btn.classList.toggle('est-epingle', !!epingle);
    btn.title = epingle ? 'Retirer des épinglés' : 'Épingler';
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-favori-type]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var type = btn.getAttribute('data-favori-type');
    var id = btn.getAttribute('data-favori-id');
    if (!type || !id) return;

    var url = type === 'outil' ? '/outils/' + id + '/favori' : '/activites/' + id + '/favori';
    btn.disabled = true;
    fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({})
    })
      .then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, d: d }; });
      })
      .then(function (x) {
        btn.disabled = false;
        if (!x.ok) {
          toast(x.d.message || 'Impossible d\'épingler', false);
          return;
        }
        setPinState(btn, x.d.epingle);
        toast(x.d.epingle ? 'Épinglé' : 'Retiré des épinglés', true);
      })
      .catch(function () {
        btn.disabled = false;
        toast('Erreur réseau', false);
      });
  });
})();
