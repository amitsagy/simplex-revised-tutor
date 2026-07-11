/* Simplex Tutor — ask-sidebar.js
 * "Ask Claude" side panel with three paths, ordered for a broad audience:
 *  1. PRIMARY — "פתח בקלוד": opens claude.ai in a new tab with the question +
 *     full exercise context ALREADY TYPED in the chat box (claude.ai/new?q=…).
 *     Needs only a free claude.ai account — no API key, no cost, no server.
 *  2. Copy question+context to the clipboard (paste anywhere).
 *  3. Advanced (collapsed): direct in-app answer via a personal API key,
 *     stored locally. The tutor persona guides without handing over answers.
 */
(function () {
  'use strict';

  var Session = window.Simplex.session;
  var LS_KEY = 'simplex_tutor_api_key';
  var MODEL = 'claude-opus-4-8';
  var CLAUDE_NEW = 'https://claude.ai/new?q=';
  var MAX_URL_LEN = 7000;

  var DEFAULT_QUESTION = 'אני תקוע בשלב הנוכחי — עזור לי להבין מה צריך לעשות ולמה.';

  var GUIDE_NOTE = 'ענה בעברית; העדף כיוון והסבר של ההגדרה/הנוסחה על פני חשיפת התשובה המספרית של הצעד הנוכחי.';

  var SYSTEM_PROMPT =
    'אתה מדריך פרטי לקורס "מודלים דטרמיניסטיים בחקר ביצועים". הסטודנט מתרגל את ' +
    'אלגוריתם ה-Revised Simplex בפלטפורמת תרגול צעד-צעד, ומצורף המצב המדויק של התרגיל. ' +
    'ענה בעברית, קצר וממוקד. העדף להסביר את ההגדרה, הנוסחה או ההיגיון הרלוונטיים ולתת כיוון — ' +
    'אל תמסור את הערכים המספריים הסופיים של הצעד הנוכחי אלא אם הסטודנט ביקש זאת במפורש. ' +
    'השתמש בסימוני הקורס: B, N, B⁻¹, cB, cN, yᵀ, rN, aq, n̄q, xB.';

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function buildContext() {
    var s = window.Simplex.currentSession;
    if (!s) return 'אין תרגיל פעיל כרגע (הסטודנט במסך הזנת תרגיל).';
    return Session.describeSession(s);
  }

  /** The full message: intro + exercise context + the student's question. */
  function buildAskText(question, context) {
    if (context == null) context = buildContext();
    return 'אני מתרגל את אלגוריתם ה-Revised Simplex ונתקעתי. זה המצב המדויק:\n\n' +
      context +
      '\n\nהשאלה שלי: ' + (question && question.trim() ? question.trim() : DEFAULT_QUESTION) +
      '\n\n' + GUIDE_NOTE;
  }

  /** claude.ai deep link with the message prefilled; trims context if huge. */
  function buildClaudeUrl(question) {
    var url = CLAUDE_NEW + encodeURIComponent(buildAskText(question));
    if (url.length > MAX_URL_LEN) {
      var trimmed = buildContext().slice(0, 1200) + '\n…(ההקשר קוצר בשל אורך)';
      url = CLAUDE_NEW + encodeURIComponent(buildAskText(question, trimmed));
    }
    return url;
  }

  function init() {
    var fab = el('button', 'ask-fab', '💬 שאל את קלוד');
    fab.type = 'button';
    document.body.appendChild(fab);

    var panel = el('aside', 'ask-panel');
    panel.hidden = true;
    panel.innerHTML =
      '<div class="ask-head"><h3>💬 שאל את קלוד</h3>' +
      '<button type="button" class="btn ask-close">✕</button></div>' +
      '<p class="ask-sub">נתקעת? כתוב שאלה חופשית — ההקשר המלא של התרגיל (הבעיה, האיטרציה, השלב) מצורף אוטומטית. צריך רק חשבון claude.ai חינמי.</p>' +
      '<textarea class="ask-q" rows="3" placeholder="למשל: למה לוקחים את aq מהבעיה המקורית ולא מהטבלו?"></textarea>' +
      '<button type="button" class="btn primary ask-open">🚀 פתח בקלוד (חינם) ↗</button>' +
      '<div class="ask-actions">' +
      '<button type="button" class="btn ask-copy">העתק שאלה+הקשר</button>' +
      '</div>' +
      '<p class="ask-status"></p>' +
      '<div class="ask-answer" hidden></div>' +
      '<details class="ask-key-box"><summary>מתקדם: תשובות בתוך האפליקציה (מפתח API)</summary>' +
      '<p class="ask-key-note">למי שיש מפתח API של Anthropic — התשובה תופיע כאן בפאנל במקום באתר קלוד. המפתח נשמר מקומית בדפדפן בלבד.</p>' +
      '<input type="password" class="ask-key" dir="ltr" placeholder="sk-ant-...">' +
      '<button type="button" class="btn ask-key-save">שמור</button> ' +
      '<button type="button" class="btn ask-send">שלח עם המפתח</button></details>';
    document.body.appendChild(panel);

    var q = panel.querySelector('.ask-q');
    var status = panel.querySelector('.ask-status');
    var answer = panel.querySelector('.ask-answer');
    var keyInput = panel.querySelector('.ask-key');
    var sendBtn = panel.querySelector('.ask-send');

    keyInput.value = localStorage.getItem(LS_KEY) || '';

    fab.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) q.focus();
    });
    panel.querySelector('.ask-close').addEventListener('click', function () {
      panel.hidden = true;
    });

    /* PRIMARY: open claude.ai with the message prefilled */
    panel.querySelector('.ask-open').addEventListener('click', function () {
      window.open(buildClaudeUrl(q.value), '_blank');
      status.textContent = 'נפתח טאב של קלוד עם השאלה מוכנה — נשאר רק לשלוח שם.';
    });

    panel.querySelector('.ask-copy').addEventListener('click', function () {
      var text = buildAskText(q.value);
      navigator.clipboard.writeText(text).then(function () {
        status.textContent = 'הועתק! הדבק בצ׳אט של קלוד (claude.ai).';
      }, function () {
        status.textContent = 'ההעתקה נכשלה — סמן והעתק ידנית.';
        answer.hidden = false;
        answer.textContent = text;
      });
    });

    panel.querySelector('.ask-key-save').addEventListener('click', function () {
      localStorage.setItem(LS_KEY, keyInput.value.trim());
      status.textContent = 'המפתח נשמר מקומית.';
    });

    /* ADVANCED: direct API call, answer shown in-panel */
    sendBtn.addEventListener('click', function () {
      var key = (localStorage.getItem(LS_KEY) || keyInput.value || '').trim();
      var question = q.value.trim() || DEFAULT_QUESTION;
      if (!key) {
        status.textContent = 'אין מפתח שמור — הזן מפתח ולחץ "שמור", או השתמש ב"פתח בקלוד".';
        return;
      }
      status.textContent = 'שולח לקלוד…';
      sendBtn.disabled = true;
      answer.hidden = true;

      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          thinking: { type: 'adaptive' },
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: 'המצב הנוכחי בתרגיל:\n' + buildContext() + '\n\nשאלת הסטודנט: ' + question,
          }],
        }),
      }).then(function (r) { return r.json(); }).then(function (data) {
        sendBtn.disabled = false;
        if (data.type === 'error') {
          status.textContent = 'שגיאה מה-API: ' + (data.error && data.error.message || 'לא ידועה') +
            (data.error && data.error.type === 'authentication_error' ? ' (בדוק את המפתח)' : '');
          return;
        }
        var text = (data.content || []).filter(function (b) { return b.type === 'text'; })
          .map(function (b) { return b.text; }).join('\n');
        status.textContent = '';
        answer.hidden = false;
        answer.textContent = text || '(תשובה ריקה)';
      }).catch(function (err) {
        sendBtn.disabled = false;
        status.textContent = 'השליחה נכשלה (רשת?): ' + err.message +
          ' — אפשר תמיד להשתמש ב"פתח בקלוד".';
      });
    });
  }

  window.Simplex = window.Simplex || {};
  window.Simplex.askSidebar = {
    buildAskText: buildAskText,
    buildClaudeUrl: buildClaudeUrl,
    DEFAULT_QUESTION: DEFAULT_QUESTION,
  };

  init();
})();
