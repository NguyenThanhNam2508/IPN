document.addEventListener('DOMContentLoaded', () => {

    // ============================
    // ELEMENTS
    // ============================
    const keyListContainer = document.getElementById('keyListContainer');
    const btnAddKey      = document.getElementById('btnAddKey');
    const btnSaveKeys    = document.getElementById('btnSaveKeys');
    const iptSimKeySelect = document.getElementById('iptSimKeySelect');
    const feedTabsContainer = document.getElementById('feedTabs');
    const rawFeed       = document.getElementById('rawFeed');
    const rawEmptyState = document.getElementById('rawEmptyState');
    const decryptContent = document.getElementById('decryptContent');
    const decryptEmptyState = document.getElementById('decryptEmptyState');
    const packetCount   = document.getElementById('packetCount');
    const decryptCount  = document.getElementById('decryptCount');
    const btnClearRaw   = document.getElementById('btnClearRaw');
    const btnClearDecrypt = document.getElementById('btnClearDecrypt');
    const btnParseRaw   = document.getElementById('btnParseRaw');
    const rawJsonInput  = document.getElementById('rawJsonInput');
    const btnShoot      = document.getElementById('btnShoot');
    const simToggle     = document.getElementById('simToggle');
    const simBody       = document.getElementById('simBody');
    const simChevron    = document.getElementById('simChevron');

    const iptUniqueUrl  = document.getElementById('iptUniqueUrl');
    const btnCopyUrl    = document.getElementById('btnCopyUrl');

    // --- Session ID Initialization ---
    // Extract ID from hash or generate a new one
    let clientId = window.location.hash.substring(1);
    if (!clientId) {
        if (window.crypto && window.crypto.randomUUID) {
            clientId = window.crypto.randomUUID();
        } else {
            clientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        window.location.hash = clientId;
    }

    // Set Webhook URL to Display
    const uniqueUrl = `${window.location.origin}/webhook/ipn/${clientId}`;
    if (iptUniqueUrl) iptUniqueUrl.value = uniqueUrl;

    if (btnCopyUrl) {
        btnCopyUrl.addEventListener('click', () => {
            navigator.clipboard.writeText(uniqueUrl).then(() => {
                const orig = btnCopyUrl.innerHTML;
                btnCopyUrl.innerHTML = 'Đã Copy!';
                setTimeout(() => { btnCopyUrl.innerHTML = orig; }, 2000);
                showToast('Đã sao chép link Webhook URL!', 'success');
            }).catch(err => {
                showToast('Lỗi khi copy: ' + err.message, 'error');
            });
        });
    }

    // Telegram elements
    const tgToggle      = document.getElementById('tgToggle');
    const tgBody        = document.getElementById('tgBody');
    const tgChevron     = document.getElementById('tgChevron');
    const tgStatusBadge = document.getElementById('tgStatusBadge');
    const iptTgToken    = document.getElementById('iptTgToken');
    const iptTgChatId   = document.getElementById('iptTgChatId');
    const tgAutoSend    = document.getElementById('tgAutoSend');
    const btnTgTest     = document.getElementById('btnTgTest');
    const btnTgSave     = document.getElementById('btnTgSave');

    let rawPacketTotal = 0;
    let decryptTotal = 0;
    let tgIsAutoSend = false; // track trạng thái auto-send để tránh gửi 2 lần
    let isReplayingQueue = false; // Flag: đang replay queue → bắt đầu toạst spam
    let replayCount = 0;

    // ============================
    // TOAST NOTIFICATIONS
    // ============================
    function showToast(msg, type = 'info', duration = 3500) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('out');
            setTimeout(() => toast.remove(), 350);
        }, duration);
    }

    // ============================
    // SECRET KEY CONFIG & TABS
    // ============================
    let keysArray = [];
    let currentActiveTab = null;
    let unreadCounts = {};

    function switchTab(tabId) {
        currentActiveTab = tabId;
        unreadCounts[tabId] = 0;
        
        if (feedTabsContainer) {
            feedTabsContainer.querySelectorAll('.feed-tab').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tabId === tabId);
                if (btn.dataset.tabId === tabId) {
                    const badge = btn.querySelector('.badge-unread');
                    if (badge) badge.style.display = 'none';
                }
            });
        }

        const allCards = rawFeed.querySelectorAll('.raw-packet');
        allCards.forEach(card => {
            if (card.dataset.tabId === tabId) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    }

    function renderTabs() {
        if (!feedTabsContainer) return;
        
        const tabList = [...keysArray];
        if (!tabList.find(k => k.id === 'unmatched')) {
            tabList.push({ id: 'unmatched', name: 'Giải mã thất bại' });
        }

        tabList.forEach(t => {
            if (unreadCounts[t.id] === undefined) unreadCounts[t.id] = 0;
        });

        if (!tabList.find(k => k.id === currentActiveTab)) {
            currentActiveTab = tabList[0].id;
        }

        feedTabsContainer.innerHTML = '';
        tabList.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'feed-tab';
            if (currentActiveTab === t.id) btn.classList.add('active');
            btn.dataset.tabId = t.id;
            
            const badgeStyle = unreadCounts[t.id] > 0 ? '' : 'display:none;';
            btn.innerHTML = `${escapeHtml(t.name)} <span class="badge-unread" style="${badgeStyle}">${unreadCounts[t.id]}</span>`;
            
            btn.addEventListener('click', () => switchTab(t.id));
            feedTabsContainer.appendChild(btn);
        });

        switchTab(currentActiveTab);
    }

    function renderKeys() {
        keyListContainer.innerHTML = '';
        if (keysArray.length === 0) {
            btnAddKey.click();
            return;
        }
        keysArray.forEach((k, index) => {
            const row = document.createElement('div');
            row.className = 'key-row';
            
            const isHex32 = /^[0-9a-fA-F]{32}$/.test(k.value.trim());
            const isHex64 = /^[0-9a-fA-F]{64}$/.test(k.value.trim());
            let hintText = ''; let hintClass = '';
            if (isHex64) { hintText = '✅ 32B (HEX)'; hintClass = 'valid'; }
            else if (isHex32) { hintText = '⚠️ 16B (HEX)'; hintClass = 'invalid'; }
            else {
                const b = new Blob([k.value]).size;
                hintText = `${b === 32 ? '✅' : '❌'} ${b}/32B`;
                hintClass = b === 32 ? 'valid' : 'invalid';
            }

            row.innerHTML = `
                <div class="form-group">
                    <label>Màu / Tên gợi nhớ</label>
                    <div style="display:flex; gap: 0.5rem; align-items: stretch;">
                        <input type="color" data-field="color" value="${k.color || '#10b981'}" style="width:36px; height:36px; border:none; padding:0; border-radius:4px; cursor:pointer; background:transparent;">
                        <input type="text" class="key-input" data-field="name" value="${escapeHtml(k.name)}" placeholder="VD: POS Chi nhánh 1" autocomplete="off" style="flex:1; height:36px; padding: 0.4rem 0.8rem;">
                    </div>
                </div>
                <div class="form-group">
                    <label>Giá trị Secret Key <span class="label-note">(32 chars r 64 hex)</span></label>
                    <div style="display:flex; align-items:center; gap: 0.5rem;">
                        <input type="text" class="key-input" data-field="value" value="${escapeHtml(k.value)}" placeholder="Nhập key..." autocomplete="off" style="flex:1;">
                        <span class="key-hint ${hintClass}" style="min-width: 70px;">${hintText}</span>
                    </div>
                </div>
                <button type="button" class="btn-remove-key" title="Xóa Key này">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            `;

            const inputs = row.querySelectorAll('input');
            const colorInput = document.createElement('input'); // fake for logic
            inputs[0].addEventListener('input', (e) => { keysArray[index].color = e.target.value; });
            inputs[1].addEventListener('input', (e) => { keysArray[index].name = e.target.value; updateSimKeySelect(); });
            inputs[2].addEventListener('input', (e) => { keysArray[index].value = e.target.value; renderKeys(); });
            
            row.querySelector('.btn-remove-key').addEventListener('click', () => {
                keysArray.splice(index, 1);
                renderKeys();
                updateSimKeySelect();
                renderTabs();
            });

            keyListContainer.appendChild(row);
        });
        updateSimKeySelect();
        renderTabs();
    }

    btnAddKey.addEventListener('click', () => {
        keysArray.push({ id: 'k' + Date.now(), name: 'Tên đối tác ' + (keysArray.length + 1), value: '', color: '#10b981' });
        renderKeys();
        renderTabs();
    });

    btnSaveKeys.addEventListener('click', async () => {
        const orig = btnSaveKeys.innerHTML;
        btnSaveKeys.disabled = true;
        btnSaveKeys.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Đang lưu...';

        try {
            const res = await fetch('/api/config-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys: keysArray, clientId })
            });
            const data = await res.json();
            if (!res.ok) showToast('Lỗi: ' + data.error, 'error');
            else showToast('Đã lưu cấu hình danh sách Key thành công!', 'success');
        } catch (err) {
            showToast('Lỗi mạng: ' + err.message, 'error');
        } finally {
            btnSaveKeys.innerHTML = orig;
            btnSaveKeys.disabled = false;
        }
    });

    async function loadKeys() {
        try {
            const res = await fetch('/api/config-keys?clientId=' + clientId);
            const data = await res.json();
            if (data.keys && data.keys.length > 0) {
                keysArray = data.keys;
            } else {
                // Server vừa restart → chưa có keys → dùng default và auto-save ngay
                keysArray = [{ id: 'k1', name: 'Mặc định', value: 'VOTRE_SECRET_KEY_32_BYTES_LONG_!', color: '#10b981' }];
                // Auto-save để server có keys đúng (đồng bộ ID)
                await fetch('/api/config-keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keys: keysArray, clientId })
                }).catch(() => {});
            }
            renderKeys();
        } catch(e) {
            keysArray = [{ id: 'k1', name: 'Mặc định', value: 'VOTRE_SECRET_KEY_32_BYTES_LONG_!', color: '#10b981' }];
            renderKeys();
        }
    }

    function updateSimKeySelect() {
        if (!iptSimKeySelect) return;
        iptSimKeySelect.innerHTML = '';
        if (keysArray.length === 0) {
            iptSimKeySelect.innerHTML = '<option value="">-- Chưa có Key nào --</option>';
            return;
        }
        keysArray.forEach(k => {
            if (!k.name.trim() && !k.value.trim()) return;
            const opt = document.createElement('option');
            opt.value = k.id;
            opt.textContent = `${k.name} ${k.value ? '' : '(Trống)'}`;
            iptSimKeySelect.appendChild(opt);
        });
    }

    loadKeys();

    // ============================
    // SIMULATOR TOGGLE
    // ============================
    if (simToggle) {
        simToggle.addEventListener('click', () => {
            if (simBody) simBody.classList.toggle('collapsed');
            if (simChevron) simChevron.classList.toggle('open');
        });
    }

    // ============================
    // TELEGRAM PANEL
    // ============================
    if (tgToggle) {
        tgToggle.addEventListener('click', () => {
            if (tgBody) tgBody.classList.toggle('collapsed');
            if (tgChevron) tgChevron.classList.toggle('open');
        });
    }

    // Load current Telegram status from server
    fetch('/api/telegram-status?clientId=' + clientId).then(r => r.json()).then(data => {
        if (data.configured) {
            tgIsAutoSend = !!data.autoSend;
            if (tgStatusBadge) { tgStatusBadge.textContent = data.autoSend ? '🟢 Auto-send BậT' : '✅ Đã cấu hình';
            tgStatusBadge.className = 'badge-tg ' + (data.autoSend ? 'auto-on' : 'configured'); }
            if (tgAutoSend) tgAutoSend.checked = data.autoSend;
            if (data.botToken && iptTgToken) iptTgToken.value = data.botToken;
            if (data.chatId && iptTgChatId) iptTgChatId.value = data.chatId;
        }
    }).catch(() => {});

    if (btnTgTest) {
        btnTgTest.addEventListener('click', async () => {
            const token = iptTgToken ? iptTgToken.value.trim() : '';
            const chatId = iptTgChatId ? iptTgChatId.value.trim() : '';
            if (!token || !chatId) { showToast('Nhập Bot Token và Chat ID trước!', 'error'); return; }
            const orig = btnTgTest.innerHTML;
            btnTgTest.disabled = true;
            btnTgTest.innerHTML = '⏳ Đang gửi...';
            try {
                const res = await fetch('/api/test-telegram', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ botToken: token, chatId })
                });
                const data = await res.json();
                if (data.success) showToast('✅ Telegram kết nối thành công! Kiểm tra bot của bạn.', 'success', 4000);
                else showToast('Lỗi: ' + data.error, 'error');
            } catch(e) { showToast('Lỗi mạng: ' + e.message, 'error'); }
            finally { btnTgTest.innerHTML = orig; btnTgTest.disabled = false; }
        });
    }

    if (btnTgSave) {
        btnTgSave.addEventListener('click', async () => {
            const token = iptTgToken ? iptTgToken.value.trim() : '';
            const chatId = iptTgChatId ? iptTgChatId.value.trim() : '';
            if (!token || !chatId) { showToast('Vui lòng nhập Bot Token và Chat ID!', 'error'); return; }
            const orig = btnTgSave.innerHTML;
            btnTgSave.disabled = true;
            btnTgSave.innerHTML = '⏳ Đang lưu...';
            try {
                const res = await fetch('/api/config-telegram', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ botToken: token, chatId, autoSend: tgAutoSend ? tgAutoSend.checked : false, clientId })
                });
                const data = await res.json();
                if (data.success) {
                    tgIsAutoSend = tgAutoSend ? tgAutoSend.checked : false;
                    showToast('🤖 Đã lưu cấu hình Telegram!', 'success');
                    if (tgStatusBadge) {
                        tgStatusBadge.textContent = (tgAutoSend && tgAutoSend.checked) ? '🟢 Auto-send BậT' : '✅ Đã cấu hình';
                        tgStatusBadge.className = 'badge-tg ' + ((tgAutoSend && tgAutoSend.checked) ? 'auto-on' : 'configured');
                    }
                } else showToast('Lỗi: ' + data.error, 'error');
            } catch(e) { showToast('Lỗi mạng: ' + e.message, 'error'); }
            finally { btnTgSave.innerHTML = orig; btnTgSave.disabled = false; }
        });
    }

    if (tgAutoSend) {
        tgAutoSend.addEventListener('change', () => {
            if (tgStatusBadge) tgStatusBadge.textContent = tgAutoSend.checked ? '🟢 Auto-send BậT' : '✅ Đã cấu hình';
        });
    }

    // ============================
    // CLEAR BUTTONS
    // ============================
    if (btnClearRaw) {
        btnClearRaw.addEventListener('click', () => {
            rawFeed.innerHTML = '';
            rawPacketTotal = 0;
            if (packetCount) packetCount.textContent = '0 gói';
            rawFeed.appendChild(createEmptyState('📡', 'Đang chờ dữ liệu từ đối tác...', 'Webhook sẽ tự động hiển thị tại đây'));
        });
    }

    if (btnClearDecrypt) {
        btnClearDecrypt.addEventListener('click', () => {
            if (decryptContent) decryptContent.innerHTML = '';
            decryptTotal = 0;
            if (decryptCount) decryptCount.textContent = '0 field';
            if (decryptContent) decryptContent.appendChild(createEmptyState('🔓', 'Chưa có thông tin nào được giải mã', 'Nhấn nút "Giải Mã" trên từng field ở bên trái'));
        });
    }

    function createEmptyState(icon, title, sub) {
        const div = document.createElement('div');
        div.className = 'empty-state';
        div.innerHTML = `<div class="empty-icon">${icon}</div><p>${title}</p><span>${sub}</span>`;
        return div;
    }

    // ============================
    // PARSE RAW JSON INPUT (manual paste)
    // ============================
    if (btnParseRaw) {
        btnParseRaw.addEventListener('click', () => {
            const raw = rawJsonInput ? rawJsonInput.value.trim() : '';
            if (!raw) { showToast('Vui lòng dán JSON body vào ô!', 'error'); return; }

            let bodyObj;
            try { bodyObj = JSON.parse(raw); }
            catch (e) { showToast('JSON không hợp lệ: ' + e.message, 'error'); return; }

            addRawPacket(bodyObj, 'Dán thủ công');
            if (rawJsonInput) rawJsonInput.value = '';
            showToast('Đã phân tích JSON thành công!', 'success');
        });
    }

    // ============================
    // ADD RAW PACKET CARD
    // ============================
    function addRawPacket(bodyObj, source = 'Webhook', matchedName = '', matchedColor = '#10b981', matchedId = 'unmatched') {
        if (typeof bodyObj === 'string' || typeof bodyObj !== 'object' || bodyObj === null) {
            bodyObj = { data: String(bodyObj) };
        }

        // Remove empty state
        const emptyEl = rawFeed.querySelector('.empty-state');
        if (emptyEl) emptyEl.remove();

        rawPacketTotal++;
        packetCount.textContent = rawPacketTotal + ' gói';

        const card = document.createElement('div');
        card.className = 'raw-packet';
        card.dataset.tabId = matchedId;
        const time = new Date().toLocaleTimeString();

        const meta = document.createElement('div');
        meta.className = 'packet-meta';
        const displaySource = matchedName ? `Nguồn: ${matchedName}` : source;
        const colorStyle = matchedName && matchedName !== '[Chưa rõ nguồn]' 
            ? `background:${matchedColor}22;border-color:${matchedColor};color:${matchedColor};font-weight:600;font-size:0.8rem;` 
            : '';
        meta.innerHTML = `
            <span class="packet-time">⏱ ${time}</span>
            <span class="packet-badge" style="${colorStyle}">${escapeHtml(displaySource)}</span>
        `;

        const fields = document.createElement('div');
        fields.className = 'packet-fields';

        // Render each field as a row
        renderFieldRows(bodyObj, fields, '');

        card.appendChild(meta);
        card.appendChild(fields);

        rawFeed.prepend(card);

        // Badge Facebook-style: ẩn card nếu không phải tab đang xem
        // Badge số chỉ biến mất khi người dùng bấm vào tab đó
        if (matchedId && matchedId !== currentActiveTab) {
            card.style.display = 'none';
            unreadCounts[matchedId] = (unreadCounts[matchedId] || 0) + 1;

            if (feedTabsContainer) {
                const tabBtn = feedTabsContainer.querySelector(`.feed-tab[data-tab-id="${matchedId}"]`);
                if (tabBtn) {
                    let badge = tabBtn.querySelector('.badge-unread');
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'badge-unread';
                        tabBtn.appendChild(badge);
                    }
                    badge.textContent = unreadCounts[matchedId];
                    badge.style.display = 'inline-flex';
                    // Pulse animation mỗi khi có IPN mới
                    badge.classList.remove('badge-pop');
                    void badge.offsetWidth; // force reflow
                    badge.classList.add('badge-pop');
                }
            }
        } else {
            rawFeed.scrollTo({ top: 0, behavior: 'smooth' });
        }

        const allCards = rawFeed.querySelectorAll(`.raw-packet[data-tab-id="${matchedId}"]`);
        if (allCards.length > 50) {
            for (let i = 50; i < allCards.length; i++) {
                allCards[i].remove();
            }
        }
    }

    // ============================
    // RENDER FIELD ROWS (recursive for nested objects)
    // ============================
    function renderFieldRows(obj, container, prefix) {
        for (const [key, val] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;

            if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                // Nested object — add a group header then recurse
                const groupDiv = document.createElement('div');
                groupDiv.style.cssText = 'margin-top:0.5rem;';
                groupDiv.innerHTML = `<div style="font-size:0.72rem;color:var(--text-dim);padding:0.2rem 0.6rem;font-family:'JetBrains Mono',monospace;">▼ ${fullKey} { }</div>`;
                const nested = document.createElement('div');
                nested.style.cssText = 'margin-left:0.75rem;border-left:1px solid rgba(255,255,255,0.06);padding-left:0.5rem;';
                renderFieldRows(val, nested, fullKey);
                groupDiv.appendChild(nested);
                container.appendChild(groupDiv);
                continue;
            }

            const strVal = val === null ? 'null' : String(val);
            const isEncrypted = isLikelyEncrypted(strVal);
            const valueType = getValueType(val);

            const row = document.createElement('div');
            row.className = 'field-row';

            let valueClass = 'field-value ' + valueType;
            if (isEncrypted) valueClass += ' encrypted';

            row.innerHTML = `
                <span class="field-key">${key}</span>
                <span class="${valueClass}" title="${escapeHtml(strVal)}">
                    ${isEncrypted ? '🔒 ' + strVal.substring(0, 40) + (strVal.length > 40 ? '...' : '') : escapeHtml(strVal.substring(0, 60)) + (strVal.length > 60 ? '...' : '')}
                </span>
                ${isEncrypted ? `<button class="btn-decrypt" data-field="${escapeHtml(fullKey)}" data-value="${escapeHtml(strVal)}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                    </svg>
                    Giải Mã
                </button>` : ''}
            `;

            // Attach decrypt handler
            const btn = row.querySelector('.btn-decrypt');
            if (btn) {
                btn.addEventListener('click', () => handleDecrypt(btn, fullKey, strVal));
            }

            container.appendChild(row);
        }
    }

    // ============================
    // CHECK IF VALUE IS ENCRYPTED
    // ============================
    function isLikelyEncrypted(val) {
        if (typeof val !== 'string') return false;
        const trimmed = val.trim();
        // HEX string (long)
        if (/^[0-9a-fA-F]{32,}$/.test(trimmed) && trimmed.length % 2 === 0) return true;
        // Base64-like (with colon separators for GCM format)
        if (/^[A-Za-z0-9+/=]{20,}(:[A-Za-z0-9+/=]+)*$/.test(trimmed) && trimmed.length > 30) return true;
        return false;
    }

    function getValueType(val) {
        if (val === null) return 'null-val';
        if (typeof val === 'number') return 'number';
        if (typeof val === 'boolean') return 'boolean';
        return 'string';
    }

    // ============================
    // DECRYPT HANDLER
    // ============================
    async function handleDecrypt(btn, fieldKey, encryptedValue) {
        // Clear previous decrypt results before showing new one
        decryptContent.innerHTML = '';
        decryptTotal = 0;
        decryptCount.textContent = '0 field';

        btn.classList.add('loading');
        btn.disabled = true;
        btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 0.8s linear infinite">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Đang giải...
        `;

        try {
            const body = {};
            body[fieldKey] = encryptedValue;

            const res = await fetch('/api/debug-analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payloadStruct: body, clientId })
            });
            const data = await res.json();

            // Find successful decryption
            const analysis = data.analysis && data.analysis[0];
            let successAttempt = null;
            if (analysis) {
                successAttempt = analysis.attempts.find(a => a.result && a.result.includes('SUCCESS'));
            }

            if (successAttempt && successAttempt.data) {
                // Reset all other "decrypted" buttons back to normal first
                document.querySelectorAll('.btn-decrypt.decrypted').forEach(b => {
                    b.classList.remove('decrypted');
                    b.disabled = false;
                    b.innerHTML = `
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                        </svg>
                        Giải Mã
                    `;
                });
                // Mark THIS button as decrypted (but keep it clickable)
                btn.classList.remove('loading');
                btn.classList.add('decrypted');
                btn.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Đã giải ↺
                `;
                btn.disabled = false;
                addDecryptResult(fieldKey, successAttempt);
                showToast(`Giải mã "${fieldKey}" thành công!`, 'success');
            } else {
                // Failed
                btn.classList.remove('loading');
                btn.classList.remove('decrypted');
                btn.disabled = false;
                btn.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                    </svg>
                    Giải Mã
                `;
                addDecryptError(fieldKey, encryptedValue, analysis);
                showToast(`Không giải mã được "${fieldKey}". Kiểm tra Secret Key!`, 'error');
            }
        } catch (err) {
            btn.classList.remove('loading');
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                </svg>
                Giải Mã
            `;
            showToast('Lỗi kết nối: ' + err.message, 'error');
        }
    }

    // ============================
    // ADD DECRYPT RESULT CARD
    // ============================
    function addDecryptResult(fieldKey, attempt) {
        const emptyEl = decryptContent.querySelector('.empty-state');
        if (emptyEl) emptyEl.remove();

        decryptTotal++;
        if (decryptCount) decryptCount.textContent = decryptTotal + ' field';

        const card = document.createElement('div');
        card.className = 'decrypt-card';

        const time = new Date().toLocaleTimeString();

        // Try parse as JSON
        let parsedData = null;
        try { parsedData = JSON.parse(attempt.data); } catch(e) {}

        let bodyHtml = '';
        if (parsedData && typeof parsedData === 'object') {
            const rawJson = JSON.stringify(parsedData, null, 2);
            bodyHtml = `<pre class="decrypt-raw-block">${escapeHtml(rawJson)}</pre>`;
        } else {
            bodyHtml = `<pre class="decrypt-raw-block">${escapeHtml(attempt.data)}</pre>`;
        }

        card.innerHTML = `
            <div class="decrypt-card-header">
                <div class="decrypt-card-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    ${escapeHtml(fieldKey)}
                    <span style="font-size:0.72rem;color:var(--text-dim);font-weight:400;">${attempt.method}</span>
                </div>
                <span class="decrypt-card-time">${time}</span>
            </div>
            <div class="decrypt-card-body">${bodyHtml}</div>
        `;

        // Add "Gửi Telegram" button
        const tgBtn = document.createElement('button');
        tgBtn.className = 'btn-send-tg';

        // Nếu auto-send đang BẬT → IPN đã được tự động gửi, không cần gửi thủ công nữa
        if (tgIsAutoSend) {
            tgBtn.classList.add('sent');
            tgBtn.disabled = true;
            tgBtn.title = 'Auto-send đang BẬT — IPN đã được tự động gửi lên Telegram';
            tgBtn.innerHTML = `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Đã tự gửi ✓
            `;
        } else {
            tgBtn.innerHTML = `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Gửi Telegram
            `;
            tgBtn.addEventListener('click', async () => {
                tgBtn.disabled = true;
                tgBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Đang gửi...`;
                try {
                    const res = await fetch('/api/send-telegram', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fieldKey, data: attempt.data, method: attempt.method, clientId })
                    });
                    const result = await res.json();
                    if (result.success) {
                        tgBtn.classList.add('sent');
                        tgBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Đã gửi ✓`;
                        showToast('📤 Đã gửi IPN lên Telegram!', 'success');
                    } else {
                        tgBtn.disabled = false;
                        tgBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Gửi Telegram`;
                        showToast('Lỗi Telegram: ' + result.error, 'error');
                    }
                } catch(e) {
                    tgBtn.disabled = false;
                    tgBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Gửi Telegram`;
                    showToast('Lỗi mạng: ' + e.message, 'error');
                }
            });
        }
        card.querySelector('.decrypt-card-body').appendChild(tgBtn);

        decryptContent.appendChild(card);
        decryptContent.scrollTo({ top: decryptContent.scrollHeight, behavior: 'smooth' });
    }

    // ============================
    // ADD DECRYPT ERROR CARD
    // ============================
    function addDecryptError(fieldKey, encryptedValue, analysis) {
        const emptyEl = decryptContent.querySelector('.empty-state');
        if (emptyEl) emptyEl.remove();

        const card = document.createElement('div');
        card.className = 'decrypt-card decrypt-error';
        const time = new Date().toLocaleTimeString();

        let failDetails = 'Tất cả phương pháp giải mã đều thất bại.';
        if (analysis && analysis.attempts) {
            failDetails = analysis.attempts.map(a => `• ${a.method}: ${a.result || 'N/A'}`).join('\n');
        }

        card.innerHTML = `
            <div class="decrypt-card-header">
                <div class="decrypt-card-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    ${escapeHtml(fieldKey)} — Giải mã thất bại
                </div>
                <span class="decrypt-card-time">${time}</span>
            </div>
            <div class="decrypt-card-body">
                <pre class="decrypt-raw-block">${escapeHtml(failDetails)}</pre>
            </div>
        `;

        decryptContent.appendChild(card);
        decryptContent.scrollTo({ top: decryptContent.scrollHeight, behavior: 'smooth' });
    }

    // ============================
    // RENDER DATA TABLE FROM OBJECT
    // ============================
    function renderDataTable(obj, prefix = '') {
        let rows = '';
        for (const [k, v] of Object.entries(obj)) {
            const label = prefix ? `${prefix}.${k}` : k;
            if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                rows += `<tr><td class="dk" colspan="2" style="padding-top:0.6rem;color:var(--text-dim);font-family:'JetBrains Mono',monospace;font-size:0.75rem;">▼ ${escapeHtml(label)}</td></tr>`;
                rows += renderDataTable(v, label);
            } else {
                const displayVal = v === null ? '<span style="color:var(--text-dim);font-style:italic;">null</span>'
                    : escapeHtml(String(v));
                let valClass = 'dv';
                if (k === 'status') valClass += v === 'SUCCESS' ? ' success-text' : v === 'FAILED' ? ' error-text' : '';
                rows += `<tr><td class="dk">${escapeHtml(label)}</td><td class="${valClass}">${displayVal}</td></tr>`;
            }
        }
        return rows;
    }

    // ============================
    // SSE + HTTP POLLING: LIVE WEBHOOK FEED
    // Dual strategy: SSE làm primary, HTTP polling làm fallback
    // ============================
    const serverStatus = document.getElementById('serverStatus');
    let eventSource = null;
    let reconnectTimeout = null;
    let lastSeenEventId = null;        // ID của event cuối đã xử lý (dùng cho polling)
    let processedEventIds = new Set(); // Tránh render trùng event
    const MAX_DEDUP_SIZE = 500;

    function updateConnectionStatus(status) {
        if (!serverStatus) return;
        const dot = serverStatus.querySelector('.dot');
        const text = serverStatus.querySelector('span:not(.dot)');
        
        if (status === 'connected') {
            serverStatus.className = 'status-badge pulse';
            text.textContent = 'Trực tuyến (Live)';
        } else if (status === 'connecting') {
            serverStatus.className = 'status-badge connecting';
            text.textContent = 'Đang kết nối...';
        } else {
            serverStatus.className = 'status-badge disconnected';
            text.textContent = 'Mất kết nối (Đang dùng Polling)';
        }
    }

    // Hàm xử lý một event (dùng chung cho cả SSE và Polling)
    function handleIncomingEvent(payload, source = 'SSE') {
        if (!payload || !payload.type) return;

        // Deduplication: bỏ qua nếu đã xử lý event này
        const eventId = String(payload.id || '');
        if (eventId && processedEventIds.has(eventId)) return;
        if (eventId) {
            processedEventIds.add(eventId);
            // Giữ set không quá lớn
            if (processedEventIds.size > MAX_DEDUP_SIZE) {
                const first = processedEventIds.values().next().value;
                processedEventIds.delete(first);
            }
        }

        // Cập nhật lastSeenEventId
        if (eventId) lastSeenEventId = eventId;

        // Phát hiện thông báo replay queue từ server
        if (payload.type === 'success' && payload.message && payload.message.includes('phát lại')) {
            isReplayingQueue = true;
            replayCount = 0;
            showToast(payload.message, 'info', 4000);
            return;
        }

        // Xử lý logs hệ thống — chỉ show toast cho messages quan trọng với người dùng
        // Lọc bỏ: DEBUG nội bộ, HTTP arrival log, heartbeat, key config confirmations
        if (payload.type === 'info' || payload.type === 'success' || payload.type === 'error') {
            const msg = payload.message || '';
            const isInternalNoise = (
                msg.includes('DEBUG') ||
                msg.includes('CÓ HTTP') ||
                msg.includes('Toàn bộ Request') ||
                msg.includes('Phát hiện payload') ||
                msg.includes('Chuyển hướng') ||
                msg.includes('Nhận IPN') ||
                msg.includes('🔑 Đã cập nhật')
            );
            if (!isInternalNoise && !isReplayingQueue) {
                showToast(msg, payload.type);
            }
        }

        // Xử lý gói tin Webhook thô — đây là event quan trọng nhất
        if (payload.type === 'raw_ipn' && payload.rawBody) {
            console.log(`[${source}] Hiển thị Raw IPN lên feed...`, payload);
            if (isReplayingQueue) replayCount++;
            addRawPacket(
                payload.rawBody,
                'Webhook IPN',
                payload.matchedKeyName || '',
                payload.matchedKeyColor || '#10b981',
                payload.matchedKeyId || 'unmatched'
            );

            if (isReplayingQueue) {
                clearTimeout(window._replayEndTimer);
                window._replayEndTimer = setTimeout(() => {
                    if (replayCount > 0) {
                        showToast(`↩ Đã phục hồi ${replayCount} IPN bị miss!`, 'success', 5000);
                    }
                    isReplayingQueue = false;
                    replayCount = 0;
                }, 600);
            }
        }
    }

    function initSSE() {
        if (eventSource) {
            eventSource.close();
        }

        console.log(`[SSE] Cố gắng kết nối với ID: ${clientId}`);
        updateConnectionStatus('connecting');

        eventSource = new EventSource('/api/events?clientId=' + clientId);

        eventSource.onopen = () => {
            console.log('[SSE] Kết nối được thiết lập.');
            updateConnectionStatus('connected');
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
        };

        eventSource.onmessage = function(event) {
            try {
                if (!event.data || event.data === ': heartbeat') return;
                const payload = JSON.parse(event.data);
                console.log(`[SSE] Nhận:`, payload.type, payload.id || '');
                handleIncomingEvent(payload, 'SSE');
            } catch(e) {
                console.warn('[SSE] Lỗi parse:', e, event.data);
            }
        };

        eventSource.onerror = function(err) {
            console.error('[SSE] Lỗi kết nối:', err);
            updateConnectionStatus('disconnected');
            eventSource.close();
            
            if (!reconnectTimeout) {
                reconnectTimeout = setTimeout(() => {
                    reconnectTimeout = null;
                    initSSE();
                }, 3000);
            }
        };
    }

    // ============================
    // HTTP POLLING FALLBACK (mỗi 2.5 giây)
    // Đây là cơ chế dự phòng đảm bảo KHÔNG bao giờ miss IPN
    // ============================
    let pollFailCount = 0;

    async function pollEvents() {
        try {
            const url = `/api/poll-events?clientId=${clientId}${lastSeenEventId ? '&since=' + encodeURIComponent(lastSeenEventId) : ''}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) return;

            const data = await res.json();
            pollFailCount = 0;

            if (data.events && data.events.length > 0) {
                console.log(`[POLL] Nhận ${data.events.length} events mới từ server (SSE clients: ${data.sseClients})`);
                data.events.forEach(evt => handleIncomingEvent(evt, 'POLL'));

                // Cập nhật status nếu đang disconnect nhưng polling hoạt động
                if (serverStatus && serverStatus.classList.contains('disconnected')) {
                    updateConnectionStatus('connected');
                }
            }
        } catch(e) {
            pollFailCount++;
            if (pollFailCount > 5) {
                console.warn('[POLL] Nhiều lần thất bại:', e.message);
            }
        }
    }

    // Khởi tạo SSE connection lần đầu
    initSSE();

    // Bắt đầu polling sau 1 giây (để SSE có cơ hội kết nối trước)
    setTimeout(() => {
        pollEvents(); // Poll ngay lần đầu để lấy events đã bị miss
        setInterval(pollEvents, 2500); // Sau đó poll mỗi 2.5 giây
    }, 1000);

    // ============================
    // SIMULATOR: SHOOT WEBHOOK
    // ============================
    btnShoot.addEventListener('click', async () => {
        const orderId = document.getElementById('iptOrderId').value.trim();
        const amount  = document.getElementById('iptAmount').value.trim();
        const status  = document.getElementById('iptStatus').value;
        const type    = document.getElementById('iptType').value;

        if (!amount) {
            showToast('Vui lòng nhập số tiền!', 'error');
            return;
        }

        const btnText = btnShoot.querySelector('.btn-text');
        const origHtml = btnText.innerHTML;
        btnText.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Đang mã hóa & gửi...`;
        btnShoot.disabled = true;

        try {
            const dataToShoot = {
                requestId: 'f896b57a-4616-4188-b235-' + Math.floor(Math.random() * 9999999),
                orderId: orderId,
                amount: amount + '.0',
                tip: '0',
                paymentType: 'CARD',
                transactionType: type,
                narrative: '',
                fromAccNo: '',
                extraData: {},
                status: status,
                detailTransaction: {
                    txn_id: '0200041011022600' + Math.floor(Math.random() * 9999999),
                    serial_no: '00024500931',
                    customer_id: '00009809',
                    pos_entry_mode: '072',
                    system_trace_no: '000067',
                    card_no: '42210944*7611',
                    card_type: 'VISA',
                    bank_code: 'ACB',
                    fee_percentage: '0.0',
                    invoice_no: '',
                    transaction_type: type.toLowerCase(),
                    amount: amount + '.0',
                    bill_url: 'https://s3.hcm-1.cloud.cmctelecom.vn/receipts/demo_inv',
                    created_unix_time: Math.floor(Date.now() / 1000),
                    response_code: '00'
                }
            };

            const selectedKeyId = document.getElementById('iptSimKeySelect').value;
            const res = await fetch('/api/simulate-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payloadData: dataToShoot, clientId, selectedKeyId })
            });
            const result = await res.json();

            if (result.success && result.payload) {
                showToast('🚀 Đã bắn Webhook! Đang chờ nhận dữ liệu...', 'success');
                // Poll ngay lập tức sau khi bắn để lấy kết quả (không cần chờ interval)
                setTimeout(() => pollEvents(), 300);
                setTimeout(() => pollEvents(), 1200);
            }
        } catch (err) {
            showToast('Lỗi: ' + err.message, 'error');
        } finally {
            btnText.innerHTML = origHtml;
            btnShoot.disabled = false;
        }
    });

    // ============================
    // HELPERS
    // ============================
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // CSS spin animation (injected once)
    if (!document.getElementById('spin-styles')) {
        const s = document.createElement('style');
        s.id = 'spin-styles';
        s.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
        document.head.appendChild(s);
    }

});
