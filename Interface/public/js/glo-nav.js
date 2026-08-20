(function () {
  var btn = document.getElementById('btn-nav-mobile');
  var bar = document.getElementById('topbar');
  var overlay = document.getElementById('nav-overlay');
  var nav = document.getElementById('nav-principale');
  if (!bar) return;

  function isMobileNav() {
    return window.matchMedia('(max-width: 860px)').matches;
  }

  function setNavOpen(open) {
    open = !!open && isMobileNav();
    bar.classList.toggle('nav-ouverte', open);
    document.body.classList.toggle('nav-drawer-open', open);
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      // Ne pas transformer le burger en X : le X est uniquement dans le drawer
      var icon = btn.querySelector('i');
      if (icon) {
        icon.classList.add('bi-list');
        icon.classList.remove('bi-x-lg');
      }
    }
    if (overlay) {
      if (open) overlay.removeAttribute('hidden');
      else overlay.setAttribute('hidden', '');
    }
    if (!open && nav) {
      nav.querySelectorAll('.menu-deroulant.ouvert').forEach(function (m) {
        m.classList.remove('ouvert');
      });
    }
  }

  // Tête du drawer + bouton fermer (mobile uniquement, masqué en CSS sur desktop)
  if (nav && !document.getElementById('btn-nav-fermer')) {
    var head = document.createElement('div');
    head.className = 'nav-drawer-head';
    head.innerHTML =
      '<span class="nav-drawer-title">Menu</span>' +
      '<button type="button" class="btn-nav-fermer" id="btn-nav-fermer" aria-label="Fermer le menu">' +
      '<i class="bi bi-x-lg" aria-hidden="true"></i></button>';
    nav.insertBefore(head, nav.firstChild);
  }

  if (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!isMobileNav()) return;
      setNavOpen(!bar.classList.contains('nav-ouverte'));
    });
  }

  if (overlay) {
    overlay.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setNavOpen(false);
    });
  }

  var btnClose = document.getElementById('btn-nav-fermer');
  if (btnClose) {
    btnClose.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setNavOpen(false);
    });
  }

  if (nav) {
    // Empêcher tout clic dans le drawer de remonter (overlay / document)
    nav.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    nav.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
    });

    // Navigation réelle uniquement → fermer le drawer
    nav.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || !nav.contains(a)) return;
      // ignorer les ancres vides
      var href = a.getAttribute('href') || '';
      if (!href || href === '#') return;
      if (isMobileNav()) {
        setTimeout(function () { setNavOpen(false); }, 80);
      }
    });
  }

  // Sous-menus au clic (mobile / tablette + menu utilisateur)
  document.querySelectorAll('.menu-deroulant > .lien-menu-deroulant').forEach(function (btnMenu) {
    btnMenu.addEventListener('click', function (e) {
      var parent = btnMenu.closest('.menu-deroulant');
      if (!parent) return;
      var isUser = parent.classList.contains('menu-utilisateur');
      var needClick = isUser || isMobileNav() || window.matchMedia('(max-width: 1024px)').matches;
      if (!needClick) return; // desktop hover CSS

      e.preventDefault();
      e.stopPropagation();

      var wasOpen = parent.classList.contains('ouvert');
      // Fermer uniquement les autres sous-menus du même parent (drawer ou topbar)
      var root = (nav && nav.contains(parent)) ? nav : bar;
      root.querySelectorAll('.menu-deroulant.ouvert').forEach(function (m) {
        if (m !== parent) m.classList.remove('ouvert');
      });
      if (wasOpen) parent.classList.remove('ouvert');
      else parent.classList.add('ouvert');
    });
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest && (t.closest('#nav-principale') || t.closest('#btn-nav-mobile') || t.closest('.menu-deroulant'))) {
      return;
    }
    // Fermer sous-menus hors drawer
    document.querySelectorAll('.menu-deroulant.ouvert').forEach(function (m) {
      if (bar.classList.contains('nav-ouverte') && nav && nav.contains(m)) return;
      m.classList.remove('ouvert');
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setNavOpen(false);
  });

  // Si on repasse en desktop, fermer le drawer
  window.addEventListener('resize', function () {
    if (!isMobileNav()) setNavOpen(false);
  });
})();
