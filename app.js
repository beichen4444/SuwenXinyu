/* 素问新雨 - 临床思维知识库 主逻辑 */
/* ===== 登录系统 ===== */
const CORRECT_PASSWORD = '1133';

function doLogin() {
  const input = document.getElementById('login-password');
  const error = document.getElementById('login-error');
  if (input.value === CORRECT_PASSWORD) {
    sessionStorage.setItem('suwen_auth', '1');
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-sidebar').style.display = 'flex';
    document.getElementById('app-main').style.display = 'block';
    initApp();
  } else {
    error.style.display = 'block';
    input.value = '';
    input.focus();
  }
}

function doLogout() {
  sessionStorage.removeItem('suwen_auth');
  location.reload();
}

// 页面加载时检查登录状态
(function() {
  if (sessionStorage.getItem('suwen_auth') === '1') {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-sidebar').style.display = 'flex';
    document.getElementById('app-main').style.display = 'block';
    window.addEventListener('DOMContentLoaded', initApp);
  }
})();

/* ===== 版本管理：版本号变更时自动清理旧缓存 ===== */
const APP_VERSION = '2.0.0';
(function() {
  const storedVer = localStorage.getItem('clinicalkb_app_version');
  if (storedVer !== APP_VERSION) {
    // 版本不匹配：清理可能冲突的旧配置
    const keysToKeep = ['clinicalkb_user_docs', 'clinicalkb_chat_count'];
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('clinicalkb_') && !keysToKeep.includes(k)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    localStorage.setItem('clinicalkb_app_version', APP_VERSION);
    console.log('[版本升级] 已清理 ' + keysToRemove.length + ' 项旧缓存，版本: ' + APP_VERSION);
  }
})();

/* ===== 应用状态 ===== */
let currentPage = 'dashboard';
let currentDocView = null;
let chatHistory = [];
let userDocs = JSON.parse(localStorage.getItem('clinicalkb_user_docs') || '[]');
let apiConfig = JSON.parse(localStorage.getItem('clinicalkb_api_config') || 
  '{"provider":"deepseek","key":"sk-4ae6369348aa4ae68e43f6b6157bc416","endpoint":"https://api.deepseek.com/v1/chat/completions","model":"deepseek-v4-pro"}');
let chatCount = parseInt(localStorage.getItem('clinicalkb_chat_count') || '0');
let attachedFiles = [];

/* ===== 初始化 ===== */
function initApp() {
  initNavigation();
  renderDocList();
  renderManageList();
  updateStats();
  loadApiConfig();
  updateApiStatus();
  initDropZone();
}

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', function() { switchPage(this.dataset.page); });
  });
}

function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector('[data-page="' + page + '"]').classList.add('active');
  document.getElementById('page-title').textContent = {
    dashboard:'工作台',knowledge:'知识库',chat:'新雨 AI',files:'文件处理',manage:'文档管理'
  }[page] || page;
  if (page === 'knowledge' && currentDocView) showDocViewer(currentDocView);
}

/* ===== 文档管理 ===== */
function renderDocList(searchTerm) {
  const allDocs = [...PRESET_DOCS, ...userDocs];
  const container = document.getElementById('doc-list');
  if (container.style.display === 'none') return;
  
  const search = (searchTerm || document.getElementById('kb-search').value).toLowerCase();
  const filteredDocs = allDocs.filter(doc =>
    doc.title.toLowerCase().includes(search) ||
    doc.category.toLowerCase().includes(search) ||
    doc.content.toLowerCase().includes(search)
  );
  
  const categories = [...new Set(filteredDocs.map(d => d.category))];
  const tabsContainer = document.getElementById('category-tabs');
  tabsContainer.innerHTML = '<button class="cat-tab active" onclick="filterByCategory(\'\')">全部</button>';
  categories.forEach(cat => {
    tabsContainer.innerHTML += '<button class="cat-tab" onclick="filterByCategory(\'' + cat.replace(/'/g,"\\'") + '\')">' + cat + '</button>';
  });
  
  if (filteredDocs.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128270;</div><h3>未找到相关文档</h3><p>尝试其他搜索词</p></div>';
    return;
  }
  
  container.innerHTML = filteredDocs.map(doc => {
    const isPreset = doc.id.startsWith('preset-');
    return '<div class="doc-item" onclick="showDocViewer(\'' + doc.id + '\')">' +
      '<div class="doc-icon">' + (isPreset ? '&#128196;' : '&#128221;') + '</div>' +
      '<div class="doc-info"><div class="doc-title">' + doc.title + (isPreset ? ' <span style="font-size:0.7rem;color:#888">(预置)</span>' : '') + '</div>' +
      '<div class="doc-meta">' + doc.category + ' · ' + doc.createdAt + '</div></div>' +
      '<div class="doc-actions" onclick="event.stopPropagation()">' +
      (!isPreset ? '<button onclick="editDoc(\'' + doc.id + '\')">编辑</button>' : '') +
      '<button onclick="viewDoc(\'' + doc.id + '\')">查看</button></div></div>';
  }).join('');
}

function filterByCategory(category) {
  document.querySelectorAll('.cat-tab').forEach(tab => tab.classList.remove('active'));
  event.target.classList.add('active');
  const allDocs = [...PRESET_DOCS, ...userDocs];
  const search = document.getElementById('kb-search').value.toLowerCase();
  const filtered = allDocs.filter(doc => {
    const mSearch = doc.title.toLowerCase().includes(search) || doc.category.toLowerCase().includes(search) || doc.content.toLowerCase().includes(search);
    const mCat = !category || doc.category === category;
    return mSearch && mCat;
  });
  const container = document.getElementById('doc-list');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128196;</div><h3>该分类暂无文档</h3></div>';
    return;
  }
  container.innerHTML = filtered.map(doc => {
    const isPreset = doc.id.startsWith('preset-');
    return '<div class="doc-item" onclick="showDocViewer(\'' + doc.id + '\')">' +
      '<div class="doc-icon">' + (isPreset ? '&#128196;' : '&#128221;') + '</div>' +
      '<div class="doc-info"><div class="doc-title">' + doc.title + (isPreset ? ' <span style="font-size:0.7rem;color:#888">(预置)</span>' : '') + '</div>' +
      '<div class="doc-meta">' + doc.category + ' · ' + doc.createdAt + '</div></div></div>';
  }).join('');
}

function showDocViewer(docId) {
  currentDocView = docId;
  const allDocs = [...PRESET_DOCS, ...userDocs];
  const doc = allDocs.find(d => d.id === docId);
  if (!doc) return;
  const viewer = document.getElementById('doc-viewer');
  document.getElementById('doc-list').style.display = 'none';
  document.getElementById('category-tabs').style.display = 'none';
  viewer.innerHTML = '<button class="back-btn" onclick="backToDocList()">← 返回列表</button>' +
    '<h2>' + doc.title + '</h2><div class="doc-viewer-meta">' + doc.category + ' · ' + doc.createdAt + '</div>' +
    '<div class="doc-viewer-body">' + markdownToHTML(doc.content) + '</div>';
  viewer.style.display = 'block';
}

function backToDocList() {
  currentDocView = null;
  document.getElementById('doc-viewer').style.display = 'none';
  document.getElementById('doc-list').style.display = 'block';
  document.getElementById('category-tabs').style.display = 'flex';
}

function viewDoc(docId) { showDocViewer(docId); event.stopPropagation(); }

function openAddDocModal(docId) {
  const modal = document.getElementById('doc-modal');
  document.getElementById('modal-title').textContent = docId ? '编辑文档' : '新建文档';
  if (docId) {
    const doc = [...PRESET_DOCS, ...userDocs].find(d => d.id === docId);
    if (doc) {
      document.getElementById('modal-doc-title').value = doc.title;
      document.getElementById('modal-doc-category').value = doc.category;
      document.getElementById('modal-doc-content').value = doc.content;
      document.getElementById('modal-doc-id').value = docId;
    }
  } else {
    document.getElementById('modal-doc-title').value = '';
    document.getElementById('modal-doc-category').value = '自定义';
    document.getElementById('modal-doc-content').value = '';
    document.getElementById('modal-doc-id').value = '';
  }
  modal.style.display = 'flex';
}

function closeDocModal() { document.getElementById('doc-modal').style.display = 'none'; }

function saveDoc() {
  const id = document.getElementById('modal-doc-id').value;
  const title = document.getElementById('modal-doc-title').value.trim();
  const category = document.getElementById('modal-doc-category').value;
  const content = document.getElementById('modal-doc-content').value.trim();
  if (!title || !content) { showToast('标题和内容不能为空', 'error'); return; }
  if (id) {
    const idx = userDocs.findIndex(d => d.id === id);
    if (idx !== -1) userDocs[idx] = { id, title, category, content, createdAt: userDocs[idx].createdAt };
  } else {
    userDocs.push({ id: 'user-' + Date.now(), title, category, content, createdAt: new Date().toISOString().split('T')[0] });
  }
  localStorage.setItem('clinicalkb_user_docs', JSON.stringify(userDocs));
  closeDocModal();
  renderDocList();
  renderManageList();
  updateStats();
  showToast(id ? '文档已更新' : '文档已添加');
}

function editDoc(docId) { openAddDocModal(docId); event.stopPropagation(); }

function deleteDoc(docId) {
  if (!confirm('确定删除此文档？')) return;
  userDocs = userDocs.filter(d => d.id !== docId);
  localStorage.setItem('clinicalkb_user_docs', JSON.stringify(userDocs));
  renderDocList(); renderManageList(); updateStats();
  showToast('文档已删除');
}

function renderManageList() {
  const container = document.getElementById('manage-doc-list');
  const empty = document.getElementById('manage-empty');
  if (userDocs.length === 0) { container.style.display = 'none'; empty.style.display = 'block'; return; }
  empty.style.display = 'none'; container.style.display = 'block';
  container.innerHTML = userDocs.map(doc =>
    '<div class="doc-item"><div class="doc-icon">&#128221;</div>' +
    '<div class="doc-info"><div class="doc-title">' + doc.title + '</div>' +
    '<div class="doc-meta">' + doc.category + ' · ' + doc.createdAt + '</div></div>' +
    '<div class="doc-actions"><button onclick="editDoc(\'' + doc.id + '\')">编辑</button>' +
    '<button onclick="deleteDoc(\'' + doc.id + '\')" style="color:#b8573a">删除</button></div></div>'
  ).join('');
}

function updateStats() {
  const allDocs = [...PRESET_DOCS, ...userDocs];
  document.getElementById('stat-docs').textContent = allDocs.length;
  document.getElementById('stat-chats').textContent = chatCount;
  document.getElementById('doc-count-badge').textContent = allDocs.length;
}

/* ===== AI 聊天 ===== */
function handleFileAttach(input, type) {
  if (!input.files.length) return;
  Array.from(input.files).forEach(file => {
    if (type === 'image' && !file.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; }
    if (attachedFiles.length >= 5) { showToast('最多上传5个文件', 'error'); return; }
    attachedFiles.push(file);
  });
  renderAttachments();
  input.value = '';
}

function renderAttachments() {
  const preview = document.getElementById('attachment-preview');
  preview.innerHTML = attachedFiles.map((f, i) =>
    '<div class="attachment-chip">' +
    (f.type.startsWith('image/') ? '&#128247; ' : '&#128196; ') +
    f.name.substring(0, 20) + (f.name.length > 20 ? '...' : '') +
    ' <button onclick="removeAttachment(' + i + ')">&times;</button></div>'
  ).join('');
}

function removeAttachment(i) { attachedFiles.splice(i, 1); renderAttachments(); }

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message && attachedFiles.length === 0) return;
  
  // 处理附件：图片→base64，文件→文本内容
  const imageBases = [];
  const fileContents = [];
  
  for (const file of attachedFiles) {
    if (file.type.startsWith('image/')) {
      const b64 = await fileToBase64(file);
      imageBases.push({ name: file.name, type: file.type, data: b64 });
    } else {
      const text = await readFileContent(file);
      fileContents.push({ name: file.name, content: text });
    }
  }
  
  // 构建用户消息显示
  let displayMsg = message;
  if (imageBases.length > 0) {
    displayMsg += '<br>' + imageBases.map(img => 
      '<img src="' + img.data + '" alt="' + img.name + '" onclick="previewImage(\'' + img.data + '\')" style="cursor:pointer;max-width:200px;max-height:150px;border-radius:4px;margin:4px">'
    ).join('');
  }
  if (fileContents.length > 0) {
    displayMsg += '<br><span style="font-size:0.76rem;opacity:0.7">已附加文件：' + fileContents.map(f => f.name).join('、') + '</span>';
  }
  
  addMessage('user', displayMsg);
  // 记录对话历史（文本部分）
  chatHistory.push({ role: 'user', content: message });
  input.value = '';
  attachedFiles = [];
  renderAttachments();
  chatCount++;
  localStorage.setItem('clinicalkb_chat_count', chatCount.toString());
  updateStats();
  
  const loadingMsg = addMessage('ai', '<div class="msg-loading">新雨正在思考<div class="dots"><span></span><span></span><span></span></div></div>');
  
  try {
    if (apiConfig.provider !== 'local' && apiConfig.key) {
      await callExternalAI(message, imageBases, fileContents, loadingMsg);
    } else {
      const response = generateAIResponse(message);
      chatHistory.push({ role: 'assistant', content: response.content });
      updateMessageContent(loadingMsg, response.content, response.sources);
    }
  } catch (e) {
    updateMessageContent(loadingMsg, '请求失败：' + e.message + '。已切换到本地检索。', []);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
      reader.readAsText(file);
    } else {
      // 二进制文件只传文件名，让AI知道有文件
      resolve('[文件：' + file.name + '，大小：' + (file.size / 1024).toFixed(1) + 'KB，类型：' + file.type + ']');
    }
  });
}

function previewImage(dataUrl) {
  const div = document.createElement('div');
  div.className = 'image-preview-modal';
  div.innerHTML = '<img src="' + dataUrl + '">';
  div.onclick = function() { div.remove(); };
  document.body.appendChild(div);
}

function addMessage(role, content, sources) {
  const messagesDiv = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg ' + role;
  msgDiv.dataset.msgId = Date.now();
  let srcHTML = '';
  if (sources && sources.length > 0) {
    srcHTML = '<div class="msg-sources">参考来源：' + sources.map(s => 
      '<span onclick="showDocViewer(\'' + s.id + '\')">' + s.title + '</span>'
    ).join('') + '</div>';
  }
  msgDiv.innerHTML = content + srcHTML;
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });
  return msgDiv;
}

function updateMessageContent(msgDiv, content, sources) {
  let srcHTML = '';
  if (sources && sources.length > 0) {
    srcHTML = '<div class="msg-sources">参考来源：' + sources.map(s =>
      '<span onclick="showDocViewer(\'' + s.id + '\')">' + s.title + '</span>'
    ).join('') + '</div>';
  }
  // 通过 markdownToHTML 渲染后再设置，避免显示原始 ** ### | 等符号
  msgDiv.innerHTML = markdownToHTML(content) + srcHTML;
  document.getElementById('chat-messages').scrollTo({ top: document.getElementById('chat-messages').scrollHeight, behavior: 'smooth' });
}

async function callExternalAI(query, imageBases, fileContents, loadingMsg) {
  const allDocs = [...PRESET_DOCS, ...userDocs];
  
  // 构建知识库上下文
  let knowledgeContext = '';
  if (query) {
    const relevantDocs = findRelevantDocs(query, allDocs, 2);
    relevantDocs.forEach(doc => {
      knowledgeContext += '\n--- 文档：' + doc.title + ' ---\n' + doc.content.substring(0, 3000) + '\n';
    });
  } else {
    // 没有文本查询时，附上全部知识库摘要
    knowledgeContext = allDocs.map(d => '文档：' + d.title + '\n' + d.content.substring(0, 500)).join('\n---\n');
  }
  
  const systemPrompt = '你是「新雨」，素问新雨小组的临床思维AI助手。请简洁、专业地回答问题，像DeepSeek网页版那样直接给出核心信息，避免冗长嵌套列表。优先基于知识库，无答案时联网搜索。\n\n知识库：\n' + knowledgeContext;
  
  // 构建消息：system + 历史对话 + 当前用户消息
  const messages = [{ role: 'system', content: systemPrompt }];
  
  // 插入最近 20 轮对话历史（让 AI 记住上下文）
  const recentHistory = chatHistory.slice(-40); // 最多 20 轮（每轮 user+assistant）
  for (const h of recentHistory) {
    messages.push({ role: h.role, content: h.content });
  }
  
  // 当前用户消息（多模态）
  const userContent = [];
  userContent.push({ type: 'text', text: query || '请分析我上传的图片和文件' });
  
  // 添加图片
  imageBases.forEach(img => {
    userContent.push({ type: 'image_url', image_url: { url: img.data } });
  });
  
  // 添加文件内容
  fileContents.forEach(f => {
    userContent.push({ type: 'text', text: '\n[附件文件：' + f.name + ']\n' + f.content.substring(0, 5000) });
  });
  
  messages.push({ role: 'user', content: userContent });
  
  const model = apiConfig.model || 'deepseek-v4-pro';
  
  // 判断环境：本地开发用代理，GitHub Pages 用直接调用
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const endpoint = isLocal ? '/api/chat' : (apiConfig.endpoint || 'https://api.deepseek.com/v1/chat/completions');
  const headers = isLocal 
    ? { 'Content-Type': 'application/json', 'X-API-Key': apiConfig.key }
    : { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiConfig.key };
  
  console.log('[API] 请求环境:', isLocal ? '本地代理' : '在线直连', '端点:', endpoint, '模型:', model);
  
  let resp;
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ model: model, messages: messages, stream: false, max_tokens: 4096, search_enable: true, thinking: { type: 'enabled' } })
    });
  } catch (netErr) {
    console.error('[API] 网络错误:', netErr);
    throw new Error('网络连接失败：' + netErr.message + '。请确认已通过「启动.bat」启动代理服务器（http://localhost:8800），而不是直接打开 index.html。');
  }
  
  if (!resp.ok) {
    const errText = await resp.text();
    console.error('[API] 响应错误:', resp.status, errText.substring(0, 200));
    throw new Error('API ' + resp.status + ': ' + errText.substring(0, 150));
  }
  
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || 'API返回为空';
  
  // 记录 AI 回复到对话历史
  chatHistory.push({ role: 'assistant', content: content });
  
  const relevantDocs = query ? findRelevantDocs(query, allDocs, 2) : [];
  updateMessageContent(loadingMsg, content, relevantDocs.map(d => ({ id: d.id, title: d.title })));
}

function findRelevantDocs(query, allDocs, topN) {
  const lowerQuery = query.toLowerCase();
  const keywords = {
    'nt':'NT增厚','hcg':'hCG','afp':'AFP','ue3':'uE3','inha':'抑制素A',
    '唐氏':'唐氏综合征','21三体':'21三体','高龄':'高龄妊娠',
    '筛查':'产前筛查','羊膜腔':'羊膜腔穿刺','遗传':'遗传咨询',
    '流产':'自然流产','mom':'MoM','nipt':'NIPT',
    '染色体':'染色体','不分离':'不分离','三体':'三体'
  };
  return allDocs.map(doc => {
    const c = doc.content.toLowerCase();
    let score = 0;
    for (const [k, t] of Object.entries(keywords)) {
      if (lowerQuery.includes(k) && c.includes(t.toLowerCase())) score += 2;
    }
    if (c.includes(lowerQuery) || doc.title.toLowerCase().includes(lowerQuery)) score += 3;
    return { ...doc, score };
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, topN);
}

function generateAIResponse(query) {
  const allDocs = [...PRESET_DOCS, ...userDocs];
  const topDocs = findRelevantDocs(query, allDocs, 3);
  let response = '';
  
  if (topDocs.length > 0) {
    const doc = topDocs[0];
    if (doc.title.includes('病例摘要')) {
      response = '根据病例摘要，患者张女士（41岁）的产前筛查显示：\n\n• **NT厚度**：3.1mm（正常<2.5mm）\n• **血清学筛查**：21三体高风险（1:92）\n• **血清标志物模式**：hCG显著升高（4.0415 MoM）+ uE3下降（0.7482 MoM）+ InhA升高（1.5221 MoM）\n• **建议**：遗传咨询并羊膜腔穿刺产前诊断\n\n这是典型的21三体筛查模式，结合高龄因素（41岁），胎儿唐氏综合征可能性较高。';
    } else if (doc.title.includes('提问整理')) {
      response = 'PBL案例「宝宝对不起」共包含33个提问，覆盖六大方面：\n\n**一、案例背景与人物理解**（Q1-Q6）\n**二、母体因素与既往史**（Q7-Q10）\n**三、产前筛查与诊断检测**（Q11-Q19）\n**四、唐氏综合征病因与机制**（Q20-Q26）\n**五、环境与生活方式因素**（Q27-Q29）\n**六、其他拓展问题**（Q30-Q33）\n\n请在知识库中浏览完整提问列表。';
    } else {
      response = '根据知识库文档「' + doc.title + '」：\n\n' + doc.content.substring(0, 300) + (doc.content.length > 300 ? '...' : '');
    }
  } else {
    response = '我是新雨，主要由DeepSeek V4 Pro驱动。你可以：\n\n• 询问PBL案例相关问题\n• 上传医学图片让我识别分析\n• 上传文档让我解读\n• 询问产前筛查指标（NT、hCG、AFP、uE3、InhA）\n• 讨论唐氏综合征的病因与机制';
  }
  
  return { content: response, sources: topDocs.map(d => ({ id: d.id, title: d.title })) };
}

/* ===== 文件处理中心 ===== */
function initDropZone() {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;
  
  ['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, function(e) { e.preventDefault(); dropZone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, function(e) { e.preventDefault(); dropZone.classList.remove('dragover'); });
  });
  dropZone.addEventListener('drop', function(e) { handleFileDrop(e.dataTransfer.files); });
}

async function handleFileDrop(files) {
  if (!files || files.length === 0) return;
  const results = document.getElementById('file-results');
  results.innerHTML = '<div style="padding:16px;color:var(--muted)"><em>正在分析 ' + files.length + ' 个文件...</em></div>';
  
  for (const file of Array.from(files)) {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;margin-bottom:12px';
    
    const isImage = file.type.startsWith('image/');
    card.innerHTML = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
      '<div style="font-size:1.5rem">' + (isImage ? '&#128247;' : '&#128196;') + '</div>' +
      '<div><strong>' + file.name + '</strong><div style="font-size:0.78rem;color:var(--muted)">' + (file.size/1024).toFixed(1) + 'KB · ' + file.type + '</div></div></div>' +
      '<div style="color:var(--muted);font-size:0.84rem"><em>分析中...</em></div>';
    results.innerHTML = '';
    results.appendChild(card);
    
    try {
      if (isImage) {
        const b64 = await fileToBase64(file);
        card.innerHTML = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
          '<div style="font-size:1.5rem">&#128247;</div>' +
          '<div><strong>' + file.name + '</strong><div style="font-size:0.78rem;color:var(--muted)">' + (file.size/1024).toFixed(1) + 'KB</div></div></div>' +
          '<img src="' + b64 + '" style="max-width:100%;max-height:300px;border-radius:4px;margin-bottom:12px;cursor:pointer" onclick="previewImage(\'' + b64 + '\')">' +
          '<div style="font-size:0.82rem;color:var(--muted)">图片已加载，可复制到「新雨AI」对话框发送分析请求</div>' +
          '<button class="btn btn-sm btn-primary" style="margin-top:8px" onclick="sendFileToChat(\'' + b64 + '\',\'' + file.name + '\',true)">发送给新雨分析</button>';
      } else {
        const text = await readFileContent(file);
        card.innerHTML = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
          '<div style="font-size:1.5rem">&#128196;</div>' +
          '<div><strong>' + file.name + '</strong><div style="font-size:0.78rem;color:var(--muted)">' + (file.size/1024).toFixed(1) + 'KB</div></div></div>' +
          '<div style="background:var(--light);padding:12px;border-radius:4px;font-size:0.82rem;max-height:200px;overflow-y:auto;white-space:pre-wrap;margin-bottom:8px">' + text.substring(0, 1000) + (text.length > 1000 ? '...' : '') + '</div>' +
          '<button class="btn btn-sm btn-primary" onclick="sendFileToChat(\'' + encodeURIComponent(text.substring(0,3000)) + '\',\'' + file.name + '\',false)">发送给新雨分析</button>';
      }
    } catch (e) {
      card.innerHTML += '<div style="color:var(--warm);font-size:0.82rem">处理失败：' + e.message + '</div>';
    }
  }
}

function sendFileToChat(data, fileName, isImage) {
  switchPage('chat');
  const input = document.getElementById('chat-input');
  if (isImage) {
    const file = dataURLtoFile(data, fileName);
    attachedFiles.push(file);
    renderAttachments();
    input.value = '请分析这张图片的内容';
  } else {
    input.value = '请分析以下文件内容：\n[文件：' + fileName + ']\n' + decodeURIComponent(data);
  }
  input.focus();
}

function dataURLtoFile(dataurl, filename) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

/* ===== API 配置 ===== */
function showApiConfig() {
  const modal = document.getElementById('api-modal');
  document.getElementById('api-modal-provider').value = apiConfig.provider || 'deepseek';
  document.getElementById('api-modal-key').value = apiConfig.key || '';
  document.getElementById('api-modal-endpoint').value = apiConfig.endpoint || 'https://api.deepseek.com/v1/chat/completions';
  document.getElementById('api-modal-model').value = apiConfig.model || 'deepseek-v4-pro';
  toggleApiFields();
  modal.style.display = 'flex';
}

function closeApiModal() { document.getElementById('api-modal').style.display = 'none'; }

function toggleApiFields() {
  const provider = document.getElementById('api-modal-provider').value;
  document.getElementById('api-modal-endpoint-group').style.display = provider === 'custom' ? 'block' : 'none';
}

function confirmApiConfig() {
  apiConfig = {
    provider: document.getElementById('api-modal-provider').value,
    key: document.getElementById('api-modal-key').value.trim(),
    endpoint: document.getElementById('api-modal-endpoint').value.trim(),
    model: document.getElementById('api-modal-model').value.trim()
  };
  localStorage.setItem('clinicalkb_api_config', JSON.stringify(apiConfig));
  closeApiModal();
  updateApiStatus();
  showToast('AI配置已保存');
}

function loadApiConfig() {
  document.getElementById('api-provider').value = apiConfig.provider || 'deepseek';
  document.getElementById('api-key').value = apiConfig.key || '';
  document.getElementById('api-endpoint').value = apiConfig.endpoint || '';
  document.getElementById('api-model').value = apiConfig.model || '';
}

function saveApiConfig() {
  apiConfig = {
    provider: document.getElementById('api-provider').value,
    key: document.getElementById('api-key').value.trim(),
    endpoint: document.getElementById('api-endpoint').value.trim(),
    model: document.getElementById('api-model').value.trim()
  };
  localStorage.setItem('clinicalkb_api_config', JSON.stringify(apiConfig));
  updateApiStatus();
  showToast('配置已保存');
}

function updateApiStatus() {
  const badge = document.getElementById('api-status-badge');
  if (apiConfig.provider === 'deepseek' && apiConfig.key) {
    badge.textContent = 'DeepSeek V4 Pro';
    badge.className = 'api-badge configured';
  } else if (apiConfig.key) {
    badge.textContent = 'AI 已配置';
    badge.className = 'api-badge configured';
  } else {
    badge.textContent = 'API 未配置';
    badge.className = 'api-badge unconfigured';
  }
}

/* ===== 工具函数 ===== */
function markdownToHTML(md) {
  if (!md) return '';
  let html = md;

  // 思考过程区块：--- **思考过程**\n{content} → 特殊样式区域
  html = html.replace(/\n*---\s*\n\*\*思考过程\*\*\s*\n([\s\S]*?)$/gm, function(_, thinking) {
    return '\n<div class="thinking-section"><h5>思考过程</h5><div class="thinking-content">' + thinking.trim() + '</div></div>';
  });

  // 代码块（先处理，避免内部格式被干扰）
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');

  // 表格（多行 | col | col | 结构）
  html = html.replace(/(^\|.*\|$\n)+/gm, function(tableBlock) {
    const rows = tableBlock.trim().split('\n').filter(function(r) { return r.indexOf('|') >= 0 && !/^\|[\s\-:]+\|/.test(r); });
    if (rows.length === 0) return tableBlock;
    const cells = rows.map(function(r) {
      const tds = r.split('|').filter(function(c) { return c.trim(); });
      return '<tr>' + tds.map(function(c) { return '<td>' + c.trim() + '</td>'; }).join('') + '</tr>';
    });
    return '<table>' + cells.join('') + '</table>';
  });

  // 标题
  html = html.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

  // 粗体和斜体
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // 无序列表
  html = html.replace(/^- (.*$)/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // 引用
  html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');

  // 水平线
  html = html.replace(/^---$/gm, '<hr>');

  // 换行（连续空行 → 段落分隔，单换行 → <br>）
  html = html.replace(/<br>\s*<br>/g, '</p><p>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = '<p>' + html + '</p>';

  // 清理空段落
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p><\/p>/g, '');

  return html;
}

function showToast(message, type) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  if (type === 'error') toast.style.background = '#b8573a';
  container.appendChild(toast);
  setTimeout(function() { toast.classList.add('fadeout'); setTimeout(function() { toast.remove(); }, 300); }, 3000);
}