/* Simplex Tutor — main.js: bootstraps index.html.
 * On load: if a saved exercise exists in localStorage, resume it exactly
 * where it stopped (including the back/forward timeline). "תרגיל חדש"
 * clears the saved state and returns to the setup form. The setup form can
 * also launch any saved library exercise, routed here by its mode.
 */
(function () {
  'use strict';

  var setupView = document.getElementById('setup-view');
  var tutorView = document.getElementById('tutor-view');
  var Sx = window.Simplex;

  function showSetup() {
    Sx.store.clear();
    Sx.currentSession = null;
    tutorView.hidden = true;
    setupView.hidden = false;
    Sx.problemSetupUI.init(setupView, startProblem, startReverse, startExercise);
    window.scrollTo(0, 0);
  }

  function launch(session) {
    Sx.currentSession = session; // for the ask-Claude sidebar
    setupView.hidden = true;
    tutorView.hidden = false;
    Sx.wizardUI.init(session, tutorView, showSetup);
    window.scrollTo(0, 0);
  }

  function startProblem(problem, opts) {
    launch(Sx.session.createSession(problem, opts));
  }

  function startReverse(problem) {
    launch(Sx.session.createReverseSession(problem));
  }

  /** Route a library entry (or a random duality/dual-simplex problem) to the
   *  right session factory; reading cards render statically. */
  function startExercise(entry, opts) {
    opts = opts || {};
    var m = entry.mode, d = entry.data, Se = Sx.session, session;
    if (m === 'reading') { showReading(entry); return; }
    if (m === 'forward') {
      var prob = d.problem || d;
      session = Se.createSession(prob, { examMode: opts.examMode, startBasis: d.startBasis, maxIters: d.maxIters });
    } else if (m === 'duality') { session = Se.createDualitySession(d, opts); }
    else if (m === 'dualsimplex') { session = Se.createDualSimplexSession(d, opts); }
    else if (m === 'sensitivity') { session = Se.createSensitivitySession(d, opts); }
    else if (m === 'guided') { session = Se.createGuidedSession(d, opts); }
    else if (m === 'reverse') { session = Se.createReverseSession(d, opts); }
    else if (m === 'reverse-data') { session = Se.createReverseFromData(d, opts); }
    else { window.alert('סוג תרגיל לא נתמך: ' + m); return; }
    launch(session);
  }

  function stripHtml(h) {
    var div = document.createElement('div');
    div.innerHTML = h;
    return div.textContent;
  }

  /** Reading card (a proof / derivation): static question + solution + a
   *  "open in Claude" deep link seeded with the proof text. Not a session. */
  function showReading(entry) {
    Sx.store.clear();
    Sx.currentSession = null;
    setupView.hidden = true;
    tutorView.hidden = false;
    ['problem-ref', 'timeline-bar', 'history', 'workspace'].forEach(function (id) {
      document.getElementById(id).innerHTML = '';
    });
    var d = entry.data;
    var card = document.getElementById('prompt-card');
    card.innerHTML = '<div class="card reading-card">' +
      '<h2>📖 ' + entry.source + ' · ' + entry.title + '</h2>' +
      '<div class="reading-q"><h3>השאלה</h3>' + d.question + '</div>' +
      '<div class="reading-sol"><h3>הפתרון</h3>' + d.solution + '</div>' +
      '<div class="reading-actions"></div></div>';
    var actions = card.querySelector('.reading-actions');
    var claudeLink = document.createElement('a');
    claudeLink.className = 'btn primary';
    claudeLink.target = '_blank';
    claudeLink.textContent = '💬 פתח בקלוד לשאלות על ההוכחה ↗';
    var ctx = 'שאלת קריאה / הוכחה מהקורס: ' + entry.source + ' · ' + entry.title +
      '\n\nהשאלה:\n' + stripHtml(d.question) + '\n\nהפתרון שהוצג:\n' + stripHtml(d.solution);
    claudeLink.href = Sx.askSidebar.buildClaudeUrl(
      'הסבר לי את ההוכחה הזו צעד-צעד ובמילים פשוטות, ואם יש נקודה עדינה — הדגש אותה.', ctx);
    var back = document.createElement('button');
    back.className = 'btn';
    back.type = 'button';
    back.textContent = '← חזרה לרשימה';
    back.addEventListener('click', showSetup);
    actions.appendChild(claudeLink);
    actions.appendChild(back);
    window.scrollTo(0, 0);
  }

  function resume(saved) {
    Sx.currentSession = saved.session;
    setupView.hidden = true;
    tutorView.hidden = false;
    Sx.wizardUI.init(saved.session, tutorView, showSetup, saved);
    window.scrollTo(0, 0);
  }

  document.getElementById('new-problem').addEventListener('click', showSetup);

  var saved = Sx.store.load();
  if (saved && saved.session && saved.session.problem) {
    resume(saved);
  } else {
    tutorView.hidden = true;
    setupView.hidden = false;
    Sx.problemSetupUI.init(setupView, startProblem, startReverse, startExercise);
  }
})();
