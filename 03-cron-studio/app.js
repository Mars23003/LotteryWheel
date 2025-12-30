const { DateTime } = luxon;
const cronParser = window.cronParser || window["cron-parser"] || window.parser;

const timezoneList = [
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC'
];

const elements = {
  tabDecoder: document.getElementById('tab-decoder'),
  tabBuilder: document.getElementById('tab-builder'),
  decoderPanel: document.getElementById('decoder-panel'),
  builderPanel: document.getElementById('builder-panel'),
  decoderInput: document.getElementById('decoder-input'),
  decoderMode: document.getElementById('decoder-mode'),
  decoderTz: document.getElementById('decoder-timezone'),
  decoderCount: document.getElementById('decoder-count'),
  decodeBtn: document.getElementById('decode-btn'),
  loadSample: document.getElementById('load-sample'),
  humanMain: document.getElementById('human-main'),
  humanSub: document.getElementById('human-sub'),
  copyHuman: document.getElementById('copy-human'),
  copyHumanDetail: document.getElementById('copy-human-detail'),
  validationList: document.getElementById('validation-list'),
  fieldBreakdown: document.getElementById('field-breakdown'),
  nextRuns: document.getElementById('next-runs'),
  themeToggle: document.getElementById('theme-toggle'),
  resetSettings: document.getElementById('reset-settings'),
  toast: document.getElementById('toast'),
  // builder
  builderMode: document.getElementById('builder-mode'),
  builderTz: document.getElementById('builder-timezone'),
  builderCount: document.getElementById('builder-count'),
  frequencySegment: document.getElementById('frequency-segment'),
  frequencyFields: document.getElementById('frequency-fields'),
  guidedForm: document.getElementById('guided-form'),
  naturalForm: document.getElementById('natural-form'),
  naturalInput: document.getElementById('natural-input'),
  parseNatural: document.getElementById('parse-natural'),
  resetNatural: document.getElementById('reset-natural'),
  pills: document.querySelectorAll('.pill-row .pill'),
  builderCron: document.getElementById('builder-cron'),
  builderMeta: document.getElementById('builder-meta'),
  builderHuman: document.getElementById('builder-human'),
  builderPreview: document.getElementById('builder-preview'),
  copyBuilderCron: document.getElementById('copy-builder-cron'),
  copyBuilderHuman: document.getElementById('copy-builder-human'),
  applyToDecoder: document.getElementById('apply-to-decoder'),
};

const state = {
  decoder: {
    mode: 'linux',
    tz: 'Asia/Taipei',
    count: 5,
    cron: ''
  },
  builder: {
    mode: 'linux',
    tz: 'Asia/Taipei',
    count: 5,
    frequency: 'minute',
    customFields: {
      sec: '0',
      min: '*',
      hour: '*',
      dom: '*',
      month: '*',
      dow: '*',
      year: '*'
    }
  },
  forcedQuartz: false
};

function initTimezoneSelect(select) {
  timezoneList.forEach((tz) => {
    const option = document.createElement('option');
    option.value = tz;
    option.textContent = tz;
    select.appendChild(option);
  });
}

function loadPrefs() {
  const saved = localStorage.getItem('cron-studio-prefs');
  if (saved) {
    try {
      const prefs = JSON.parse(saved);
      Object.assign(state.decoder, prefs.decoder || {});
      Object.assign(state.builder, prefs.builder || {});
      if (prefs.theme === 'dark') {
        document.documentElement.classList.add('dark');
        elements.themeToggle.checked = true;
      }
    } catch (e) {
      console.error('讀取偏好失敗', e);
    }
  }
}

function savePrefs() {
  const prefs = {
    decoder: state.decoder,
    builder: state.builder,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  };
  localStorage.setItem('cron-studio-prefs', JSON.stringify(prefs));
}

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  setTimeout(() => elements.toast.classList.remove('show'), 2000);
}

function copyToClipboard(text, toastMessage = '已複製') {
  navigator.clipboard.writeText(text).then(() => toast(toastMessage));
}

function switchTab(target) {
  const isDecoder = target === 'decoder';
  elements.tabDecoder.classList.toggle('active', isDecoder);
  elements.tabBuilder.classList.toggle('active', !isDecoder);
  elements.decoderPanel.classList.toggle('active', isDecoder);
  elements.builderPanel.classList.toggle('active', !isDecoder);
  elements.builderPanel.setAttribute('aria-hidden', isDecoder);
  elements.decoderPanel.setAttribute('aria-hidden', !isDecoder);
}

function buildHumanSentence(fields, mode, tz) {
  if (!fields) return '—';
  const sec = fields.second ?? fields.sec ?? fields.seconds;
  const min = fields.minute ?? fields.min;
  const hour = fields.hour;
  const dom = fields.dayOfMonth;
  const month = fields.month;
  const dow = fields.dayOfWeek;
  let sentence = '';

  const dayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const hasStep = (v) => typeof v === 'string' && v.includes('/');
  const all = (v, val = '*') => v === undefined || v === val;

  const time = `${hour?.toString().padStart(2, '0') ?? '**'}:${min?.toString().padStart(2, '0') ?? '**'}${sec !== undefined ? ':' + sec.toString().padStart(2, '0') : ''}`;

  if (Array.isArray(dow) && dow.length && dom?.includes && dom.includes('L')) {
    sentence = `每月最後一日 ${time} 執行`;
  } else if (Array.isArray(dow) && dow.length && dow.every((d) => [1, 2, 3, 4, 5].includes(d))) {
    sentence = `每週一到週五 ${time} 執行`;
  } else if (Array.isArray(dow) && dow.length) {
    const days = dow.map((d) => dayNames[d % 7]).join('、');
    sentence = `每週的 ${days} ${time} 執行`;
  } else if (!all(dom) && dom !== undefined && dom !== '*') {
    sentence = `每月 ${dom} 日的 ${time} 執行`;
  } else if (hasStep(min)) {
    sentence = `每 ${min.split('/')[1]} 分鐘執行`;
  } else if (hasStep(hour)) {
    sentence = `每 ${hour.split('/')[1]} 小時的 ${min ?? '0'} 分執行`;
  } else {
    sentence = `每天 ${time} 執行`;
  }

  const main = sentence;
  const sub = `時區：${tz}｜模式：${mode === 'quartz' ? 'Quartz' : 'Linux'}｜起算：現在`;
  return { main, sub };
}

function renderBreakdown(fields) {
  if (!fields) {
    elements.fieldBreakdown.textContent = '—';
    return;
  }
  const lines = [
    `秒：${fields.second !== undefined ? fields.second : '(Linux 無秒欄位，預設 0)'}`,
    `分：${fields.minute}`,
    `時：${fields.hour}`,
    `日：${fields.dayOfMonth}`,
    `月：${fields.month}`,
    `週：${fields.dayOfWeek}`,
    `年：${fields.year ?? '（可省略）'}`
  ];
  elements.fieldBreakdown.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
}

function renderValidations(list) {
  elements.validationList.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.textContent = '格式正確，已計算預覽。';
    elements.validationList.appendChild(li);
    return;
  }
  list.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    elements.validationList.appendChild(li);
  });
}

function computeNextRuns(cronText, mode, tz, count) {
  if (!cronParser || !cronParser.parseExpression) {
    throw new Error('cron-parser 未成功載入，請確認網路或重新整理');
  }
  const options = {
    currentDate: DateTime.now().setZone(tz).toJSDate(),
    iterator: true,
    tz
  };
  const interval = cronParser.parseExpression(cronText, options);
  const runs = [];
  for (let i = 0; i < count; i++) {
    const { value } = interval.next();
    runs.push(DateTime.fromJSDate(value.toDate ? value.toDate() : value, { zone: tz }));
  }
  return { runs, fields: interval.fields };
}

function renderRuns(runs) {
  if (!runs || !runs.length) {
    elements.nextRuns.textContent = '暫無資料';
    return;
  }
  elements.nextRuns.innerHTML = `<ul class="bullet">${runs
    .map((dt) => `<li>${dt.toFormat('yyyy/MM/dd HH:mm:ss ZZZZ')}</li>`)
    .join('')}</ul>`;
}

function decodeCron() {
  const cronText = elements.decoderInput.value.trim();
  const tz = elements.decoderTz.value;
  const count = Number(elements.decoderCount.value) || 5;
  const mode = elements.decoderMode.value;
  state.decoder = { mode, tz, count, cron: cronText };
  savePrefs();
  if (!cronText) {
    renderValidations(['請輸入 Cron 表達式']);
    renderRuns([]);
    renderBreakdown(null);
    elements.humanMain.textContent = '請輸入 Cron';
    elements.humanSub.textContent = '時區：—｜模式：—｜起算：現在';
    return;
  }
  const messages = [];
  const fieldsCount = cronText.split(/\s+/).length;
  if (mode === 'linux' && !(fieldsCount === 5 || fieldsCount === 6)) {
    messages.push('Linux 預期 5 欄（可附秒共 6 欄）');
  }
  if (mode === 'quartz' && !(fieldsCount === 6 || fieldsCount === 7)) {
    messages.push('Quartz 預期 6-7 欄');
  }
  try {
    const { runs, fields } = computeNextRuns(cronText, mode, tz, count);
    renderRuns(runs);
    renderBreakdown(fields);
    const human = buildHumanSentence(fields, mode, tz);
    elements.humanMain.textContent = human.main;
    elements.humanSub.textContent = human.sub;
    renderValidations(messages);
  } catch (e) {
    renderValidations([`解析失敗：${e.message}`]);
    renderRuns([]);
    renderBreakdown(null);
  }
}

function renderFrequencyFields(freq) {
  const qOnly = state.builder.mode === 'quartz';
  const secField = qOnly ? '<label><span>指定秒（預設 0）</span><input type="number" id="f-sec" min="0" max="59" value="0" /></label>' : '';
  let html = '';
  switch (freq) {
    case 'minute':
      html = `
        <div class="field-grid">
          <label><span>每 N 分鐘</span><input type="number" id="f-minute-every" min="1" max="59" value="5" /></label>
          ${secField}
        </div>`;
      break;
    case 'hour':
      html = `
        <div class="field-grid">
          <label><span>每 N 小時</span><input type="number" id="f-hour-every" min="1" max="23" value="1" /></label>
          <label><span>在第幾分</span><input type="number" id="f-hour-minute" min="0" max="59" value="0" /></label>
          ${secField}
        </div>`;
      break;
    case 'day':
      html = `
        <div class="field-grid">
          <label><span>時間</span><input type="time" id="f-day-time" value="09:00" step="60"></label>
          ${qOnly ? '<label><span>秒</span><input type="number" id="f-day-sec" min="0" max="59" value="0" /></label>' : ''}
          <label><span>僅週一至週五</span><input type="checkbox" id="f-day-weekday" /></label>
        </div>`;
      break;
    case 'week':
      html = `
        <div class="field-grid">
          <label><span>選擇星期</span>
            <div class="chips" id="f-week-days">
              ${['一','二','三','四','五','六','日'].map((d,idx)=>`<button type="button" data-day="${idx+1}">週${d}</button>`).join('')}
            </div>
          </label>
          <label><span>時間</span><input type="time" id="f-week-time" value="10:00" step="60"></label>
          ${qOnly ? '<label><span>秒</span><input type="number" id="f-week-sec" min="0" max="59" value="0" /></label>' : ''}
          <label><span>週起始</span>
            <select id="f-week-start">
              <option value="mon">週一</option>
              <option value="sun">週日</option>
            </select>
          </label>
        </div>`;
      break;
    case 'month':
      html = `
        <div class="field-grid">
          <label><span>模式</span>
            <select id="f-month-mode">
              <option value="date">指定日期</option>
              <option value="nth">第 N 個星期 X</option>
              <option value="last">最後一天</option>
            </select>
          </label>
          <label><span>時間</span><input type="time" id="f-month-time" value="08:00" step="60"></label>
          ${qOnly ? '<label><span>秒</span><input type="number" id="f-month-sec" min="0" max="59" value="0" /></label>' : ''}
        </div>
        <div class="field-grid" id="f-month-extra"></div>`;
      break;
    case 'custom':
      html = `
        <div class="field-grid">
          ${qOnly ? '<label><span>秒</span><input id="c-sec" placeholder="0-59" value="0" /></label>' : ''}
          <label><span>分</span><input id="c-min" placeholder="0-59" value="*/5" /></label>
          <label><span>時</span><input id="c-hour" placeholder="0-23" value="*" /></label>
          <label><span>日</span><input id="c-dom" placeholder="1-31或L" value="*" /></label>
          <label><span>月</span><input id="c-month" placeholder="1-12或JAN" value="*" /></label>
          <label><span>週</span><input id="c-dow" placeholder="0-6或MON" value="*" /></label>
          ${qOnly ? '<label><span>年</span><input id="c-year" placeholder="可空" value="*" /></label>' : ''}
        </div>`;
      break;
    default:
      html = '';
  }
  elements.frequencyFields.innerHTML = html;

  if (freq === 'week') {
    const weekChips = document.querySelectorAll('#f-week-days button');
    weekChips.forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        updateBuilderCron();
      });
    });
  }

  if (freq === 'month') {
    const extra = document.getElementById('f-month-extra');
    const renderExtra = () => {
      const mode = document.getElementById('f-month-mode').value;
      if (mode === 'date') {
        extra.innerHTML = `<label><span>日期（可多選，以逗號）</span><input id="f-month-dates" placeholder="1,15,28" value="1" /></label>`;
      } else if (mode === 'nth') {
        extra.innerHTML = `
          <label><span>第 N 個</span><input type="number" id="f-month-nth" min="1" max="5" value="2" /></label>
          <label><span>星期</span>
            <select id="f-month-weekday">
              ${['SUN','MON','TUE','WED','THU','FRI','SAT'].map((d)=>`<option value="${d}">${d}</option>`).join('')}
            </select>
          </label>`;
      } else {
        extra.innerHTML = `<p class="hint">最後一天會自動換算對應模式；Linux 無法精準表示。</p>`;
      }
    };
    renderExtra();
    elements.frequencyFields.addEventListener('change', (e) => {
      if (e.target.id === 'f-month-mode') {
        renderExtra();
      }
    });
  }
}

function builderHumanPreview(cronText) {
  if (!cronText) return '—';
  try {
    const { fields } = computeNextRuns(cronText, state.builder.mode, state.builder.tz, 1);
    const human = buildHumanSentence(fields, state.builder.mode, state.builder.tz);
    return human.main + `（${state.builder.tz}）`;
  } catch (e) {
    return '—';
  }
}

function updateBuilderCron() {
  const freq = state.builder.frequency;
  const tz = elements.builderTz.value;
  const mode = elements.builderMode.value;
  const count = Number(elements.builderCount.value) || 5;
  state.builder.tz = tz;
  state.builder.mode = mode;
  state.builder.count = count;
  savePrefs();

  let cronText = '';
  let human = '—';
  let warning = '';
  const getSec = () => {
    const sec = document.getElementById('f-sec') || document.getElementById('f-day-sec') || document.getElementById('f-week-sec') || document.getElementById('f-month-sec');
    return sec ? sec.value || '0' : '0';
  };

  if (freq === 'minute') {
    const every = Number(document.getElementById('f-minute-every').value) || 1;
    const sec = getSec();
    cronText = mode === 'quartz' ? `${sec} 0/${every} * * * ?` : `*/${every} * * * *`;
    human = `每 ${every} 分鐘執行`;
  }
  if (freq === 'hour') {
    const every = Number(document.getElementById('f-hour-every').value) || 1;
    const minute = Number(document.getElementById('f-hour-minute').value) || 0;
    const sec = getSec();
    cronText = mode === 'quartz' ? `${sec} ${minute} 0/${every} * * ?` : `${minute} */${every} * * *`;
    human = `每 ${every} 小時的 ${String(minute).padStart(2, '0')} 分執行`;
  }
  if (freq === 'day') {
    const time = (document.getElementById('f-day-time').value || '09:00').split(':');
    const hour = time[0];
    const minute = time[1];
    const sec = document.getElementById('f-day-sec')?.value || '0';
    const weekdayOnly = document.getElementById('f-day-weekday').checked;
    if (weekdayOnly) {
      cronText = mode === 'quartz' ? `${sec} ${minute} ${hour} ? * MON-FRI` : `${minute} ${hour} * * 1-5`;
      human = `每週一到週五 ${hour}:${minute} 執行`;
    } else {
      cronText = mode === 'quartz' ? `${sec} ${minute} ${hour} * * ?` : `${minute} ${hour} * * *`;
      human = `每天 ${hour}:${minute} 執行`;
    }
  }
  if (freq === 'week') {
    const chips = document.querySelectorAll('#f-week-days button.active');
    const days = Array.from(chips).map((c) => c.getAttribute('data-day'));
    const time = (document.getElementById('f-week-time').value || '10:00').split(':');
    const hour = time[0];
    const minute = time[1];
    const sec = document.getElementById('f-week-sec')?.value || '0';
    if (!days.length) {
      elements.builderPreview.textContent = '請先選擇星期與時間';
      elements.builderCron.textContent = '＊ 尚未生成';
      elements.builderMeta.textContent = `模式：${mode === 'quartz' ? 'Quartz' : 'Linux'}｜時區：${tz}｜欄位：—`;
      elements.builderHuman.textContent = '人類語句：—';
      return;
    }
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const dow = days.map((d) => dayNames[(Number(d) % 7)]).join(',');
    cronText = mode === 'quartz' ? `${sec} ${minute} ${hour} ? * ${dow}` : `${minute} ${hour} * * ${dow}`;
    human = `每週的 ${days.map((d)=>`週${'一二三四五六日'[d-1]}`).join('、')} ${hour}:${minute} 執行`;
  }
  if (freq === 'month') {
    const modeSelect = document.getElementById('f-month-mode');
    const subMode = modeSelect.value;
    const time = (document.getElementById('f-month-time').value || '08:00').split(':');
    const hour = time[0];
    const minute = time[1];
    const sec = document.getElementById('f-month-sec')?.value || '0';
    if (subMode === 'date') {
      const dates = (document.getElementById('f-month-dates').value || '1').replace(/\s+/g, '');
      cronText = mode === 'quartz' ? `${sec} ${minute} ${hour} ${dates} * ?` : `${minute} ${hour} ${dates} * *`;
      human = `每月 ${dates} 號 ${hour}:${minute} 執行`;
    } else if (subMode === 'nth') {
      if (mode !== 'quartz') {
        state.builder.mode = 'quartz';
        elements.builderMode.value = 'quartz';
        warning = '此規則需要 Quartz Cron，已自動切換到 Quartz';
        toast(warning);
      }
      const nth = document.getElementById('f-month-nth').value || '1';
      const weekday = document.getElementById('f-month-weekday').value || 'MON';
      cronText = `${sec} ${minute} ${hour} ? * ${weekday}#${nth}`;
      human = `每月第 ${nth} 個 ${weekday} ${hour}:${minute} 執行`;
    } else {
      if (mode !== 'quartz') {
        warning = '最後一天需要 Quartz 才能精準表示，Linux 改為近似值';
        toast(warning);
        cronText = `${minute} ${hour} 28-31 * *`;
        human = `每月最後一天（近似） ${hour}:${minute}`;
      } else {
        cronText = `${sec} ${minute} ${hour} L * ?`;
        human = `每月最後一天 ${hour}:${minute} 執行`;
      }
    }
  }
  if (freq === 'custom') {
    const sec = document.getElementById('c-sec')?.value || '0';
    const min = document.getElementById('c-min').value || '*';
    const hour = document.getElementById('c-hour').value || '*';
    const dom = document.getElementById('c-dom').value || '*';
    const month = document.getElementById('c-month').value || '*';
    const dow = document.getElementById('c-dow').value || '*';
    const year = document.getElementById('c-year')?.value || '*';
    cronText = mode === 'quartz' ? `${sec} ${min} ${hour} ${dom} ${month} ${dow} ${year}` : `${min} ${hour} ${dom} ${month} ${dow}`;
    human = '自訂 Cron 已更新';
  }

  state.builder.frequency = freq;
  elements.builderCron.textContent = cronText || '＊ 尚未生成';
  elements.builderMeta.textContent = `模式：${mode === 'quartz' ? 'Quartz' : 'Linux'}｜時區：${tz}｜欄位：${cronText ? cronText.split(/\s+/).length : '—'}`;
  elements.builderHuman.textContent = `人類語句：${builderHumanPreview(cronText)}`;

  if (cronText) {
    try {
      const { runs } = computeNextRuns(cronText, mode, tz, count);
      elements.builderPreview.innerHTML = runs.map((dt) => dt.toFormat('yyyy/MM/dd HH:mm:ss ZZZZ')).join('<br/>');
    } catch (e) {
      elements.builderPreview.textContent = `解析失敗：${e.message}`;
    }
  }
  if (warning) {
    elements.validationList.innerHTML = `<li>${warning}</li>`;
  }
  savePrefs();
}

function handleFrequencyClick(e) {
  if (e.target.dataset.frequency) {
    document.querySelectorAll('#frequency-segment button').forEach((btn) => btn.classList.remove('active'));
    e.target.classList.add('active');
    state.builder.frequency = e.target.dataset.frequency;
    renderFrequencyFields(state.builder.frequency);
    updateBuilderCron();
  }
}

function handleInputModeSwitch(e) {
  const mode = e.target.dataset.inputMode;
  if (!mode) return;
  document.querySelectorAll('.pill-row .pill').forEach((p) => p.classList.remove('active'));
  e.target.classList.add('active');
  if (mode === 'guided') {
    elements.guidedForm.classList.remove('hidden');
    elements.naturalForm.classList.add('hidden');
  } else {
    elements.guidedForm.classList.add('hidden');
    elements.naturalForm.classList.remove('hidden');
  }
}

function parseNaturalInput() {
  const text = elements.naturalInput.value.trim();
  if (!text) return;
  const minuteMatch = text.match(/每\s*(\d+)\s*分鐘/);
  const dailyMatch = text.match(/每天\s*(\d{1,2}):(\d{2})/);
  const weekdayRange = text.match(/週一到週五\s*(\d{1,2}):(\d{2})/);
  const weeklyMatch = text.match(/每週([一二三四五六日、，]+)\s*(\d{1,2}:\d{2})/);
  const monthlyMatch = text.match(/每月\s*(\d+)\s*(?:號|日)?\s*(\d{1,2}:\d{2})/);

  if (minuteMatch) {
    state.builder.frequency = 'minute';
    renderFrequencyFields('minute');
    document.getElementById('f-minute-every').value = minuteMatch[1];
  } else if (weekdayRange) {
    state.builder.frequency = 'day';
    renderFrequencyFields('day');
    document.getElementById('f-day-weekday').checked = true;
    document.getElementById('f-day-time').value = `${weekdayRange[1].padStart(2, '0')}:${weekdayRange[2]}`;
  } else if (dailyMatch) {
    state.builder.frequency = 'day';
    renderFrequencyFields('day');
    document.getElementById('f-day-time').value = `${dailyMatch[1].padStart(2, '0')}:${dailyMatch[2]}`;
  } else if (weeklyMatch) {
    state.builder.frequency = 'week';
    renderFrequencyFields('week');
    const daysText = weeklyMatch[1].replace(/，/g, '、');
    const chips = document.querySelectorAll('#f-week-days button');
    daysText.split('、').forEach((d) => {
      const map = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '日': '7' };
      const btn = Array.from(chips).find((c) => c.dataset.day === map[d]);
      if (btn) btn.classList.add('active');
    });
    document.getElementById('f-week-time').value = weeklyMatch[2];
  } else if (monthlyMatch) {
    state.builder.frequency = 'month';
    renderFrequencyFields('month');
    document.getElementById('f-month-dates').value = monthlyMatch[1];
    document.getElementById('f-month-time').value = monthlyMatch[2];
  } else {
    toast('目前只支援：每 N 分鐘 / 每天 HH:mm / 每週(星期) HH:mm / 每月(日期) HH:mm');
    return;
  }
  document.querySelectorAll('#frequency-segment button').forEach((btn) => btn.classList.remove('active'));
  document.querySelector(`#frequency-segment button[data-frequency="${state.builder.frequency}"]`).classList.add('active');
  updateBuilderCron();
  toast('已解析並套用到引導表單');
}

function resetNatural() {
  elements.naturalInput.value = '';
}

function applyToDecoder() {
  const cronText = elements.builderCron.textContent;
  if (!cronText || cronText.includes('尚未')) return;
  elements.decoderInput.value = cronText;
  elements.decoderMode.value = state.builder.mode;
  elements.decoderTz.value = state.builder.tz;
  elements.decoderCount.value = state.builder.count;
  decodeCron();
  switchTab('decoder');
  toast('已套用到解讀器');
}

function loadSampleDecoder() {
  elements.decoderInput.value = '0 9 * * 1-5';
  elements.decoderMode.value = 'linux';
  elements.decoderTz.value = 'Asia/Taipei';
  elements.decoderCount.value = 5;
  decodeCron();
}

function attachEvents() {
  elements.tabDecoder.addEventListener('click', () => switchTab('decoder'));
  elements.tabBuilder.addEventListener('click', () => switchTab('builder'));
  elements.decodeBtn.addEventListener('click', decodeCron);
  elements.decoderInput.addEventListener('input', () => {
    clearTimeout(elements._decodeTimer);
    elements._decodeTimer = setTimeout(decodeCron, 300);
  });
  elements.decoderMode.addEventListener('change', decodeCron);
  elements.decoderTz.addEventListener('change', decodeCron);
  elements.decoderCount.addEventListener('input', decodeCron);
  elements.loadSample.addEventListener('click', loadSampleDecoder);
  elements.copyHuman.addEventListener('click', () => copyToClipboard(elements.humanMain.textContent, '已複製人類語句'));
  elements.copyHumanDetail.addEventListener('click', () => {
    const detail = `${elements.humanMain.textContent}\n${elements.humanSub.textContent}\n原始：${elements.decoderInput.value}`;
    copyToClipboard(detail, '已複製人類語句');
  });
  elements.frequencySegment.addEventListener('click', handleFrequencyClick);
  elements.pills.forEach((p) => p.addEventListener('click', handleInputModeSwitch));
  elements.naturalForm.addEventListener('submit', (e) => e.preventDefault());
  elements.parseNatural.addEventListener('click', parseNaturalInput);
  elements.resetNatural.addEventListener('click', resetNatural);
  elements.frequencyFields.addEventListener('input', updateBuilderCron);
  elements.frequencyFields.addEventListener('change', updateBuilderCron);
  elements.builderMode.addEventListener('change', () => {
    renderFrequencyFields(state.builder.frequency);
    updateBuilderCron();
  });
  elements.builderTz.addEventListener('change', updateBuilderCron);
  elements.builderCount.addEventListener('input', updateBuilderCron);
  elements.copyBuilderCron.addEventListener('click', () => copyToClipboard(elements.builderCron.textContent));
  elements.copyBuilderHuman.addEventListener('click', () => copyToClipboard(elements.builderHuman.textContent.replace('人類語句：', ''), '已複製人類語句'));
  elements.applyToDecoder.addEventListener('click', applyToDecoder);

  elements.themeToggle.addEventListener('change', () => {
    document.documentElement.classList.toggle('dark', elements.themeToggle.checked);
    savePrefs();
  });
  elements.resetSettings.addEventListener('click', () => {
    localStorage.removeItem('cron-studio-prefs');
    location.reload();
  });
}

function init() {
  initTimezoneSelect(elements.decoderTz);
  initTimezoneSelect(elements.builderTz);
  loadPrefs();
  elements.decoderTz.value = state.decoder.tz;
  elements.decoderMode.value = state.decoder.mode;
  elements.decoderCount.value = state.decoder.count;
  elements.builderTz.value = state.builder.tz;
  elements.builderMode.value = state.builder.mode;
  elements.builderCount.value = state.builder.count;
  renderFrequencyFields(state.builder.frequency);
  attachEvents();
  updateBuilderCron();
  decodeCron();
}

init();
