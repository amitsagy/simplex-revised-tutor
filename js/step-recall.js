/* Simplex Tutor — step-recall.js
 * "What comes next?" prompt whose options stay HIDDEN by default — the student
 * first recalls mentally; hovering/clicking the reveal button shows the list
 * (and counts as a light hint via onFirstReveal).
 */
(function () {
  'use strict';

  /**
   * opts: { question (HTML), options: [{id, label}], onFirstReveal, onChoose(id) }
   * Returns { root, markChoice(id, 'ok'|'bad'|'revealed'), disable }
   */
  function create(container, opts) {
    var revealed = false;
    var disabled = false;

    var root = document.createElement('div');
    root.className = 'recall';

    var q = document.createElement('p');
    q.className = 'prompt-q';
    q.innerHTML = opts.question;
    root.appendChild(q);

    var zone = document.createElement('div');
    zone.className = 'reveal-zone';

    var cover = document.createElement('button');
    cover.type = 'button';
    cover.className = 'reveal-cover';
    cover.textContent = 'נסה להיזכר בעצמך… ריחוף/לחיצה כאן יציג את האפשרויות';
    zone.appendChild(cover);

    var optionsBox = document.createElement('div');
    optionsBox.className = 'options';
    var buttons = {};

    opts.options.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      btn.dataset.id = String(opt.id);
      btn.innerHTML = opt.label;
      btn.addEventListener('click', function () {
        if (disabled) return;
        opts.onChoose(opt.id);
      });
      buttons[opt.id] = btn;
      optionsBox.appendChild(btn);
    });
    zone.appendChild(optionsBox);
    root.appendChild(zone);

    function reveal() {
      if (revealed) return;
      revealed = true;
      zone.classList.add('revealed');
      if (opts.onFirstReveal) opts.onFirstReveal();
    }

    cover.addEventListener('mouseenter', reveal);
    cover.addEventListener('click', reveal);

    container.appendChild(root);

    return {
      root: root,
      markChoice: function (id, status) {
        var btn = buttons[id];
        if (!btn) return;
        btn.classList.remove('ok', 'bad', 'revealed');
        btn.classList.add(status);
      },
      disable: function () {
        disabled = true;
        Object.keys(buttons).forEach(function (id) { buttons[id].disabled = true; });
      },
      revealNow: reveal,
    };
  }

  window.Simplex = window.Simplex || {};
  window.Simplex.stepRecall = { create: create };
})();
