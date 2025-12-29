(() => {
  const editor = document.getElementById('editor');
  const editorA = document.getElementById('editor-a');
  const editorB = document.getElementById('editor-b');
  const diffInputs = document.getElementById('diff-inputs');
  const outputRaw = document.getElementById('output-raw');
  const outputTree = document.getElementById('output-tree');
  const diffView = document.getElementById('diff-view');
  const statusMessage = document.getElementById('status-message');
  const outputStatus = document.getElementById('output-status');
  const errorLine = document.getElementById('error-line');
  const inputMetrics = document.getElementById('input-metrics');
  const toast = document.getElementById('toast');
  const themeToggle = document.getElementById('theme-toggle');
  const maskToggle = document.getElementById('mask-toggle');
  const settingsModal = document.getElementById('settings-modal');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsClose = document.getElementById('settings-close');
  const indentSize = document.getElementById('indent-size');
  const autoFormat = document.getElementById('auto-format');
  const json5Mode = document.getElementById('json5-mode');
  const maskKeysInput = document.getElementById('mask-keys');
  const maxDepthInput = document.getElementById('max-depth');
  const saveSettingsBtn = document.getElementById('save-settings');
  const searchBox = document.getElementById('search-box');
  const searchKeys = document.getElementById('search-keys');
  const searchValues = document.getElementById('search-values');
  const caseSensitive = document.getElementById('case-sensitive');
  const copyBtn = document.getElementById('copy-btn');
  const downloadBtn = document.getElementById('download-btn');
  const viewButtons = document.querySelectorAll('.view-toggle button');
  const convertToggle = document.getElementById('convert-toggle');
  const convertMenu = document.getElementById('convert-menu');
  const examplesToggle = document.getElementById('examples-toggle');
  const examplesMenu = document.getElementById('examples-menu');
  const largeFileTip = document.getElementById('large-file-tip');

  const state = {
    view: 'raw',
    masked: false,
    diffMode: false,
    lastOutput: '',
    lastTreeData: null,
    largeFile: false,
    settings: {
      indent: '2',
      autoFormat: false,
      json5: false,
      maskKeys: [],
      maxDepth: 4,
    },
  };

  const typeLabel = (value) => {
    if (Array.isArray(value)) return '陣列';
    if (value === null) return 'null';
    const map = {
      string: '字串',
      number: '數字',
      boolean: '布林',
      object: '物件',
      undefined: '未定義',
      function: '函式',
    };
    return map[typeof value] || '未知';
  };

  const examples = [
    {
      label: 'API 回應範例',
      value: '{"status":"ok","data":{"user":{"id":1,"name":"Ken","token":"abcd"}}}',
    },
    {
      label: 'log 中帶註解 JSON',
      value: '{\n  // 使用者列表\n  "users": [\n    {"id":1,"name":"Ken"}, // 第一筆\n    {"id":2,"name":"Ada"}\n  ],\n}',
    },
    {
      label: '外層字串包 JSON',
      value: '"{\\"a\\":1,\\"b\\":true}"',
    },
    {
      label: 'Array of objects（CSV）',
      value: '[{"city":"Taipei","temp":26},{"city":"Tokyo","temp":18,"note":"rain"}]',
    },
    {
      label: '巢狀資料（Tree/Path）',
      value: '{"a":{"b":[{"c":1},{"c":2}]},"password":"secret"}',
    },
  ];

  const persist = () => {
    localStorage.setItem('json-studio-input', editor.value);
    localStorage.setItem('json-studio-settings', JSON.stringify(state.settings));
    localStorage.setItem('json-studio-view', state.view);
    localStorage.setItem('json-studio-masked', state.masked ? '1' : '0');
  };

  const loadPersisted = () => {
    const savedInput = localStorage.getItem('json-studio-input');
    const savedSettings = localStorage.getItem('json-studio-settings');
    const savedView = localStorage.getItem('json-studio-view');
    const savedMasked = localStorage.getItem('json-studio-masked');

    if (savedInput) editor.value = savedInput;
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        state.settings = { ...state.settings, ...parsed };
      } catch (_) {}
    }
    if (savedView) state.view = savedView;
    if (savedMasked) state.masked = savedMasked === '1';

    indentSize.value = state.settings.indent;
    autoFormat.checked = state.settings.autoFormat;
    json5Mode.checked = state.settings.json5;
    maskKeysInput.value = state.settings.maskKeys.join(',');
    maxDepthInput.value = state.settings.maxDepth;
    maskToggle.textContent = `遮罩敏感欄位：${state.masked ? '開' : '關'}`;

    viewButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === state.view));
  };

  const showToast = (text) => {
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  };

  const updateMetrics = () => {
    const text = editor.value;
    const length = text.length;
    const lines = text.split(/\n/).length;
    const kb = (new Blob([text]).size / 1024).toFixed(2);
    inputMetrics.textContent = `${length} 字元 · ${lines} 行 · ${kb} KB`;
  };

  const stripComments = (str) => {
    let result = '';
    let inString = false;
    let stringChar = '';
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const next = str[i + 1];
      if (!inString && char === '/' && next === '/') {
        while (i < str.length && str[i] !== '\n') i++;
        result += '\n';
        continue;
      }
      if (!inString && char === '/' && next === '*') {
        i += 2;
        while (i < str.length && !(str[i] === '*' && str[i + 1] === '/')) i++;
        i++;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        if (inString && stringChar === char) {
          inString = false;
        } else if (!inString) {
          inString = true;
          stringChar = char;
        }
      }
      result += char;
    }
    return result;
  };

  const removeTrailingCommas = (str) => str.replace(/,\s*([}\]])/g, '$1');

  const preprocess = (text, allowLoose) => {
    let processed = text;
    if (allowLoose) {
      processed = stripComments(processed);
      processed = removeTrailingCommas(processed);
    }
    return processed;
  };

  const computePosition = (text, position) => {
    let line = 1, col = 1;
    for (let i = 0; i < position; i++) {
      if (text[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    return { line, col };
  };

  const parseWithDetails = (text) => {
    const allowLoose = state.settings.json5;
    try {
      const processed = preprocess(text, allowLoose);
      const data = JSON.parse(processed);
      return { data };
    } catch (error) {
      let position = null;
      const match = /position\s+(\d+)/i.exec(error.message) || /at\s+(\d+)/i.exec(error.message);
      if (match) position = Number(match[1]);
      const coords = position != null ? computePosition(text, position) : null;
      return {
        error,
        position: coords,
        message: error.message,
      };
    }
  };

  const applyMask = (data) => {
    if (!state.masked || !state.settings.maskKeys.length) return data;
    const keys = state.settings.maskKeys.map((k) => k.trim()).filter(Boolean);
    const maskValue = '***已遮罩***';
    const walk = (node) => {
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === 'object') {
        const clone = {};
        Object.keys(node).forEach((key) => {
          if (keys.includes(key)) {
            clone[key] = maskValue;
          } else {
            clone[key] = walk(node[key]);
          }
        });
        return clone;
      }
      return node;
    };
    return walk(data);
  };

  const sortKeys = (input) => {
    if (Array.isArray(input)) return input.map(sortKeys);
    if (input && typeof input === 'object') {
      const sorted = {};
      Object.keys(input).sort().forEach((k) => {
        sorted[k] = sortKeys(input[k]);
      });
      return sorted;
    }
    return input;
  };

  const stringify = (value, minify = false) => {
    const indent = state.settings.indent === 'tab' ? '\t' : Number(state.settings.indent || 2);
    return JSON.stringify(value, null, minify ? 0 : indent);
  };

  const setStatus = (text, type = 'neutral') => {
    statusMessage.textContent = text;
    statusMessage.className = `status ${type}`;
  };

  const setOutputStatus = (text, type = 'neutral') => {
    outputStatus.textContent = text;
    outputStatus.className = `status ${type}`;
  };

  const escapeHtml = (str) => str.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const renderRaw = (text) => {
    const term = searchBox.value;
    if (term && state.view === 'raw') {
      const flags = caseSensitive.checked ? 'g' : 'gi';
      const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safeTerm, flags);
      const highlighted = escapeHtml(text).replace(regex, (m) => `<mark>${m}</mark>`);
      outputRaw.innerHTML = highlighted;
    } else {
      outputRaw.textContent = text;
    }
  };

  const createTreeNode = (key, value, path, depth, maxDepth) => {
    const li = document.createElement('li');
    const node = document.createElement('div');
    node.className = 'node';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = typeLabel(value);
    const label = document.createElement('span');
    label.textContent = key != null ? key : '根';
    label.dataset.path = path;
    node.appendChild(badge);
    node.appendChild(label);

    const preview = document.createElement('span');
    preview.className = 'value';
    if (value && typeof value === 'object') {
      const size = Array.isArray(value) ? value.length : Object.keys(value).length;
      preview.textContent = `(${size} 項)`;
    } else {
      preview.textContent = String(value);
    }
    node.appendChild(preview);

    li.appendChild(node);

    let childContainer = null;
    if (value && typeof value === 'object') {
      const toggle = document.createElement('button');
      toggle.className = 'toggle-btn';
      toggle.textContent = depth >= maxDepth ? '⏤' : '−';
      node.prepend(toggle);
      childContainer = document.createElement('ul');
      if (depth >= maxDepth) {
        childContainer.hidden = true;
      }
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        childContainer.hidden = !childContainer.hidden;
        toggle.textContent = childContainer.hidden ? '+' : '−';
      });

      const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
      for (const [k, v] of entries) {
        const childPath = Array.isArray(value) ? `${path}[${k}]` : `${path}.${k}`;
        childContainer.appendChild(createTreeNode(k, v, childPath, depth + 1, maxDepth));
      }
      li.appendChild(childContainer);
    }

    node.addEventListener('click', () => {
      navigator.clipboard.writeText(path).catch(() => {});
      showToast(`已複製路徑：${path}`);
      document.querySelectorAll('.tree .node').forEach((n) => n.classList.remove('highlight'));
      node.classList.add('highlight');
    });

    return li;
  };

  const renderTree = (data) => {
    outputTree.innerHTML = '';
    const maxDepth = state.largeFile ? state.settings.maxDepth : 99;
    const ul = document.createElement('ul');
    ul.appendChild(createTreeNode(null, data, 'root', 0, maxDepth));
    outputTree.appendChild(ul);
  };

  const applySearchHighlight = () => {
    const term = searchBox.value;
    const keysOnly = searchKeys.checked;
    const valuesOnly = searchValues.checked;
    document.querySelectorAll('.tree .node').forEach((n) => n.classList.remove('highlight'));
    if (!term || !state.lastTreeData) return;
    const flags = caseSensitive.checked ? 'g' : 'gi';
    const matcher = new RegExp(term, flags);

    const walk = (node, path) => {
      if (node && typeof node === 'object') {
        if (Array.isArray(node)) {
          node.forEach((item, idx) => walk(item, `${path}[${idx}]`));
        } else {
          Object.entries(node).forEach(([k, v]) => {
            const targetPath = `${path}.${k}`;
            const matchesKey = !valuesOnly && matcher.test(k);
            const matchesValue = !keysOnly && (typeof v === 'object' ? false : matcher.test(String(v)));
            if (matchesKey || matchesValue) {
              const el = outputTree.querySelector(`[data-path="${targetPath}"]`);
              if (el) el.parentElement.classList.add('highlight');
            }
            matcher.lastIndex = 0;
            walk(v, targetPath);
          });
        }
      }
    };
    walk(state.lastTreeData, 'root');
  };

  const handleOutput = (data, message = '已完成') => {
    state.lastTreeData = data;
    const masked = applyMask(data);
    const pretty = stringify(masked, false);
    state.lastOutput = pretty;
    renderRaw(pretty);
    renderTree(masked);
    setOutputStatus(message, 'success');
    if (state.view === 'tree') {
      outputTree.hidden = false;
      outputRaw.hidden = true;
    } else {
      outputTree.hidden = true;
      outputRaw.hidden = false;
    }
    applySearchHighlight();
    persist();
  };

  const handleParse = (text) => {
    const result = parseWithDetails(text);
    if (result.data !== undefined) {
      setStatus('✅ JSON 合法', 'success');
      errorLine.textContent = '';
      return result.data;
    }
    setStatus('❌ JSON 不合法', 'error');
    const location = result.position ? `第 ${result.position.line} 行，第 ${result.position.col} 列：` : '無法定位行列：';
    errorLine.textContent = `${location}${result.message}`;
    throw result.error || new Error('解析失敗');
  };

  const formatAction = (minify = false) => {
    try {
      const data = handleParse(editor.value);
      const sorted = data;
      const output = stringify(applyMask(sorted), minify);
      state.lastOutput = output;
      renderRaw(output);
      renderTree(applyMask(sorted));
      setOutputStatus(minify ? '已壓縮' : '已格式化', 'success');
      showToast(minify ? '已壓縮' : '已格式化');
      errorLine.textContent = '';
      persist();
    } catch (e) {
      console.error(e);
    }
  };

  const validateAction = () => {
    try {
      handleParse(editor.value);
      showToast('JSON 合法');
    } catch (e) {
      showToast('JSON 不合法');
    }
  };

  const sortKeysAction = () => {
    try {
      const data = handleParse(editor.value);
      const sorted = sortKeys(data);
      handleOutput(sorted, '已排序鍵名');
      showToast('已排序鍵名');
    } catch (e) {}
  };

  const stripCommentsAction = () => {
    const stripped = stripComments(editor.value);
    editor.value = stripped;
    updateMetrics();
    showToast('已移除註解');
    if (state.settings.autoFormat) formatAction();
  };

  const decodeStringAction = () => {
    try {
      const text = editor.value.trim();
      if (!(text.startsWith('"') || text.startsWith("'"))) throw new Error('目前輸入不是「字串包 JSON」格式');
      const decoded = JSON.parse(text);
      const inner = JSON.parse(decoded);
      handleOutput(inner, '已解碼字串 JSON');
      showToast('已解碼字串 JSON');
    } catch (e) {
      setOutputStatus(e.message, 'error');
      errorLine.textContent = e.message;
      showToast('解碼失敗');
    }
  };

  const toYaml = (data) => {
    if (window.jsyaml) return window.jsyaml.dump(data);
    throw new Error('缺少 js-yaml');
  };

  const toCsv = (data) => {
    if (!Array.isArray(data) || !data.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      throw new Error('CSV 轉換需要「物件陣列」格式，例如: [{"a":1},{"a":2}]');
    }
    const headers = Array.from(new Set(data.flatMap((row) => Object.keys(row))));
    const escapeCsv = (v) => {
      if (v == null) return '';
      const str = String(v);
      return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
    };
    const lines = [headers.join(',')];
    data.forEach((row) => {
      lines.push(headers.map((h) => escapeCsv(row[h])).join(','));
    });
    return lines.join('\n');
  };

  const toQueryString = (obj, prefix) => {
    const pairs = [];
    const encode = encodeURIComponent;
    const build = (value, keyPath) => {
      if (Array.isArray(value)) {
        value.forEach((v) => build(v, `${keyPath}[]`));
      } else if (value && typeof value === 'object') {
        Object.entries(value).forEach(([k, v]) => build(v, `${keyPath}[${k}]`));
      } else {
        pairs.push(`${keyPath}=${encode(value == null ? '' : value)}`);
      }
    };
    Object.entries(obj || {}).forEach(([k, v]) => build(v, prefix ? `${prefix}[${k}]` : k));
    return pairs.join('&');
  };

  const inferType = (value) => {
    if (value === null) return 'null';
    if (Array.isArray(value)) {
      if (!value.length) return 'any[]';
      const types = Array.from(new Set(value.map(inferType)));
      const union = types.join(' | ');
      return types.length === 1 ? `${types[0]}[]` : `(${union})[]`;
    }
    const t = typeof value;
    if (t === 'string') return 'string';
    if (t === 'number') return 'number';
    if (t === 'boolean') return 'boolean';
    if (t === 'object') return '{ ' + Object.entries(value).map(([k, v]) => {
      const optional = v === undefined ? '?' : '';
      return `${k}${optional}: ${inferType(v)}`;
    }).join('; ') + ' }';
    return 'any';
  };

  const toTypeScript = (data) => {
    if (Array.isArray(data)) {
      const unionKeys = Array.from(new Set(data.flatMap((item) => item && typeof item === 'object' ? Object.keys(item) : [])));
      const shape = unionKeys.map((key) => {
        const values = data.map((item) => item && typeof item === 'object' ? item[key] : undefined);
        const types = Array.from(new Set(values.filter((v) => v !== undefined).map(inferType)));
        const typeStr = types.length ? types.join(' | ') : 'any';
        const optional = values.some((v) => v === undefined) ? '?' : '';
        return `  ${key}${optional}: ${typeStr};`;
      }).join('\n');
      return `type Root = {\n${shape}\n};`;
    }
    if (data && typeof data === 'object') {
      const entries = Object.entries(data).map(([k, v]) => `  ${k}: ${inferType(v)};`).join('\n');
      return `type Root = {\n${entries}\n};`;
    }
    return 'type Root = ' + inferType(data) + ';';
  };

  const runConversion = (action) => {
    try {
      const data = handleParse(editor.value);
      let result = '';
      switch (action) {
        case 'toYaml':
          result = toYaml(data);
          break;
        case 'toCsv':
          result = toCsv(data);
          break;
        case 'toQuery':
          result = toQueryString(data);
          break;
        case 'toTs':
          result = toTypeScript(data);
          break;
        default:
          break;
      }
      state.lastOutput = result;
      outputRaw.textContent = result;
      outputRaw.hidden = false;
      outputTree.hidden = true;
      viewButtons.forEach((btn) => btn.classList.remove('active'));
      viewButtons[0].classList.add('active');
      state.view = 'raw';
      setOutputStatus('轉換完成', 'success');
      showToast('轉換完成');
    } catch (e) {
      setOutputStatus(e.message || '轉換失敗', 'error');
      showToast('轉換失敗');
    }
  };

  const toggleView = (view) => {
    state.view = view;
    viewButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
    if (state.diffMode) {
      outputRaw.hidden = true;
      outputTree.hidden = true;
      diffView.hidden = false;
      return;
    }
    if (view === 'tree') {
      outputTree.hidden = false;
      outputRaw.hidden = true;
    } else {
      outputTree.hidden = true;
      outputRaw.hidden = false;
      renderRaw(state.lastOutput || '');
    }
    persist();
  };

  const handleSearch = () => {
    if (state.view === 'tree') applySearchHighlight();
    if (state.view === 'raw') renderRaw(state.lastOutput || '');
  };

  const updateLargeFileState = () => {
    state.largeFile = new Blob([editor.value]).size > 1024 * 1024;
    largeFileTip.hidden = !state.largeFile;
  };

  const copyOutput = async () => {
    try {
      const target = state.diffMode ? diffView.innerText : (state.view === 'tree' ? outputTree.innerText : outputRaw.innerText);
      await navigator.clipboard.writeText(target);
      showToast('已複製到剪貼簿');
    } catch (e) {
      showToast('複製失敗');
    }
  };

  const downloadOutput = () => {
    const blob = new Blob([state.diffMode ? diffView.innerText : state.lastOutput || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'output.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('已下載檔案');
  };

  const toggleMask = () => {
    state.masked = !state.masked;
    maskToggle.textContent = `遮罩敏感欄位：${state.masked ? '開' : '關'}`;
    if (state.lastTreeData) handleOutput(state.lastTreeData, '已套用遮罩設定');
    persist();
  };

  const openSettings = () => settingsModal.classList.add('show');
  const closeSettings = () => settingsModal.classList.remove('show');

  const saveSettings = () => {
    state.settings.indent = indentSize.value;
    state.settings.autoFormat = autoFormat.checked;
    state.settings.json5 = json5Mode.checked;
    state.settings.maskKeys = maskKeysInput.value.split(',').map((k) => k.trim()).filter(Boolean);
    state.settings.maxDepth = Math.max(1, Number(maxDepthInput.value) || 4);
    showToast('設定已儲存');
    persist();
    closeSettings();
  };

  const clearAll = () => {
    editor.value = '';
    editorA.value = '';
    editorB.value = '';
    outputRaw.textContent = '';
    outputTree.innerHTML = '';
    diffView.innerHTML = '';
    state.lastOutput = '';
    state.lastTreeData = null;
    state.diffMode = false;
    diffInputs.hidden = true;
    editor.hidden = false;
    diffView.hidden = true;
    viewButtons.forEach((btn) => btn.classList.remove('active'));
    viewButtons[0].classList.add('active');
    state.view = 'raw';
    setStatus('等待輸入...', 'neutral');
    setOutputStatus('尚未產生輸出', 'neutral');
    errorLine.textContent = '';
    updateMetrics();
    persist();
  };

  const toggleDiffMode = () => {
    state.diffMode = !state.diffMode;
    diffInputs.hidden = !state.diffMode;
    editor.hidden = state.diffMode;
    diffView.hidden = !state.diffMode;
    outputRaw.hidden = true;
    outputTree.hidden = true;
    viewButtons.forEach((btn) => btn.classList.remove('active'));
    if (state.diffMode) {
      setOutputStatus('差異模式：請輸入 A / B', 'neutral');
      showToast('已開啟差異模式');
    } else {
      setOutputStatus('回到單一輸入模式', 'neutral');
      diffView.innerHTML = '';
      state.view = 'raw';
      viewButtons[0].classList.add('active');
    }
    persist();
  };

  const runDiff = () => {
    try {
      const a = preprocess(editorA.value, state.settings.json5);
      const b = preprocess(editorB.value, state.settings.json5);
      const diff = window.Diff.diffJson(JSON.parse(a), JSON.parse(b));
      const frag = diff.map((part) => {
        const tag = part.added ? 'ins' : part.removed ? 'del' : 'span';
        return `<${tag}>${escapeHtml(JSON.stringify(part.value, null, state.settings.indent === 'tab' ? '\t' : Number(state.settings.indent)))}</${tag}>`;
      }).join('\n');
      diffView.innerHTML = frag;
      setOutputStatus('差異已生成', 'success');
      showToast('差異已生成');
    } catch (e) {
      setOutputStatus('比對失敗：請確認 A/B 為合法 JSON', 'error');
      showToast('比對失敗');
    }
  };

  const attachToolbar = () => {
    document.querySelectorAll('.toolbar-left [data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        switch (action) {
          case 'format':
            formatAction();
            break;
          case 'minify':
            formatAction(true);
            break;
          case 'validate':
            validateAction();
            break;
          case 'sortKeys':
            sortKeysAction();
            break;
          case 'stripComments':
            stripCommentsAction();
            break;
          case 'decodeString':
            decodeStringAction();
            break;
          case 'toYaml':
          case 'toCsv':
          case 'toQuery':
          case 'toTs':
            runConversion(action);
            break;
          case 'diff':
            toggleDiffMode();
            break;
          case 'clear':
            clearAll();
            break;
          default:
            break;
        }
      });
    });

    viewButtons.forEach((btn) => btn.addEventListener('click', () => toggleView(btn.dataset.view)));
    copyBtn.addEventListener('click', copyOutput);
    downloadBtn.addEventListener('click', downloadOutput);
    maskToggle.addEventListener('click', toggleMask);
    settingsBtn.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);
    saveSettingsBtn.addEventListener('click', saveSettings);
    searchBox.addEventListener('input', handleSearch);
    searchKeys.addEventListener('change', handleSearch);
    searchValues.addEventListener('change', handleSearch);
    caseSensitive.addEventListener('change', handleSearch);
    editor.addEventListener('input', () => {
      updateMetrics();
      updateLargeFileState();
      persist();
      if (state.settings.autoFormat) formatAction();
    });

    [editorA, editorB].forEach((el) => el.addEventListener('input', () => state.diffMode && runDiff()));

    convertToggle.addEventListener('click', () => convertMenu.parentElement.classList.toggle('open'));
    examplesToggle.addEventListener('click', () => examplesMenu.parentElement.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!convertMenu.parentElement.contains(e.target)) convertMenu.parentElement.classList.remove('open');
      if (!examplesMenu.parentElement.contains(e.target)) examplesMenu.parentElement.classList.remove('open');
    });

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { formatAction(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') { formatAction(true); e.preventDefault(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { searchBox.focus(); e.preventDefault(); }
    });

    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      themeToggle.textContent = document.body.classList.contains('dark') ? '淺色模式' : '深色模式';
      localStorage.setItem('json-studio-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
    });
  };

  const applyTheme = () => {
    const saved = localStorage.getItem('json-studio-theme');
    if (saved === 'dark') document.body.classList.add('dark');
    themeToggle.textContent = document.body.classList.contains('dark') ? '淺色模式' : '深色模式';
  };

  const initExamples = () => {
    examplesMenu.innerHTML = '';
    examples.forEach((item) => {
      const btn = document.createElement('button');
      btn.textContent = item.label;
      btn.addEventListener('click', () => {
        editor.value = item.value;
        updateMetrics();
        if (state.settings.autoFormat) formatAction();
        showToast('已載入範例');
      });
      examplesMenu.appendChild(btn);
    });
  };

  const init = () => {
    applyTheme();
    loadPersisted();
    updateMetrics();
    updateLargeFileState();
    attachToolbar();
    initExamples();
    if (state.settings.autoFormat && editor.value) formatAction();
  };

  init();
})();
