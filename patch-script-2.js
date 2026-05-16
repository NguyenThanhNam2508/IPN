const fs = require('fs');
let code = fs.readFileSync('public/script.js', 'utf8');

// 1. Remove localStorage functions
code = code.replace(
`    // ============================
    // LOCAL STORAGE ENCRYPTION HELPERS
    // ============================
    function encryptLocal(dataObj) {
        try {
            const jsonStr = JSON.stringify(dataObj);
            const b64 = btoa(encodeURIComponent(jsonStr));
            return b64.split('').reverse().map(c => String.fromCharCode(c.charCodeAt(0) + 1)).join('');
        } catch(e) { return ''; }
    }

    function decryptLocal(encryptedStr) {
        try {
            const reversedB64 = encryptedStr.split('').map(c => String.fromCharCode(c.charCodeAt(0) - 1)).reverse().join('');
            return JSON.parse(decodeURIComponent(atob(reversedB64)));
        } catch(e) { return null; }
    }

    function saveKeysToLocal(keys) {
        const encrypted = encryptLocal(keys);
        if (encrypted) {
            localStorage.setItem('ipn_secretKeys_' + clientId, encrypted);
        }
    }

    function loadKeysFromLocal() {
        const encrypted = localStorage.getItem('ipn_secretKeys_' + clientId);
        if (encrypted) {
            return decryptLocal(encrypted);
        }
        return null;
    }

    async function loadKeys() {
        let serverKeys = [];
        let isDefaultServer = false;

        try {
            const res = await fetch('/api/config-keys?clientId=' + clientId);
            const data = await res.json();
            if (data.keys && data.keys.length > 0) {
                serverKeys = data.keys;
                if (serverKeys.length === 1 && serverKeys[0].id === 'default') {
                    isDefaultServer = true;
                }
            } else {
                isDefaultServer = true;
            }
        } catch(e) {
            isDefaultServer = true;
        }

        const localKeys = loadKeysFromLocal();

        // Nếu server bị reset (chỉ có default) và dưới local có key -> ưu tiên local
        if (isDefaultServer && localKeys && localKeys.length > 0) {
            keysArray = localKeys;
            // Đồng bộ lại local lên server ngay
            try {
                await fetch('/api/config-keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keys: keysArray, clientId })
                });
            } catch(e) {}
        } else if (serverKeys.length > 0 && !isDefaultServer) {
            // Server có cấu hình chuẩn -> Lấy server, đè xuống local
            keysArray = serverKeys;
            saveKeysToLocal(keysArray);
        } else if (localKeys && localKeys.length > 0) {
            keysArray = localKeys;
        } else {
            keysArray = [{ id: 'k1', name: 'Mặc định', value: 'VOTRE_SECRET_KEY_32_BYTES_LONG_!', color: '#10b981' }];
        }
        
        renderKeys();
    }`,
`    // ============================
    // LOAD KEYS FROM DB
    // ============================
    function saveKeysToLocal(keys) {
        // Obsolete
    }

    async function loadKeys(notify = true) {
        try {
            const res = await fetch('/api/config-keys?clientId=' + clientId);
            const data = await res.json();
            keysArray = data.keys || [];
            if (keysArray.length === 0) {
                keysArray = [{ id: 'k1', name: 'Mặc định', value: 'VOTRE_SECRET_KEY_32_BYTES_LONG_!', color: '#10b981' }];
            }
            renderKeys();
            if (notify) console.log("Loaded keys from DB.");
        } catch(e) {
            console.error("Lỗi load keys:", e);
        }
    }`
);

// 2. Remove saveKeysToLocal(keysArray); from multiple places
code = code.replace(/saveKeysToLocal\(keysArray\);/g, '');

// 3. Remove localStorage.setItem('ipn_rawPackets', ...) in addRawPacket
code = code.replace(
`        if (!isRestore) {
            let savedRawPackets = JSON.parse(localStorage.getItem('ipn_rawPackets') || '[]');
            savedRawPackets.unshift({ bodyObj, source, matchedName, matchedColor, matchedId, time });
            if (savedRawPackets.length > 50) savedRawPackets.length = 50;
            localStorage.setItem('ipn_rawPackets', JSON.stringify(savedRawPackets));
        }`,
`        // No longer saving to localStorage. Handled by Server DB.`
);

// 4. Update restoreLocalStorageData to loadIPNs from DB
code = code.replace(
`    // ============================
    // RESTORE LOCAL STORAGE DATA
    // ============================
    function restoreLocalStorageData() {
        try {
            const srRaw = JSON.parse(localStorage.getItem('ipn_rawPackets') || '[]');
            for (let i = srRaw.length - 1; i >= 0; i--) {
                const p = srRaw[i];
                addRawPacket(p.bodyObj, p.source, p.matchedName, p.matchedColor, p.matchedId, p.time, true);
            }
        } catch(e) {
            console.error('Lỗi khi khôi phục dữ liệu từ localStorage', e);
        }
    }
    
    restoreLocalStorageData();`,
`    // ============================
    // LOAD IPNS FROM DB
    // ============================
    async function loadIPNs() {
        try {
            const res = await fetch('/api/ipns?clientId=' + clientId);
            const data = await res.json();
            if (data.ipns) {
                for (let i = data.ipns.length - 1; i >= 0; i--) {
                    const p = data.ipns[i];
                    const timeObj = new Date(p.created_at);
                    const timeStr = timeObj.toLocaleTimeString('vi-VN');
                    addRawPacket(p.body_obj, p.source, p.matched_name, p.matched_color, p.matched_id, timeStr, true);
                }
            }
        } catch(e) {
            console.error('Lỗi khi tải lịch sử IPN từ DB', e);
        }
    }
    
    loadIPNs();`
);

// 5. In btnClearRaw.addEventListener
code = code.replace(
`            localStorage.removeItem('ipn_rawPackets');`,
`            // localStorage.removeItem('ipn_rawPackets');`
);

// 6. In handleIncomingEvent, listen for keys_updated
code = code.replace(
`        // Xử lý gói tin Webhook thô — đây là event quan trọng nhất
        if (payload.type === 'raw_ipn' && payload.rawBody) {`,
`        if (payload.type === 'keys_updated') {
            loadKeys(false); // tự động reload cấu hình Key mới
            showToast(payload.message, 'info');
            return;
        }

        // Xử lý gói tin Webhook thô — đây là event quan trọng nhất
        if (payload.type === 'raw_ipn' && payload.rawBody) {`
);

// 7. reevaluateAllPackets modification to fetch from API and do nothing, or just show a message
code = code.replace(
`    async function reevaluateAllPackets() {
        showToast('Đang phân tích lại các gói tin cũ với cấu hình Key mới...', 'info');
        let savedRawPackets = JSON.parse(localStorage.getItem('ipn_rawPackets') || '[]');
        if (savedRawPackets.length === 0) return;

        try {
            const res = await fetch('/api/reevaluate-packets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packets: savedRawPackets.map(p => p.bodyObj), clientId })
            });
            const data = await res.json();
            if (data.results) {
                // Update \`savedRawPackets\`
                data.results.forEach((r, i) => {
                    savedRawPackets[i].matchedName = r.matchedName;
                    savedRawPackets[i].matchedColor = r.matchedColor;
                    savedRawPackets[i].matchedId = r.matchedId;
                });
                localStorage.setItem('ipn_rawPackets', JSON.stringify(savedRawPackets));
                
                // Clear UI
                rawFeed.innerHTML = '';
                rawPacketTotal = 0;
                if (packetCount) packetCount.textContent = '0 gói';
                unreadCounts = {}; // Reset unread counts
                const emptyEl = rawFeed.querySelector('.empty-state');
                if (emptyEl) emptyEl.remove();
                
                // Rebuild UI
                for (let i = savedRawPackets.length - 1; i >= 0; i--) {
                    const p = savedRawPackets[i];
                    addRawPacket(p.bodyObj, p.source, p.matchedName, p.matchedColor, p.matchedId, p.time, true);
                }
                
                // Keep the current active tab if it still exists
                renderTabs();
                showToast('Đã phân tích lại toàn bộ lịch sử IPN!', 'success');
            }
        } catch(e) {
            console.error(e);
        }
    }`,
`    async function reevaluateAllPackets() {
        // Tạm thời vô hiệu hóa chức năng reevaluate lịch sử trên DB vì yêu cầu query phức tạp
        // Các IPN mới sẽ sử dụng list keys mới.
        console.log("Reevaluate disabled for DB implementation.");
    }`
);

fs.writeFileSync('public/script.js', code, 'utf8');
console.log("Patched script.js");
