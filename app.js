/* 素问新雨 - 临床思维知识库 主逻辑 */
/* ===== 登录系统 ===== */
// 密码哈希：1133 的 SHA-256 值（前端计算比对）
const PASSWORD_HASH = '7a99d42d79e9bafeaa5ccedaf0135267da4ccd197a99131a8cf15025cb54ab18';

/* ===== 移动端侧边栏切换 ===== */
function toggleSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const isOpen = sidebar.classList.toggle('open');
  overlay.classList.toggle('open', isOpen);
}

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function doLogin() {
  const input = document.getElementById('login-password');
  const error = document.getElementById('login-error');
  if (await sha256(input.value) === PASSWORD_HASH) {
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
function restoreChatHistory() {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;
  // 清空现有消息（除了系统提示）
  chatMessages.innerHTML = '';
  // 重新渲染历史消息
  chatHistory.forEach(entry => {
    if (entry.role === 'user') {
      addMessage('user', entry.content);
    } else if (entry.role === 'assistant') {
      const loadingMsg = addMessage('assistant', '');
      updateMessageContent(loadingMsg, entry.content, []);
    }
  });
  // 滚动到底部
  setTimeout(() => {
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
    const scrollBtn = document.getElementById('scroll-bottom-btn');
    if (scrollBtn) scrollBtn.classList.remove('visible');
  }, 100);
}
function saveChatHistory() {
  try { localStorage.setItem('clinicalkb_chat_history', JSON.stringify(chatHistory.slice(-2000))); } catch(e) {}
}
let chatHistory = JSON.parse(localStorage.getItem('clinicalkb_chat_history') || '[]');
let userDocs = JSON.parse(localStorage.getItem('clinicalkb_user_docs') || '[]');
let apiConfig = JSON.parse(localStorage.getItem('clinicalkb_api_config') || 
  '{"provider":"deepseek","key":"","endpoint":"https://api.deepseek.com/v1/chat/completions","model":"deepseek-v4-pro"}');
let chatCount = parseInt(localStorage.getItem('clinicalkb_chat_count') || '0');
let attachedFiles = [];
let searchDebounceTimer = null;
function debounceSearch() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    renderDocList();
    searchDebounceTimer = null;
  }, 300);
}

/* ===== 初始化 ===== */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    // Ctrl+K 聚焦搜索框
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const search = document.getElementById('kb-search');
      if (search) search.focus();
    }
    // / 聚焦聊天输入框
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const input = document.getElementById('chat-input');
      if (input && input.offsetParent) {
        e.preventDefault();
        input.focus();
      }
    }
    // Esc 关闭模态框
    if (e.key === 'Escape') {
      const modals = ['doc-modal', 'api-modal', 'image-preview'];
      for (const id of modals) {
        const modal = document.getElementById(id);
        if (modal && modal.style.display !== 'none') {
          if (id === 'doc-modal') closeDocModal();
          if (id === 'api-modal') closeApiModal();
          if (id === 'image-preview') closeImagePreview();
          break;
        }
      }
    }
  });
}

/* ===== 聊天滚动 ===== */
function scrollChatToBottom() {
  const messagesDiv = document.getElementById('chat-messages');
  if (messagesDiv) {
    messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });
  }
}

function setupChatScroll() {
  const messagesDiv = document.getElementById('chat-messages');
  if (!messagesDiv) return;
  const scrollBtn = document.getElementById('scroll-bottom-btn');
  if (!scrollBtn) return;

  // 监听滚动：距底部超过 200px 时显示回到底部按钮
  messagesDiv.addEventListener('scroll', function() {
    const distToBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight;
    if (distToBottom > 200) {
      scrollBtn.classList.add('visible');
    } else {
      scrollBtn.classList.remove('visible');
    }
  });
}

/* ===== 手机专属界面 ===== */
function switchMobilePage(page) {
  // 更新底部导航激活状态
  document.querySelectorAll('.mobile-nav-item').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-mobile-page="${page}"]`).classList.add('active');
  
  // 切换页面
  switchPage(page);
  
  // 如果是聊天页面，聚焦输入框
  if (page === 'chat') {
    setTimeout(() => {
      const mobileInput = document.getElementById('mobile-chat-input');
      if (mobileInput) mobileInput.focus();
    }, 100);
  }
}

function sendMobileMessage() {
  const input = document.getElementById('mobile-chat-input');
  const message = input.value.trim();
  if (!message) return;
  
  // 使用现有的发送逻辑
  const chatInput = document.getElementById('chat-input');
  chatInput.value = message;
  sendMessage();
  
  // 清空移动端输入
  input.value = '';
}

function showMobileUploadSheet() {
  document.getElementById('mobile-sheet-overlay').style.display = 'block';
  document.getElementById('mobile-upload-sheet').style.display = 'block';
}

function closeMobileUploadSheet() {
  document.getElementById('mobile-sheet-overlay').style.display = 'none';
  document.getElementById('mobile-upload-sheet').style.display = 'none';
}

function handleMobileFileUpload(type) {
  closeMobileUploadSheet();
  
  // 创建文件输入元素
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = type === 'image' ? 'image/*' : '.pdf,.doc,.docx,.txt,.md,.xlsx,.pptx';
  input.multiple = true;
  
  input.onchange = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    
    // 切换到聊天页面
    switchMobilePage('chat');
    
    // 处理文件
    for (const file of files) {
      if (type === 'image') {
        const b64 = await fileToBase64(file);
        const fileObj = dataURLtoFile(b64, file.name);
        attachedFiles.push(fileObj);
      } else {
        const text = await readFileContent(file);
        const fileObj = new File([text], file.name, { type: 'text/plain' });
        attachedFiles.push(fileObj);
      }
    }
    
    // 渲染附件
    renderAttachments();
    
    // 设置输入提示
    const mobileInput = document.getElementById('mobile-chat-input');
    const chatInput = document.getElementById('chat-input');
    if (type === 'image') {
      mobileInput.value = '请分析这些图片';
      chatInput.value = '请分析这些图片';
    } else {
      mobileInput.value = '请分析这些文档';
      chatInput.value = '请分析这些文档';
    }
    mobileInput.focus();
  };
  
  input.click();
}

// 检测移动端
function isMobileDevice() {
  return window.innerWidth <= 768;
}

// 初始化手机界面
function initMobileUI() {
  if (isMobileDevice()) {
    // 隐藏桌面端输入区域
    const desktopInput = document.querySelector('.chat-input-area');
    if (desktopInput) desktopInput.style.display = 'none';
    
    // 显示手机界面
    const mobileNav = document.querySelector('.mobile-bottom-nav');
    const mobileInput = document.querySelector('.mobile-chat-input');
    if (mobileNav) mobileNav.style.display = 'block';
    if (mobileInput) mobileInput.style.display = 'block';
  }
}

// 页面加载时初始化
window.addEventListener('load', () => {
  initMobileUI();
  // 确保聊天页面正确显示
  if (isMobileDevice() && window.location.hash.includes('chat')) {
    switchMobilePage('chat');
  }
});

window.addEventListener('resize', initMobileUI);

function initApp() {
  initNavigation();
  renderDocList();
  renderManageList();
  updateStats();
  loadApiConfig();
  updateApiStatus();
  initDropZone();
  restoreChatHistory();
  setupKeyboardShortcuts();
  setupChatScroll();
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
  // 移动端：导航后关闭侧边栏
  document.getElementById('app-sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
  
  // 同步更新移动端底部导航
  if (isMobileDevice()) {
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
      btn.classList.remove('active');
    });
    const mobileBtn = document.querySelector(`[data-mobile-page="${page}"]`);
    if (mobileBtn) mobileBtn.classList.add('active');
  }
  
  // 切换到聊天页面时重新初始化滚动监听
  if (page === 'chat') {
    setTimeout(() => setupChatScroll(), 100);
  }
}

/* ===== 文档管理 ===== */
function highlightText(text, search) {
  if (!search) return text;
  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

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
  tabsContainer.innerHTML = '<button class="cat-tab active" onclick="filterByCategory(\'\', event)">全部</button>';
  categories.forEach(cat => {
    tabsContainer.innerHTML += '<button class="cat-tab" onclick="filterByCategory(\'' + cat.replace(/'/g,"\\'") + '\', event)">' + cat + '</button>';
  });
  
  if (filteredDocs.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128270;</div><h3>未找到相关文档</h3><p>尝试其他搜索词</p></div>';
    return;
  }
  
  container.innerHTML = filteredDocs.map(doc => {
    const isPreset = doc.id.startsWith('preset-');
    const highlightedTitle = highlightText(doc.title, search);
    const highlightedCategory = highlightText(doc.category, search);
    // 预览内容高亮
    let preview = doc.content.substring(0, 120).toLowerCase();
    if (search && preview.includes(search)) {
      const start = Math.max(0, preview.indexOf(search) - 20);
      preview = '...' + doc.content.substring(start, start + 80) + '...';
      preview = highlightText(preview, search);
    } else {
      preview = preview + (doc.content.length > 120 ? '...' : '');
    }
    
    return '<div class="doc-item" onclick="showDocViewer(\'' + doc.id + '\')">' +
      '<div class="doc-icon">' + (isPreset ? '&#128196;' : '&#128221;') + '</div>' +
      '<div class="doc-info"><div class="doc-title">' + highlightedTitle + (isPreset ? ' <span style="font-size:0.7rem;color:#888">(预置)</span>' : '') + '</div>' +
      '<div class="doc-meta">' + highlightedCategory + ' · ' + doc.createdAt + '</div>' +
      (search ? '<div class="doc-preview" style="font-size:0.8rem;color:#666;margin-top:4px">' + preview + '</div>' : '') + '</div>' +
      '<div class="doc-actions" onclick="event.stopPropagation()">' +
      (!isPreset ? '<button onclick="editDoc(\'' + doc.id + '\', event)">编辑</button>' : '') +
      '<button onclick="viewDoc(\'' + doc.id + '\', event)">查看</button></div></div>';
  }).join('');
}

function filterByCategory(category, event) {
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

function viewDoc(docId, event) { showDocViewer(docId); event.stopPropagation(); }

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

function editDoc(docId, event) { openAddDocModal(docId); event.stopPropagation(); }

function deleteDoc(docId) {
  if (!confirm('确定删除此文档？')) return;
  userDocs = userDocs.filter(d => d.id !== docId);
  localStorage.setItem('clinicalkb_user_docs', JSON.stringify(userDocs));
  renderDocList(); renderManageList(); updateStats();
  showToast('文档已删除');
}

function renderManageList() {
  const container = document.getElementById('manage-doc-list-body');
  const listContainer = document.getElementById('manage-doc-list');
  const empty = document.getElementById('manage-empty');
  
  if (userDocs.length === 0) { 
    listContainer.style.display = 'none'; 
    empty.style.display = 'block'; 
    return; 
  }
  
  empty.style.display = 'none'; 
  listContainer.style.display = 'block';
  
  container.innerHTML = userDocs.map(doc => `
    <div class="doc-row" data-doc-id="${doc.id}">
      <div class="doc-checkbox">
        <input type="checkbox" class="doc-select" onchange="updateBatchDeleteBtn()">
      </div>
      <div class="doc-title">
        <a href="javascript:void(0)" onclick="viewDoc('${doc.id}', event)">${doc.title}</a>
      </div>
      <div class="doc-category">${doc.category}</div>
      <div class="doc-size">${Math.ceil(doc.content.length / 1024)} KB</div>
      <div class="doc-date">${doc.createdAt}</div>
      <div class="doc-actions">
        <button class="btn btn-outline btn-sm" onclick="viewDoc('${doc.id}', event)" title="查看">👁️</button>
        <button class="btn btn-outline btn-sm" onclick="editDoc('${doc.id}', event)" title="编辑">✏️</button>
        <button class="btn btn-outline btn-sm" onclick="sendDocToChat('${doc.id}')" title="发送到聊天">💬</button>
        <button class="btn btn-outline btn-sm" onclick="deleteDoc('${doc.id}')" title="删除" style="color:var(--warm)">🗑️</button>
      </div>
    </div>
  `).join('');
}

/* ===== 文档管理增强功能 ===== */
let selectedDocIds = new Set();

function toggleSelectAllDocs() {
  const selectAll = document.getElementById('select-all-docs').checked;
  document.querySelectorAll('.doc-select').forEach(cb => cb.checked = selectAll);
  updateBatchDeleteBtn();
}

function updateBatchDeleteBtn() {
  const selected = document.querySelectorAll('.doc-select:checked').length;
  const btn = document.getElementById('batch-delete-btn');
  btn.disabled = selected === 0;
  btn.innerHTML = `<span class="action-icon">&#128465;</span> 批量删除 (${selected})`;
}

function batchDeleteDocs() {
  const selected = Array.from(document.querySelectorAll('.doc-select:checked'))
    .map(cb => cb.closest('.doc-row').dataset.docId);
  
  if (selected.length === 0) return;
  if (!confirm(`确定删除选中的 ${selected.length} 个文档？`)) return;
  
  userDocs = userDocs.filter(d => !selected.includes(d.id));
  localStorage.setItem('clinicalkb_user_docs', JSON.stringify(userDocs));
  renderDocList();
  renderManageList();
  updateStats();
  showToast(`已删除 ${selected.length} 个文档`);
}

function filterManageDocs() {
  const category = document.getElementById('category-filter').value;
  const search = document.getElementById('manage-search').value.toLowerCase();
  
  document.querySelectorAll('.doc-row').forEach(row => {
    const docId = row.dataset.docId;
    const doc = userDocs.find(d => d.id === docId);
    if (!doc) return;
    
    const matchCategory = !category || doc.category === category;
    const matchSearch = !search || 
      doc.title.toLowerCase().includes(search) || 
      doc.content.toLowerCase().includes(search);
    
    row.style.display = matchCategory && matchSearch ? 'grid' : 'none';
  });
}

function debounceManageSearch() {
  clearTimeout(window.manageSearchTimer);
  window.manageSearchTimer = setTimeout(filterManageDocs, 300);
}

function openQuickUploadModal() {
  document.getElementById('quick-upload-modal').style.display = 'flex';
  document.getElementById('upload-progress').style.display = 'none';
  document.getElementById('process-upload-btn').disabled = false;
  document.getElementById('quick-upload-input').value = '';
  uploadedFiles = [];
  document.getElementById('quick-upload-zone').innerHTML = `
    <div class="upload-icon">&#128206;</div>
    <p>拖拽文件到此处，或点击上传</p>
    <p style="font-size:0.72rem;color:var(--muted);margin-top:4px">支持：图片（JPG/PNG/GIF）、文档（PDF/Word/Excel/TXT/MD）</p>
    <input type="file" id="quick-upload-input" accept="image/*,.pdf,.doc,.docx,.txt,.md,.xlsx,.pptx" multiple style="display:none" onchange="handleQuickUpload(this.files)">
  `;
  
  // 标题规则监听
  document.getElementById('title-rule').addEventListener('change', function() {
    document.getElementById('custom-title-group').style.display = this.value === 'custom' ? 'block' : 'none';
  });
}

function closeQuickUploadModal() {
  document.getElementById('quick-upload-modal').style.display = 'none';
  document.getElementById('quick-upload-input').value = '';
}

let uploadedFiles = [];

function handleQuickUpload(files) {
  uploadedFiles = Array.from(files);
  const zone = document.getElementById('quick-upload-zone');
  const fileList = uploadedFiles.map(f => 
    `<div class="file-chip">${f.type.startsWith('image/') ? '🖼️' : '📄'} ${f.name}</div>`
  ).join('');
  zone.innerHTML = `
    <div class="upload-icon">&#128206;</div>
    <p>已选择 ${uploadedFiles.length} 个文件</p>
    <div style="margin-top:12px;font-size:0.8rem;color:var(--muted)">${fileList}</div>
  `;
}

function processUploadedFiles() {
  if (uploadedFiles.length === 0) {
    showToast('请先选择文件', 'error');
    return;
  }
  
  const category = document.getElementById('upload-category').value;
  const titleRule = document.getElementById('title-rule').value;
  const customTitle = document.getElementById('custom-doc-title').value;
  
  document.getElementById('process-upload-btn').disabled = true;
  document.getElementById('upload-progress').style.display = 'block';
  
  processFilesSequentially(uploadedFiles, category, titleRule, customTitle);
}

async function processFilesSequentially(files, category, titleRule, customTitle) {
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progress = ((i + 1) / files.length) * 100;
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `处理中: ${i + 1}/${files.length} (${file.name})`;
    
    try {
      let title = '';
      if (titleRule === 'filename') {
        title = file.name.replace(/\.[^/.]+$/, ''); // 移除扩展名
      } else if (titleRule === 'custom' && customTitle) {
        title = customTitle + (files.length > 1 ? ` ${i + 1}` : '');
      } else {
        title = `上传文档 ${i + 1}`;
      }
      
      let content = '';
      if (file.type.startsWith('image/')) {
        const b64 = await fileToBase64(file);
        content = `![${file.name}](${b64})\n\n*图片上传于 ${new Date().toLocaleString()}*`;
      } else {
        content = await readFileContent(file);
      }
      
      userDocs.push({
        id: 'upload-' + Date.now() + '-' + i,
        title: title,
        category: category,
        content: content,
        createdAt: new Date().toISOString().split('T')[0]
      });
      
    } catch (err) {
      console.error('处理文件失败:', file.name, err);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100)); // 小延迟避免UI卡顿
  }
  
  // 保存并更新
  localStorage.setItem('clinicalkb_user_docs', JSON.stringify(userDocs));
  renderDocList();
  renderManageList();
  updateStats();
  
  progressText.textContent = `完成！已添加 ${files.length} 个文档到知识库`;
  setTimeout(() => {
    closeQuickUploadModal();
    showToast(`成功添加 ${files.length} 个文档到知识库`);
  }, 1000);
}

function sendDocToChat(docId) {
  const doc = userDocs.find(d => d.id === docId) || PRESET_DOCS.find(d => d.id === docId);
  if (!doc) return;
  
  switchPage('chat');
  const input = document.getElementById('chat-input');
  input.value = `请分析以下文档：\n\n[文档标题：${doc.title}]\n[分类：${doc.category}]\n\n${doc.content.substring(0, 2000)}${doc.content.length > 2000 ? '...' : ''}`;
  input.focus();
  
  // 移动端同步
  const mobileInput = document.getElementById('mobile-chat-input');
  if (mobileInput) mobileInput.value = `请分析文档：${doc.title}`;
}

function exportDocs() {
  const data = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    userDocs: userDocs,
    presetCount: PRESET_DOCS.length
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `素问新雨_知识库_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('文档已导出为 JSON 文件');
}

function importDocs(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.userDocs)) throw new Error('格式错误：缺少 userDocs 数组');
      // 合并文档，避免重复 ID
      const existingIds = new Set(userDocs.map(d => d.id));
      const newDocs = data.userDocs.filter(d => !existingIds.has(d.id));
      if (newDocs.length === 0) {
        showToast('没有新文档可导入', 'info');
        return;
      }
      userDocs.push(...newDocs);
      localStorage.setItem('clinicalkb_user_docs', JSON.stringify(userDocs));
      renderManageList();
      renderDocList();
      updateStats();
      showToast(`成功导入 ${newDocs.length} 个文档`);
    } catch (err) {
      showToast('导入失败：' + err.message, 'error');
    }
    input.value = '';
  };
  reader.readAsText(file);
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
  saveChatHistory();
  input.value = '';
  attachedFiles = [];
  renderAttachments();
  chatCount++;
  localStorage.setItem('clinicalkb_chat_count', chatCount.toString());
  updateStats();
  
  const loadingMsg = addMessage('ai', '<div class="msg-loading">新雨正在思考<div class="dots"><span></span><span></span><span></span></div></div>');
  
  try {
    if (apiConfig.provider !== 'local' && apiConfig.key && apiConfig.key.length > 10) {
      await callExternalAI(message, imageBases, fileContents, loadingMsg);
    } else {
      const response = generateAIResponse(message);
      chatHistory.push({ role: 'assistant', content: response.content });
      saveChatHistory();
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
  setTimeout(() => {
    messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });
    // 隐藏回到底部按钮
    const scrollBtn = document.getElementById('scroll-bottom-btn');
    if (scrollBtn) scrollBtn.classList.remove('visible');
  }, 50);
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
  const messagesDiv = document.getElementById('chat-messages');
  setTimeout(() => {
    messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });
    const scrollBtn = document.getElementById('scroll-bottom-btn');
    if (scrollBtn) scrollBtn.classList.remove('visible');
  }, 50);
}

async function callExternalAI(query, imageBases, fileContents, loadingMsg) {
  const allDocs = [...PRESET_DOCS, ...userDocs];
  
  // 构建知识库上下文：注入全部知识库文档，让AI拥有完整知识
  let knowledgeContext = allDocs.map(d => '--- 文档：' + d.title + ' ---\n' + d.content).join('\n\n');
  
  const systemPrompt = '你是「新雨」，素问新雨小组的临床思维AI助手。请简洁、专业地回答问题，像DeepSeek网页版那样直接给出核心信息，避免冗长嵌套列表。优先基于知识库，无答案时联网搜索。\n\n知识库：\n' + knowledgeContext + '\n\n**重要：你拥有沙箱执行能力**\n你可以自主读取、写入、运行代码。当需要操作文件或执行计算时，请使用以下工具：\n\n1. **read_file** - 读取文件内容\n2. **write_file** - 写入/追加文件\n3. **list_dir** - 列出目录内容\n4. **run_python** - 执行Python代码\n\n调用格式：在回复中嵌入JSON对象，如：\n```json\n{\"action\": \"read_file\", \"args\": {\"path\": \"data.txt\"}}\n```\n我会在后台执行并返回结果。请根据结果继续推理。';
  
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
  let content = data.choices?.[0]?.message?.content || 'API返回为空';
  
  // 提取思考过程（前端直接解析，不依赖代理服务器）
  const reasoning = data.choices?.[0]?.message?.reasoning_content;
  if (reasoning && !content.includes('**思考过程**')) {
    content += '\n\n---\n**思考过程**\n' + reasoning;
  }
  
  // 记录 AI 回复到对话历史（不含思考过程，保持历史干净）
  chatHistory.push({ role: 'assistant', content: content });
  saveChatHistory();
  
  // 引用来源：展示所有知识库文档（因为AI已获得全部知识库）
  const referencedDocs = query ? findRelevantDocs(query, allDocs, 5) : [];
  updateMessageContent(loadingMsg, content, referencedDocs.map(d => ({ id: d.id, title: d.title })));
  
  // 检查回复中是否包含沙箱工具调用
  await processSandboxCalls(content, loadingMsg);
}

async function processSandboxCalls(content, loadingMsg) {
  // 提取 AI 回复中的沙箱工具调用 JSON
  const jsonRegex = /```json\s*\n(\{[\s\S]*?\})\s*\n```/g;
  let match;
  let result = null;
  
  while ((match = jsonRegex.exec(content)) !== null) {
    try {
      const call = JSON.parse(match[1]);
      if (call.action && ['read_file', 'write_file', 'list_dir', 'run_python'].includes(call.action)) {
        console.log('[沙箱] 执行:', call.action, call.args);
        
        // 显示执行中状态
        const statusLine = document.createElement('div');
        statusLine.className = 'sandbox-status';
        statusLine.innerHTML = '<span style="color:var(--muted);font-size:0.82rem">⏳ 沙箱执行中：' + call.action + '...</span>';
        loadingMsg.parentElement.appendChild(statusLine);
        
        // 调用沙箱 API
        const resp = await fetch('/api/sandbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(call)
        });
        result = await resp.json();
        
        // 更新状态
        const ok = !result.error && result.ok !== false;
        statusLine.innerHTML = ok 
          ? '<span style="color:var(--primary);font-size:0.82rem">✓ 沙箱执行完成</span>'
          : '<span style="color:var(--warm);font-size:0.82rem">✗ 沙箱错误：' + (result.error || '未知') + '</span>';
      }
    } catch (e) {
      console.log('[沙箱] JSON解析失败:', e);
    }
  }
  
  // 如果有工具调用结果，追加到消息
  if (result) {
    const resultBlock = document.createElement('div');
    resultBlock.style.cssText = 'background:var(--light);padding:12px;border-radius:4px;margin-top:8px;font-size:0.82rem;white-space:pre-wrap;max-height:300px;overflow-y:auto';
    resultBlock.textContent = JSON.stringify(result, null, 2);
    resultBlock.className = 'sandbox-result';
    loadingMsg.parentElement.appendChild(resultBlock);
  }
}

function findRelevantDocs(query, allDocs, topN) {
  const lowerQuery = query.toLowerCase();
  // 将查询分词，用于逐词匹配
  const queryWords = lowerQuery.split(/[\s,，。！？、；：""''（）\(\)]+/).filter(w => w.length >= 2);
  const keywords = {
    'nt':'NT增厚','hcg':'hCG','afp':'AFP','ue3':'uE3','inha':'抑制素A',
    '唐氏':'唐氏综合征','21三体':'21三体','高龄':'高龄妊娠',
    '筛查':'产前筛查','羊膜腔':'羊膜腔穿刺','遗传':'遗传咨询',
    '流产':'自然流产','mom':'MoM','nipt':'NIPT',
    '染色体':'染色体','不分离':'不分离','三体':'三体'
  };
  return allDocs.map(doc => {
    const c = doc.content.toLowerCase();
    const t = doc.title.toLowerCase();
    let score = 0;
    // 专业关键词匹配
    for (const [k, v] of Object.entries(keywords)) {
      if (lowerQuery.includes(k) && c.includes(v.toLowerCase())) score += 2;
    }
    // 完整查询串匹配
    if (c.includes(lowerQuery) || t.includes(lowerQuery)) score += 3;
    // 逐词匹配：查询中的每个词在文档中出现则加分
    for (const word of queryWords) {
      if (c.includes(word)) score += 1;
      if (t.includes(word)) score += 2;
    }
    return { ...doc, score };
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, topN);
}

function generateAIResponse(query) {
  const allDocs = [...PRESET_DOCS, ...userDocs];
  const topDocs = findRelevantDocs(query, allDocs, 5);
  let response = '';
  
  if (topDocs.length > 0) {
    // 从匹配度最高的文档中提取相关段落
    const bestDoc = topDocs[0];
    const lowerQuery = query.toLowerCase();
    const content = bestDoc.content;
    
    // 尝试找到查询词在文档中最相关的位置
    let snippet = '';
    const idx = content.toLowerCase().indexOf(lowerQuery);
    if (idx >= 0) {
      // 找到查询词，截取周围 400 字符
      const start = Math.max(0, idx - 100);
      const end = Math.min(content.length, idx + lowerQuery.length + 300);
      snippet = (start > 0 ? '...' : '') + content.substring(start, end) + (end < content.length ? '...' : '');
    } else {
      // 没找到精确匹配，取文档开头
      snippet = content.substring(0, 400) + (content.length > 400 ? '...' : '');
    }
    response = '根据知识库文档「' + bestDoc.title + '」：\n\n' + snippet;
    
    // 如果还有其他相关文档，列出
    if (topDocs.length > 1) {
      response += '\n\n---\n其他相关文档：\n' + topDocs.slice(1).map(d => '• ' + d.title).join('\n');
    }
    
    // 添加配置提示
    response += '\n\n---\n💡 **提示**：当前使用本地知识库检索，回答有限。如需获得更智能的AI回答，请在「工作台」→「AI配置」中填写DeepSeek API Key。';
  } else {
    // 无匹配时，列出知识库中的可用主题
    const topics = allDocs.map(d => d.title);
    response = '知识库中暂未找到与「' + query + '」直接匹配的内容。\n\n当前知识库包含以下文档，你可以尝试换个问法：\n\n' +
      topics.slice(0, 10).map(t => '• ' + t).join('\n') +
      (topics.length > 10 ? '\n• ...等共' + topics.length + '篇文档' : '') +
      '\n\n---\n💡 **提示**：当前使用本地知识库检索，回答有限。如需获得更智能的AI回答，请在「工作台」→「AI配置」中填写DeepSeek API Key。';
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
  const hasKey = apiConfig.key && apiConfig.key.length > 10;
  if (apiConfig.provider === 'deepseek' && hasKey) {
    badge.textContent = 'DeepSeek V4 Pro';
    badge.className = 'api-badge configured';
  } else if (hasKey) {
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
  // 使用 marked.js 渲染
  try {
    // 先分离思考过程区块，单独处理
    const thinkingMatch = md.match(/\n*---\s*\n\*\*思考过程\*\*\s*\n([\s\S]*?)$/);
    let mainContent = md;
    let thinkingHTML = '';
    if (thinkingMatch) {
      mainContent = md.substring(0, thinkingMatch.index);
      thinkingHTML = '\n<div class="thinking-section"><h5>思考过程</h5><div class="thinking-content">' + 
                     marked.parse(thinkingMatch[1].trim()) + '</div></div>';
    }
    return marked.parse(mainContent) + thinkingHTML;
  } catch (e) {
    console.warn('marked 渲染失败，回退到简单渲染', e);
    // 简单回退逻辑
    return md.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }
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