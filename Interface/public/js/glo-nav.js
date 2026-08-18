(function () {
  var btn = document.getElementById('btn-nav-mobile');
  var bar = document.getElementById('topbar');
  if (!btn || !bar) return;

  btn.addEventListener('click', function () {
    var open = bar.classList.toggle('nav-ouverte');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var icon = btn.querySelector('i');
    if (icon) {
      icon.classList.toggle('bi-list', !open);
      icon.classList.toggle('bi-x-lg', open);
    }
  });

  // Fermer le menu après clic sur un lien (mobile)
  bar.querySelectorAll('nav a').forEach(function (a) {
    a.addEventListener('click', function () {
      if (window.matchMedia('(max-width: 860px)').matches) {
        bar.classList.remove('nav-ouverte');
        btn.setAttribute('aria-expanded', 'false');
        var icon = btn.querySelector('i');
        if (icon) {
          icon.classList.add('bi-list');
          icon.classList.remove('bi-x-lg');
        }
      }
    });
  });
})();
