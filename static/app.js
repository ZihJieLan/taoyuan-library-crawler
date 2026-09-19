// 狀態管理
let booksData = [];
let resultsData = [];
let currentTab = 'TARGET_AVAILABLE'; // 預設優先查看「在館可借」
let eventSource = null;

// DOM 元素
const bookListInput = document.getElementById('bookListInput');
const bookCountBadge = document.getElementById('bookCountBadge');
const targetBranchSelect = document.getElementById('targetBranch');
const systemStatusPill = document.getElementById('systemStatusPill');
const statusText = document.getElementById('statusText');

const btnStartCrawl = document.getElementById('btnStartCrawl');
const btnStopCrawl = document.getElementById('btnStopCrawl');
const btnReloadDefault = document.getElementById('btnReloadDefault');
const btnClearList = document.getElementById('btnClearList');
const btnCopyAvailable = document.getElementById('btnCopyAvailable');

const progressBarFill = document.getElementById('progressBarFill');
const percentLabel = document.getElementById('percentLabel');
const currentBookLabel = document.getElementById('currentBookLabel');
const logTerminal = document.getElementById('logTerminal');

const countAvailable = document.getElementById('countAvailable');
const countBorrowed = document.getElementById('countBorrowed');
const countOther = document.getElementById('countOther');
const countNotFound = document.getElementById('countNotFound');

const tabCountAll = document.getElementById('tabCountAll');
const tabCountAvailable = document.getElementById('tabCountAvailable');
const tabCountBorrowed = document.getElementById('tabCountBorrowed');
const tabCountOther = document.getElementById('tabCountOther');
const tabCountNotFound = document.getElementById('tabCountNotFound');

const tableBody = document.getElementById('tableBody');
const tableFilterInput = document.getElementById('tableFilterInput');
const toast = document.getElementById('toast');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadDefaultBooks();
    setupEventListeners();
    initEventSource();
});

function showToast(message) {
    toast.innerText = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2800);
}

function updateBookCount() {
    const lines = bookListInput.value
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);
    bookCountBadge.innerText = `${lines.length} 本`;
}

async function loadDefaultBooks() {
    try {
        const res = await fetch('/api/default_books');
        const data = await res.json();
        if (data.books && data.books.length > 0) {
            bookListInput.value = data.books.join('\n');
            updateBookCount();
            appendLog('已成功載入預設 61 本閱讀清單。', 'info');
        }
    } catch (e) {
        console.error('Failed to load default books', e);
    }
}

function appendLog(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    entry.innerText = `[${timeStr}] ${message}`;
    logTerminal.appendChild(entry);
    logTerminal.scrollTop = logTerminal.scrollHeight;
}

function setupEventListeners() {
    bookListInput.addEventListener('input', updateBookCount);

    btnReloadDefault.addEventListener('click', () => {
        loadDefaultBooks();
        showToast('已重載預設書單');
    });

    btnClearList.addEventListener('click', () => {
        bookListInput.value = '';
        updateBookCount();
        showToast('已清空書單');
    });

    btnStartCrawl.addEventListener('click', startCrawl);
    btnStopCrawl.addEventListener('click', stopCrawl);

    // 分頁切換 (黃框處)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.getAttribute('data-tab');
            renderTable();
        });
    });

    // 緊湊型統計長條點擊切換分頁
    document.querySelectorAll('.stat-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const filter = pill.getAttribute('data-filter');
            const targetTabBtn = document.querySelector(`.tab-btn[data-tab="${filter}"]`);
            if (targetTabBtn) {
                targetTabBtn.click();
            }
        });
    });

    // 表格內部搜尋過濾
    tableFilterInput.addEventListener('input', () => {
        renderTable();
    });

    // 複製在館書單
    btnCopyAvailable.addEventListener('click', copyAvailableBooks);
}

function initEventSource() {
    if (eventSource) {
        eventSource.close();
    }

    eventSource = new EventSource('/api/stream_progress');

    eventSource.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            handleCrawlerEvent(data);
        } catch (err) {
            console.error('SSE JSON error', err);
        }
    };

    eventSource.onerror = () => {
        // 自動重連
    };
}

function handleCrawlerEvent(data) {
    switch (data.type) {
        case 'init':
            if (data.is_running) {
                setRunningState(true);
            }
            if (data.results && data.results.length > 0) {
                resultsData = data.results;
                updateStats();
                renderTable();
            }
            break;

        case 'started':
            setRunningState(true);
            resultsData = [];
            updateStats();
            renderTable();
            progressBarFill.style.width = '0%';
            percentLabel.innerText = '0%';
            currentBookLabel.innerText = '正在初始化圖書館連線...';
            appendLog(data.message, 'system');
            break;

        case 'searching':
            progressBarFill.style.width = `${data.percent}%`;
            percentLabel.innerText = `${data.percent}%`;
            currentBookLabel.innerText = `[${data.index}/${data.total}] ${data.title}`;
            appendLog(data.message, 'info');
            break;

        case 'inspecting_holdings':
            progressBarFill.style.width = `${data.percent}%`;
            percentLabel.innerText = `${data.percent}%`;
            currentBookLabel.innerText = `檢查館藏：${data.found_title}`;
            appendLog(data.message, 'info');
            break;

        case 'book_completed':
            progressBarFill.style.width = `${data.percent}%`;
            percentLabel.innerText = `${data.percent}%`;
            resultsData.push(data.book_result);
            updateStats();
            renderTable();

            const c = data.book_result.classification;
            const logType = c === 'TARGET_AVAILABLE' ? 'success' : (c === 'TARGET_BORROWED' ? 'warning' : 'info');
            appendLog(data.message, logType);
            break;

        case 'finished':
            setRunningState(false);
            progressBarFill.style.width = '100%';
            percentLabel.innerText = '100%';
            currentBookLabel.innerText = '檢索完成';
            appendLog(data.message, 'success');
            showToast('🎉 全部書目檢索完成！');

            // 如果預設的「在館可借」為 0 筆，但其他分頁有結果，自動切換至有結果的分頁
            const availCount = resultsData.filter(r => r.classification === 'TARGET_AVAILABLE').length;
            const otherCount = resultsData.filter(r => r.classification === 'OTHER_BRANCHES').length;
            const borrowedCount = resultsData.filter(r => r.classification === 'TARGET_BORROWED').length;

            if (currentTab === 'TARGET_AVAILABLE' && availCount === 0) {
                if (otherCount > 0) {
                    const tabBtn = document.querySelector('.tab-btn[data-tab="OTHER_BRANCHES"]');
                    if (tabBtn) tabBtn.click();
                } else if (borrowedCount > 0) {
                    const tabBtn = document.querySelector('.tab-btn[data-tab="TARGET_BORROWED"]');
                    if (tabBtn) tabBtn.click();
                } else if (resultsData.length > 0) {
                    const tabBtn = document.querySelector('.tab-btn[data-tab="ALL"]');
                    if (tabBtn) tabBtn.click();
                }
            }
            break;

        case 'stopped':
            setRunningState(false);
            currentBookLabel.innerText = '檢索已手動中止';
            appendLog(data.message, 'warning');
            showToast('已終止檢索');
            break;

        case 'error':
            setRunningState(false);
            appendLog(data.message, 'error');
            showToast(data.message);
            break;
    }
}

function setRunningState(running) {
    if (running) {
        btnStartCrawl.disabled = true;
        btnStopCrawl.disabled = false;
        systemStatusPill.classList.add('running');
        statusText.innerText = '自動檢索中...';
    } else {
        btnStartCrawl.disabled = false;
        btnStopCrawl.disabled = true;
        systemStatusPill.classList.remove('running');
        statusText.innerText = '系統待命中';
    }
}

async function startCrawl() {
    const books = bookListInput.value
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    if (books.length === 0) {
        showToast('請先輸入至少一本書名');
        return;
    }

    const targetBranch = targetBranchSelect.value;

    try {
        const res = await fetch('/api/start_crawl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ books, target_branch: targetBranch })
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message);
        }
    } catch (e) {
        showToast('發送檢索請求失敗');
    }
}

async function stopCrawl() {
    try {
        await fetch('/api/stop_crawl', { method: 'POST' });
    } catch (e) {
        console.error('Stop crawl failed', e);
    }
}

function updateStats() {
    const avail = resultsData.filter(r => r.classification === 'TARGET_AVAILABLE').length;
    const borrowed = resultsData.filter(r => r.classification === 'TARGET_BORROWED').length;
    const other = resultsData.filter(r => r.classification === 'OTHER_BRANCHES').length;
    const notfound = resultsData.filter(r => r.classification === 'NOT_FOUND').length;

    countAvailable.innerText = avail;
    countBorrowed.innerText = borrowed;
    countOther.innerText = other;
    countNotFound.innerText = notfound;

    tabCountAll.innerText = resultsData.length;
    tabCountAvailable.innerText = avail;
    tabCountBorrowed.innerText = borrowed;
    tabCountOther.innerText = other;
    tabCountNotFound.innerText = notfound;
}

function renderTable() {
    const keyword = tableFilterInput.value.trim().toLowerCase();

    // 依分頁過濾
    let filtered = resultsData;
    if (currentTab !== 'ALL') {
        filtered = filtered.filter(r => r.classification === currentTab);
    }

    // 依關鍵字搜尋
    if (keyword) {
        filtered = filtered.filter(r => {
            const raw = (r.raw_title || '').toLowerCase();
            const found = (r.found_title || '').toLowerCase();
            const summary = (r.summary || '').toLowerCase();
            const callNums = (r.target_holdings || []).map(h => (h.call_number || '').toLowerCase()).join(' ');
            return raw.includes(keyword) || found.includes(keyword) || summary.includes(keyword) || callNums.includes(keyword);
        });
    }

    if (filtered.length === 0) {
        let msg = '尚未開始檢索';
        let actionButtons = '';
        if (resultsData.length > 0) {
            const avail = resultsData.filter(r => r.classification === 'TARGET_AVAILABLE').length;
            const other = resultsData.filter(r => r.classification === 'OTHER_BRANCHES').length;
            const borrowed = resultsData.filter(r => r.classification === 'TARGET_BORROWED').length;

            if (currentTab === 'TARGET_AVAILABLE') {
                msg = `目前目標分館無「在館可借」之書目。`;
                if (other > 0 || borrowed > 0) {
                    msg += `（但在其他分館或外借狀態中找到 ${other + borrowed} 本相關藏書）`;
                    actionButtons = `
                        <div style="margin-top: 14px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                            ${other > 0 ? `<button type="button" class="btn-tool" style="padding: 6px 12px; font-size: 0.85rem;" onclick="document.querySelector('.tab-btn[data-tab=\\'OTHER_BRANCHES\\']').click()">📍 查看他館有書 (${other} 本)</button>` : ''}
                            ${borrowed > 0 ? `<button type="button" class="btn-tool" style="padding: 6px 12px; font-size: 0.85rem;" onclick="document.querySelector('.tab-btn[data-tab=\\'TARGET_BORROWED\\']').click()">⏳ 查看已外借 (${borrowed} 本)</button>` : ''}
                            <button type="button" class="btn-tool" style="padding: 6px 12px; font-size: 0.85rem;" onclick="document.querySelector('.tab-btn[data-tab=\\'ALL\\']').click()">全部書目 (${resultsData.length} 本)</button>
                        </div>
                    `;
                }
            } else {
                msg = '查無符合目前篩選條件的書目';
            }
        }
        tableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">
                    <div class="empty-placeholder">
                        <div class="empty-icon">🔍</div>
                        <p>${msg}</p>
                        ${actionButtons}
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    let rowsHtml = '';
    filtered.forEach((r, idx) => {
        const isAvailable = r.classification === 'TARGET_AVAILABLE';
        const isBorrowed = r.classification === 'TARGET_BORROWED';
        const isOther = r.classification === 'OTHER_BRANCHES';
        const isNotFound = r.classification === 'NOT_FOUND';

        let badgeHtml = '';
        if (isAvailable) {
            badgeHtml = `<span class="badge badge-available">🌟 在館可借</span>`;
        } else if (isBorrowed) {
            badgeHtml = `<span class="badge badge-borrowed">⏳ 外借中</span>`;
        } else if (isOther) {
            badgeHtml = `<span class="badge badge-other">📍 他館有書</span>`;
        } else {
            badgeHtml = `<span class="badge badge-notfound">❓ 查無此書</span>`;
        }

        const holdings = r.target_holdings || [];
        const callNumbers = holdings.map(h => `<div class="call-number">${h.call_number}</div>`).join('') || '-';
        const locations = holdings.map(h => `<div>${h.location}</div>`).join('') || '-';
        const statuses = holdings.map(h => `<div>${h.status}</div>`).join('') || r.summary;
        const barcodes = holdings.map(h => `<div class="barcode">${h.barcode}</div>`).join('') || '-';

        const linkHtml = r.detail_url 
            ? `<a href="${r.detail_url}" target="_blank" class="btn-link">檢視 ↗</a>` 
            : '-';

        rowsHtml += `
            <tr class="${isAvailable ? 'available-row' : ''}">
                <td><strong>${r.index || (idx + 1)}</strong></td>
                <td>
                    <div class="book-title-cell">
                        <div class="raw-title">${escapeHtml(r.raw_title)}</div>
                        ${r.found_title && r.found_title !== r.raw_title ? `<div class="found-title">圖書館：${escapeHtml(r.found_title)}</div>` : ''}
                    </div>
                </td>
                <td>${badgeHtml}</td>
                <td>${callNumbers}</td>
                <td>${locations}</td>
                <td>${statuses}</td>
                <td>${barcodes}</td>
                <td>${linkHtml}</td>
            </tr>
        `;
    });

    tableBody.innerHTML = rowsHtml;
}

function copyAvailableBooks() {
    const availableBooks = resultsData.filter(r => r.classification === 'TARGET_AVAILABLE');
    if (availableBooks.length === 0) {
        showToast('目前尚無在館可借的書目可複製');
        return;
    }

    const branch = targetBranchSelect.value || '中壢分館';
    let text = `【桃園市立圖書館 - ${branch} 在館可借書單】\n整理時間：${new Date().toLocaleString('zh-TW')}\n共 ${availableBooks.length} 本：\n\n`;

    availableBooks.forEach((b, i) => {
        const holdings = b.target_holdings || [];
        const callNum = holdings.map(h => h.call_number).filter(Boolean).join('、') || '無索書號';
        const loc = holdings.map(h => h.location).filter(Boolean).join('、') || branch;
        text += `${i + 1}. 《${b.raw_title}》\n   索書號：${callNum}\n   位置：${loc}\n   連結：${b.detail_url}\n\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        showToast(`已複製 ${availableBooks.length} 本在館書單到剪貼簿！`);
    }).catch(() => {
        showToast('複製失敗，請手動複製');
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
