/* Simplex Tutor — main.js: bootstraps index.html.
 * On load: if a saved exercise exists in localStorage, resume it exactly
 * where it stopped (including the back/forward timeline). "תרגיל חדש"
 * clears the saved state and returns to the setup form.
 */
(function () {
  'use strict';

  var setupView = document.getElementById('setup-view');
  var tutorView = document.getElementById('tutor-view');

  function showSetup() {
    window.Simplex.store.clear();
    window.Simplex.currentSession = null;
    tutorView.hidden = true;
    setupView.hidden = false;
    window.Simplex.problemSetupUI.init(setupView, startProblem, startReverse);
    window.scrollTo(0, 0);
  }

  function launch(session) {
    window.Simplex.currentSession = session; // for the ask-Claude sidebar
    setupView.hidden = true;
    tutorView.hidden = false;
    window.Simplex.wizardUI.init(session, tutorView, showSetup);
    window.scrollTo(0, 0);
  }

  function startProblem(problem, opts) {
    launch(window.Simplex.session.createSession(problem, opts));
  }

  function startReverse(problem) {
    launch(window.Simplex.session.createReverseSession(problem));
  }

  function resume(saved) {
    window.Simplex.currentSession = saved.session;
    setupView.hidden = true;
    tutorView.hidden = false;
    window.Simplex.wizardUI.init(saved.session, tutorView, showSetup, saved);
    window.scrollTo(0, 0);
  }

  document.getElementById('new-problem').addEventListener('click', showSetup);

  var saved = window.Simplex.store.load();
  if (saved && saved.session && saved.session.problem) {
    resume(saved);
  } else {
    tutorView.hidden = true;
    setupView.hidden = false;
    window.Simplex.problemSetupUI.init(setupView, startProblem);
  }
})();
