const API = '/api';
let token = localStorage.getItem('token');
let currentPage = 'dashboard';
let chartInstance = null;

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 401) {
    logout();
    throw new Error('Unauthorized');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('app').classList.add('flex');
  navigate('dashboard');
}

function logout() {
  token = null;
  localStorage.removeItem('token');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('app').classList.remove('flex');
  document.getElementById('login-screen').classList.remove('hidden');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-user').value;
  const password = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    token = data.token;
    localStorage.setItem('token', token);
    errEl.classList.add('hidden');
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', logout);

if (token) showApp();

document.querySelectorAll('.sidebar-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(link.dataset.page);
  });
});

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.sidebar-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === page);
    l.classList.toggle('text-slate-400', l.dataset.page !== page);
  });
  const titles = {
    dashboard: ['Dashboard', 'Overview of all monitors'],
    monitors: ['Monitors', 'Manage your websites'],
    incidents: ['Incidents', 'Downtime history'],
    alerts: ['Alerts', 'Notification history'],
    logs: ['Check Logs', 'Raw check results'],
  };
  document.getElementById('page-title').textContent = titles[page][0];
  document.getElementById('page-subtitle').textContent = titles[page][1];
  loadPage(page);
}

async function loadPage(page) {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="text-center text-slate-500 py-20">Loading…</div>';
  try {
    if (page === 'dashboard') await renderDashboard(content);
    else if (page === 'monitors') await renderMonitors(content);
    else if (page === 'incidents') await renderIncidents(content);
    else if (page === 'alerts') await renderAlerts(content);
    else if (page === 'logs') await renderLogs(content);
  } catch (err) {
    content.innerHTML = `<div class="text-red-400 text-center py-20">${err.message}</div>`;
  }
}

async function renderDashboard(el) {
  const data = await api('/dashboard');
  const o = data.overview;

  el.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div class="text-sm text-slate-400 mb-1">Sites Up</div>
        <div class="text-3xl font-bold text-emerald-400 flex items-center gap-2">
          <span class="status-dot status-up"></span>${o.sitesUp}
        </div>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div class="text-sm text-slate-400 mb-1">Sites Down</div>
        <div class="text-3xl font-bold text-red-400 flex items-center gap-2">
          <span class="status-dot status-down"></span>${o.sitesDown}
        </div>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div class="text-sm text-slate-400 mb-1">Uptime</div>
        <div class="text-3xl font-bold text-sky-400">${o.uptimePercent}%</div>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div class="text-sm text-slate-400 mb-1">Avg Response</div>
        <div class="text-3xl font-bold">${o.avgResponseTime != null ? o.avgResponseTime + ' ms' : '—'}</div>
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 text-sm">
      <div class="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
        <span class="text-slate-400">Checks Today</span>
        <div class="font-semibold text-lg">${o.checksToday}</div>
      </div>
      <div class="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
        <span class="text-slate-400">Failed Checks</span>
        <div class="font-semibold text-lg text-red-400">${o.failedChecks}</div>
      </div>
      <div class="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
        <span class="text-slate-400">Paused</span>
        <div class="font-semibold text-lg">${o.sitesPaused}</div>
      </div>
      <div class="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
        <span class="text-slate-400">Last Check</span>
        <div class="font-semibold text-lg">${o.lastCheck ? timeAgo(o.lastCheck) : '—'}</div>
      </div>
    </div>

    <h3 class="text-lg font-semibold mb-4">Monitors</h3>
    <div class="grid gap-3" id="monitor-cards">
      ${data.monitors.length === 0 
        ? '<div class="text-slate-500 text-center py-10">No monitors yet. Click “Add Website” to start.</div>'
        : data.monitors.map(m => monitorCard(m)).join('')}
    </div>
  `;

  document.querySelectorAll('[data-monitor-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      showMonitorDetail(card.dataset.monitorId);
    });
  });
}

function monitorCard(m) {
  const statusClass = m.status === 'up' ? 'status-up' : m.status === 'down' ? 'status-down' : m.status === 'paused' ? 'status-paused' : 'status-unknown';
  const statusText = m.status === 'up' ? 'UP' : m.status === 'down' ? 'DOWN' : m.status === 'paused' ? 'PAUSED' : 'UNKNOWN';
  const statusColor = m.status === 'up' ? 'text-emerald-400' : m.status === 'down' ? 'text-red-400' : 'text-slate-400';

  return `
    <div data-monitor-id="${m.id}" class="card bg-slate-900 border border-slate-800 rounded-xl p-5 cursor-pointer flex items-center justify-between gap-4">
      <div class="flex items-center gap-4 min-w-0">
        <span class="status-dot ${statusClass} shrink-0"></span>
        <div class="min-w-0">
          <div class="font-medium truncate">${escapeHtml(m.name)}</div>
          <div class="text-sm text-slate-400 truncate">${escapeHtml(m.url)}</div>
        </div>
      </div>
      <div class="flex items-center gap-6 shrink-0 text-sm">
        <div class="text-right hidden sm:block">
          <div class="${statusColor} font-semibold">${statusText}</div>
          <div class="text-slate-500">${m.responseTime != null ? m.responseTime + ' ms' : '—'} · ${m.lastCheck ? timeAgo(m.lastCheck) : 'never'}</div>
        </div>
        <div class="text-right hidden md:block">
          <div class="text-slate-400">Uptime 24h</div>
          <div class="font-medium">${m.uptime != null ? m.uptime + '%' : '—'}</div>
        </div>
        <div class="flex gap-2">
          ${m.isPaused
            ? `<button onclick="resumeMonitor('${m.id}')" class="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg">Resume</button>`
            : `<button onclick="pauseMonitor('${m.id}')" class="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg">Pause</button>`
          }
          <button onclick="showMonitorDetail('${m.id}')" class="px-3 py-1.5 text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg">Details</button>
        </div>
      </div>
    </div>
  `;
}

async function showMonitorDetail(id) {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="text-center text-slate-500 py-20">Loading details…</div>';
  document.getElementById('page-title').textContent = 'Monitor Details';
  document.getElementById('page-subtitle').textContent = '';

  try {
    const data = await api(`/monitors/${id}`);
    const m = data.monitor;
    const last = data.lastCheck;

    content.innerHTML = `
      <button onclick="navigate('dashboard')" class="text-sm text-slate-400 hover:text-white mb-4 flex items-center gap-1">
        ← Back to Dashboard
      </button>

      <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 class="text-2xl font-bold">${escapeHtml(m.name)}</h2>
            <a href="${escapeHtml(m.url)}" target="_blank" class="text-sky-400 hover:underline text-sm">${escapeHtml(m.url)}</a>
          </div>
          <div class="flex gap-2">
            <button onclick="forceCheck('${m.id}')" class="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg">Check Now</button>
            ${m.is_paused
              ? `<button onclick="resumeMonitor('${m.id}'); showMonitorDetail('${m.id}')" class="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 rounded-lg">Resume</button>`
              : `<button onclick="pauseMonitor('${m.id}'); showMonitorDetail('${m.id}')" class="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg">Pause</button>`
            }
            <button onclick="deleteMonitor('${m.id}')" class="px-3 py-1.5 text-sm bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg">Delete</button>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div>
            <div class="text-xs text-slate-400">Status</div>
            <div class="font-semibold ${last && last.is_up ? 'text-emerald-400' : 'text-red-400'}">
              ${last ? (last.is_up ? '🟢 UP' : '🔴 DOWN') : '—'}
            </div>
          </div>
          <div>
            <div class="text-xs text-slate-400">Response</div>
            <div class="font-semibold">${last ? last.response_time_ms + ' ms' : '—'}</div>
          </div>
          <div>
            <div class="text-xs text-slate-400">Last Check</div>
            <div class="font-semibold">${last ? timeAgo(last.checked_at) : '—'}</div>
          </div>
          <div>
            <div class="text-xs text-slate-400">Interval</div>
            <div class="font-semibold">${m.interval_minutes} min</div>
          </div>
        </div>
      </div>

      <div class="grid md:grid-cols-3 gap-4 mb-6">
        ${data.uptimeHistory.map(u => `
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <div class="text-sm text-slate-400">${u.label}</div>
            <div class="text-2xl font-bold mt-1">${u.uptime != null ? u.uptime + '%' : '—'}</div>
            <div class="text-xs text-slate-500">${u.totalChecks} checks</div>
          </div>
        `).join('')}
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
        <h3 class="font-semibold mb-4">Response Time (24h)</h3>
        <canvas id="rt-chart" height="80"></canvas>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div class="px-5 py-3 border-b border-slate-800 font-semibold">Recent Checks</div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-slate-400 text-left">
              <tr>
                <th class="px-5 py-2">Time</th>
                <th class="px-5 py-2">Status</th>
                <th class="px-5 py-2">Code</th>
                <th class="px-5 py-2">Response</th>
                <th class="px-5 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              ${data.checks.slice(0, 30).map(c => `
                <tr class="border-t border-slate-800/50 hover:bg-slate-800/30">
                  <td class="px-5 py-2 whitespace-nowrap">${formatTime(c.time)}</td>
                  <td class="px-5 py-2"><span class="${c.status === 'UP' ? 'text-emerald-400' : 'text-red-400'}">${c.status}</span></td>
                  <td class="px-5 py-2">${c.code ?? '—'}</td>
                  <td class="px-5 py-2">${c.response != null ? c.response + ' ms' : '—'}</td>
                  <td class="px-5 py-2 text-slate-500 max-w-xs truncate">${c.error || ''}</td>
                </tr>
              `).join('') || '<tr><td colspan="5" class="px-5 py-8 text-center text-slate-500">No checks yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    if (data.responseTimeSeries.length > 0) {
      const ctx = document.getElementById('rt-chart').getContext('2d');
      if (chartInstance) chartInstance.destroy();
      chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.responseTimeSeries.map(p => formatTime(p.time)),
          datasets: [{
            label: 'Response (ms)',
            data: data.responseTimeSeries.map(p => p.ms),
            borderColor: '#34d399',
            backgroundColor: 'rgba(52, 211, 153, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false },
            y: {
              beginAtZero: true,
              grid: { color: '#1e293b' },
              ticks: { color: '#94a3b8' },
            },
          },
        },
      });
    }
  } catch (err) {
    content.innerHTML = `<div class="text-red-400 text-center py-20">${err.message}</div>`;
  }
}

async function renderMonitors(el) {
  const monitors = await api('/monitors');
  el.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-slate-400 text-left bg-slate-900/50">
          <tr>
            <th class="px-5 py-3">Name</th>
            <th class="px-5 py-3">URL</th>
            <th class="px-5 py-3">Interval</th>
            <th class="px-5 py-3">Status</th>
            <th class="px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${monitors.map(m => `
            <tr class="border-t border-slate-800/50 hover:bg-slate-800/20">
              <td class="px-5 py-3 font-medium">${escapeHtml(m.name)}</td>
              <td class="px-5 py-3 text-slate-400 max-w-xs truncate">${escapeHtml(m.url)}</td>
              <td class="px-5 py-3">${m.interval_minutes}m</td>
              <td class="px-5 py-3">${m.is_paused ? '<span class="text-slate-400">Paused</span>' : '<span class="text-emerald-400">Active</span>'}</td>
              <td class="px-5 py-3">
                <button onclick="showMonitorDetail('${m.id}')" class="text-sky-400 hover:underline text-xs mr-2">View</button>
                <button onclick="deleteMonitor('${m.id}')" class="text-red-400 hover:underline text-xs">Delete</button>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="5" class="px-5 py-10 text-center text-slate-500">No monitors</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

async function renderIncidents(el) {
  const incidents = await api('/incidents');
  el.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-slate-400 text-left">
          <tr>
            <th class="px-5 py-3">Monitor</th>
            <th class="px-5 py-3">Started</th>
            <th class="px-5 py-3">Ended</th>
            <th class="px-5 py-3">Duration</th>
            <th class="px-5 py-3">Code</th>
          </tr>
        </thead>
        <tbody>
          ${incidents.map(i => `
            <tr class="border-t border-slate-800/50">
              <td class="px-5 py-3 font-medium">${escapeHtml(i.monitor_name)}</td>
              <td class="px-5 py-3">${formatTime(i.started_at)}</td>
              <td class="px-5 py-3">${i.ended_at ? formatTime(i.ended_at) : '<span class="text-red-400">Ongoing</span>'}</td>
              <td class="px-5 py-3">${i.duration_seconds != null ? formatDuration(i.duration_seconds) : '—'}</td>
              <td class="px-5 py-3">${i.status_code ?? '—'}</td>
            </tr>
          `).join('') || '<tr><td colspan="5" class="px-5 py-10 text-center text-slate-500">No incidents yet 🎉</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

async function renderAlerts(el) {
  const alerts = await api('/alerts');
  el.innerHTML = `
    <div class="space-y-3">
      ${alerts.map(a => `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div class="flex items-center justify-between mb-1">
            <span class="font-medium ${a.type === 'down' ? 'text-red-400' : 'text-emerald-400'}">
              ${a.type === 'down' ? '🔴 DOWN' : '🟢 RECOVERED'} — ${escapeHtml(a.monitor_name)}
            </span>
            <span class="text-xs text-slate-500">${timeAgo(a.created_at)}</span>
          </div>
          <pre class="text-sm text-slate-400 whitespace-pre-wrap font-sans">${escapeHtml(a.message)}</pre>
        </div>
      `).join('') || '<div class="text-center text-slate-500 py-16">No alerts yet</div>'}
    </div>
  `;
}

async function renderLogs(el) {
  const logs = await api('/logs?limit=100');
  el.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="text-slate-400 text-left">
          <tr>
            <th class="px-4 py-3">Time</th>
            <th class="px-4 py-3">Monitor</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Code</th>
            <th class="px-4 py-3">ms</th>
            <th class="px-4 py-3">Error</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(l => `
            <tr class="border-t border-slate-800/40 hover:bg-slate-800/20">
              <td class="px-4 py-2 whitespace-nowrap">${formatTime(l.checked_at)}</td>
              <td class="px-4 py-2">${escapeHtml(l.monitor_name)}</td>
              <td class="px-4 py-2 ${l.is_up ? 'text-emerald-400' : 'text-red-400'}">${l.is_up ? 'UP' : 'DOWN'}</td>
              <td class="px-4 py-2">${l.status_code ?? '—'}</td>
              <td class="px-4 py-2">${l.response_time_ms ?? '—'}</td>
              <td class="px-4 py-2 text-slate-500 max-w-xs truncate">${l.error_message || ''}</td>
            </tr>
          `).join('') || '<tr><td colspan="6" class="px-4 py-10 text-center text-slate-500">No logs</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

async function pauseMonitor(id) {
  await api(`/monitors/${id}/pause`, { method: 'POST' });
  if (currentPage === 'dashboard') loadPage('dashboard');
}

async function resumeMonitor(id) {
  await api(`/monitors/${id}/resume`, { method: 'POST' });
  if (currentPage === 'dashboard') loadPage('dashboard');
}

async function deleteMonitor(id) {
  if (!confirm('Delete this monitor and all its history?')) return;
  await api(`/monitors/${id}`, { method: 'DELETE' });
  navigate('dashboard');
}

async function forceCheck(id) {
  await api(`/monitors/${id}/check`, { method: 'POST' });
  showMonitorDetail(id);
}

const modal = document.getElementById('modal');
document.getElementById('add-monitor-btn').addEventListener('click', () => {
  document.getElementById('modal-title').textContent = 'Add Website';
  document.getElementById('monitor-form').reset();
  document.getElementById('m-interval').value = 4;
  document.getElementById('m-timeout').value = 20;
  document.getElementById('m-status').value = 200;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
});

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);

function closeModal() {
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

document.getElementById('monitor-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    name: document.getElementById('m-name').value,
    url: document.getElementById('m-url').value,
    method: document.getElementById('m-method').value,
    interval_minutes: parseInt(document.getElementById('m-interval').value),
    timeout_seconds: parseInt(document.getElementById('m-timeout').value),
    expected_status: parseInt(document.getElementById('m-status').value),
  };
  try {
    await api('/monitors', { method: 'POST', body: JSON.stringify(body) });
    closeModal();
    navigate('dashboard');
  } catch (err) {
    alert(err.message);
  }
});

function timeAgo(iso) {
  const sec = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (sec < 60) return sec + 's ago';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  return Math.floor(sec / 86400) + 'd ago';
}

function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(s) {
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

setInterval(() => {
  if (currentPage === 'dashboard' && token) loadPage('dashboard');
}, 30000);
