'use strict';

/* Brandon's Drive — commute check: Edmond <-> McLoud.
 * Traffic data comes from a small Cloudflare worker that wraps TomTom,
 * so the API key never lives in this page. */

var WORKER_URL = 'https://brandons-drive.chaoticutopia84.workers.dev';

var EDMOND = { lat: 35.6528, lon: -97.4781 };
var MCLOUD = { lat: 35.1497, lon: -97.0987 };

var REFRESH_MS = 5 * 60 * 1000;

var state = {
  direction: 'morning', // 'morning' = Edmond -> McLoud, 'evening' = McLoud -> Edmond
  avoidTolls: false,
  timer: null
};

function $(id) { return document.getElementById(id); }

function endpoints() {
  if (state.direction === 'morning') {
    return { from: EDMOND, to: MCLOUD, label: 'Edmond → McLoud' };
  }
  return { from: MCLOUD, to: EDMOND, label: 'McLoud → Edmond' };
}

function greeting() {
  var h = new Date().getHours();
  var daypart = h < 12 ? 'Morning' : (h < 17 ? 'Afternoon' : 'Evening');
  return state.direction === 'morning'
    ? daypart + ', Brandon \u2014 let\u2019s get you to McLoud.'
    : daypart + ', Brandon \u2014 let\u2019s get you home.';
}

function verdictFor(delayMin) {
  if (delayMin <= 5)  return { cls: 'good', text: 'Good to go' };
  if (delayMin <= 15) return { cls: 'ok',   text: 'Give it 15 min' };
  return { cls: 'bad', text: 'Bad out there \u2014 consider waiting' };
}

function fmtTime(d) {
  var h = d.getHours(), m = d.getMinutes();
  var ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
}

function setLoading(on) {
  $('hero').classList.toggle('loading', on);
  $('checkBtn').disabled = on;
  if (on) {
    $('driveTime').textContent = '––';
    $('vsUsual').textContent = 'Checking the roads…';
    $('verdict').hidden = true;
    $('heroDist').textContent = '';
  }
}

function showOffline() {
  setLoading(false);
  $('driveTime').textContent = '––';
  $('vsUsual').textContent = 'Can\u2019t reach traffic service \u2014 check connection';
  $('verdict').hidden = true;
  $('heroDist').textContent = '';
}

function showSetup() {
  setLoading(false);
  $('driveTime').textContent = '––';
  $('vsUsual').textContent = 'Traffic service isn\u2019t set up yet.';
  $('verdict').hidden = true;
  $('heroDist').textContent = '';
}

function renderDrive(data) {
  setLoading(false);
  var driveMin = Math.round(data.driveMin);
  var delayMin = Math.max(0, Math.round(data.delayMin || 0));
  $('driveTime').textContent = String(driveMin);
  $('vsUsual').textContent = delayMin === 0
    ? 'Right on usual time'
    : '+' + delayMin + ' min vs usual';
  var v = verdictFor(delayMin);
  var el = $('verdict');
  el.className = 'verdict ' + v.cls;
  el.textContent = v.text;
  el.hidden = false;
  if (data.distanceMi != null) {
    $('heroDist').textContent = Math.round(data.distanceMi) + ' miles via ' +
      (state.avoidTolls ? 'freeways' : 'turnpikes');
  }
  $('updated').textContent = 'Updated ' + fmtTime(new Date());
}

function renderIncidents(list) {
  var ul = $('incidents');
  ul.innerHTML = '';
  if (!list.length) {
    var li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No incidents reported on your route. Clear roads ahead.';
    ul.appendChild(li);
    return;
  }
  list.forEach(function (inc) {
    var li = document.createElement('li');
    var icon = document.createElement('span');
    icon.className = 'inc-icon';
    icon.textContent = inc.icon || '⚠️';
    var body = document.createElement('div');
    var title = document.createElement('div');
    title.className = 'inc-title';
    title.textContent = inc.title || 'Incident';
    body.appendChild(title);
    if (inc.detail) {
      var detail = document.createElement('div');
      detail.className = 'inc-detail';
      detail.textContent = inc.detail;
      body.appendChild(detail);
    }
    if (inc.delayMin != null && inc.delayMin > 0) {
      var delay = document.createElement('div');
      delay.className = 'inc-delay';
      delay.textContent = '+' + Math.round(inc.delayMin) + ' min';
      body.appendChild(delay);
    }
    li.appendChild(icon);
    li.appendChild(body);
    ul.appendChild(li);
  });
}

function readBody(res) {
  return res.json().catch(function () { return null; }).then(function (data) {
    return { ok: res.ok, status: res.status, data: data };
  });
}

function postJSON(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(readBody);
}

function getJSON(url) {
  return fetch(url).then(readBody);
}

function incidentNote(text) {
  var ul = $('incidents');
  ul.innerHTML = '';
  var li = document.createElement('li');
  li.className = 'muted';
  li.textContent = text;
  ul.appendChild(li);
}

function checkDrive() {
  var ep = endpoints();
  $('heroRoute').textContent = ep.label;
  setLoading(true);
  postJSON(WORKER_URL + '/route', {
    from: ep.from,
    to: ep.to,
    avoidTolls: state.avoidTolls
  })
  .then(function (r) {
    if (r.data && r.data.error === 'no_key') { showSetup(); return; }
    if (!r.ok || !r.data) throw new Error('http ' + r.status);
    renderDrive(r.data);
  })
  .catch(function () { showOffline(); });

  getJSON(WORKER_URL + '/incidents')
    .then(function (r) {
      if (r.data && r.data.error === 'no_key') {
        incidentNote('Traffic service isn\u2019t set up yet.');
        return;
      }
      if (!r.ok || !r.data) throw new Error('http ' + r.status);
      renderIncidents(Array.isArray(r.data) ? r.data : []);
    })
    .catch(function () { incidentNote('Couldn\u2019t load incidents right now.'); });
}

function setDirection(dir) {
  state.direction = dir;
  var morning = dir === 'morning';
  $('btnMorning').setAttribute('aria-pressed', morning ? 'true' : 'false');
  $('btnEvening').setAttribute('aria-pressed', morning ? 'false' : 'true');
  var hero = $('hero');
  hero.classList.toggle('morning', morning);
  hero.classList.toggle('evening', !morning);
  $('greeting').textContent = greeting();
  try { localStorage.setItem('bd_direction', dir); } catch (e) {}
  checkDrive();
}

function scheduleRefresh() {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(checkDrive, REFRESH_MS);
}

function init() {
  try {
    var saved = localStorage.getItem('bd_direction');
    if (saved === 'evening' || saved === 'morning') state.direction = saved;
    var savedTolls = localStorage.getItem('bd_tolls');
    if (savedTolls === 'off') { state.avoidTolls = true; $('tollToggle').checked = false; }
  } catch (e) {}

  $('btnMorning').addEventListener('click', function () { setDirection('morning'); });
  $('btnEvening').addEventListener('click', function () { setDirection('evening'); });
  $('tollToggle').addEventListener('change', function (ev) {
    state.avoidTolls = !ev.target.checked;
    try { localStorage.setItem('bd_tolls', ev.target.checked ? 'on' : 'off'); } catch (e) {}
    checkDrive();
  });
  $('checkBtn').addEventListener('click', checkDrive);

  // Paint direction state without triggering a fetch, then check.
  var morning = state.direction === 'morning';
  $('btnMorning').setAttribute('aria-pressed', morning ? 'true' : 'false');
  $('btnEvening').setAttribute('aria-pressed', morning ? 'false' : 'true');
  $('hero').classList.toggle('morning', morning);
  $('hero').classList.toggle('evening', !morning);
  $('greeting').textContent = greeting();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }

  checkDrive();
  scheduleRefresh();
}

document.addEventListener('DOMContentLoaded', init);
