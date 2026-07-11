/* Simplex Tutor — store.js
 * localStorage persistence: the session (plus the back/forward timeline) is
 * saved after every step, so a refresh resumes exactly where you stopped.
 * The session object is plain JSON by design, so save/restore is a straight
 * stringify/parse — no rehydration logic needed.
 */
(function () {
  'use strict';

  var KEY = 'simplex_tutor_state_v1';

  var api = {
    save: function (state) {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          session: state.session,
          past: state.past || [],
          future: state.future || [],
          savedAt: Date.now(),
        }));
      } catch (e) { /* storage full/blocked — the app still works, just without resume */ }
    },
    load: function () {
      try {
        var raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    clear: function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    },
    KEY: KEY,
  };

  window.Simplex = window.Simplex || {};
  window.Simplex.store = api;
})();
