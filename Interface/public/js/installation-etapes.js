/**
 * Installation GLO : Entrée dans un champ = passer à l'étape suivante
 * si tous les champs requis du formulaire sont valides.
 */
(function () {
  function formPret(form) {
    if (!form) return false;
    // HTML5 validity (required, minlength, etc.)
    if (typeof form.checkValidity === 'function') {
      return form.checkValidity();
    }
    var required = form.querySelectorAll('[required]');
    for (var i = 0; i < required.length; i++) {
      var el = required[i];
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (!el.checked) return false;
      } else if (!(el.value || '').trim()) {
        return false;
      }
    }
    return true;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('form-etape') || document.querySelector('form');
    if (!form) return;

    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.keyCode !== 13) return;
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      // Laisser Entrée normale dans textarea
      if (tag === 'textarea') return;
      // Sur un bouton submit, comportement natif
      if (tag === 'button' || (tag === 'input' && e.target.type === 'submit')) return;

      e.preventDefault();
      if (formPret(form)) {
        // Évite double envoi
        if (form.dataset.submitting === '1') return;
        form.dataset.submitting = '1';
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.submit();
        }
      } else {
        // Affiche les messages de validation natifs
        if (typeof form.reportValidity === 'function') {
          form.reportValidity();
        }
      }
    });
  });
})();
