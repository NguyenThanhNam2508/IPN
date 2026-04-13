const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true, type: ['application/x-www-form-urlencoded', 'application/json'] }));
app.use(express.text({ type: '*/*' })); // Dự phòng trường hợp gửi raw string không rõ type

// Phục vụ giao diện UI tĩnh
app.use(express.static(path.join(__dirname, 'public')));

// Bắt lỗi JSON parsing của express.json()
// Python thường gửi {"key": "val"} thành {'key': 'val'} làm hỏng cú pháp JSON.
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        SystemLogToConsole('error', 'Cảnh báo: Đối tác gửi JSON sai định dạng (SyntaxError). Đang cứu hộ dữ liệu thô...', err.body);
        req.body = err.body; // Gắn lại text thô
        return next();
    }
    next();
});

// -------------------------------------------------------------
// SESSIONS: MULTI-TENANT CONFIGURATION MỚI (Hỗ trợ Nhiều Key)
// -------------------------------------------------------------
const DEFAULT_SECRET_KEY = Buffer.from('VOTRE_SECRET_KEY_32_BYTES_LONG_!', 'utf-8');
const sessions = new Map();
const MAX_QUEUE_SIZE = 200; // Số sự kiện tối đa lưu buffer

function getSession(clientId) {
    if (!clientId) return null;
    if (!sessions.has(clientId)) {
        sessions.set(clientId, {
            keys: [{ 
                id: 'default', 
                name: 'Đối tác Mặc định', 
                buffer: DEFAULT_SECRET_KEY, 
                originalStr: 'VOTRE_SECRET_KEY_32_BYTES_LONG_!',
                color: '#10b981'
            }],
            tgToken: '',
            tgChatId: '',
            tgAutoSend: false,
            sseClients: [],
            pollQueue: [],    // Queue cho HTTP Polling (không bị xóa bởi SSE)
            eventQueue: []    // Queue replay khi UI reconnect SSE
        });
    }
    return sessions.get(clientId);
}

// -------------------------------------------------------------
// TELEGRAM BOT HELPER
// -------------------------------------------------------------
async function sendTelegramMessage(session, text) {
    if (!session || !session.tgToken || !session.tgChatId) return { ok: false, error: 'Chưa cấu hình Telegram' };
    try {
        const url = `https://api.telegram.org/bot${session.tgToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: session.tgChatId, text, parse_mode: 'HTML' })
        });
        return await response.json();
    } catch(e) {
        return { ok: false, error: e.message };
    }
}

function formatTelegramMessage(fieldKey, dataStr, method) {
    function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    try {
        const parsed = JSON.parse(dataStr);
        const prettyJson = JSON.stringify(parsed, null, 2);
        return '<pre><code class="language-json">' + escapeHtml(prettyJson) + '</code></pre>';
    } catch(e) {
        return '<pre>' + escapeHtml(dataStr) + '</pre>';
    }
}

// -------------------------------------------------------------
// XỬ LÝ SERVER-SENT EVENTS (SSE) CHO LOG TRỰC TIẾP LÊN UI
// -------------------------------------------------------------
function pushToQueue(session, entry) {
    // Poll queue: luôn lưu để HTTP polling lấy được
    if (!session.pollQueue) session.pollQueue = [];
    session.pollQueue.push(entry);
    if (session.pollQueue.length > MAX_QUEUE_SIZE) session.pollQueue.shift();

    // SSE replay queue: chỉ lưu khi không có SSE client (dùng để replay khi reconnect)
    if (session.sseClients.length === 0) {
        if (!session.eventQueue) session.eventQueue = [];
        session.eventQueue.push(entry);
        if (session.eventQueue.length > MAX_QUEUE_SIZE) session.eventQueue.shift();
    }
}

function broadcastToClients(session, entry) {
    if (!session.sseClients || session.sseClients.length === 0) return;
    const staleClients = [];
    session.sseClients.forEach(client => {
        try {
            client.res.write(`data: ${JSON.stringify(entry)}\n\n`);
        } catch(e) {
            staleClients.push(client);
        }
    });
    if (staleClients.length > 0) {
        session.sseClients = session.sseClients.filter(c => !staleClients.includes(c));
    }
}

function emitLogToUI(clientId, logType, message, data = null, collapsed = false) {
    const session = getSession(clientId);
    if (!session) return;
    
    const count = session.sseClients.length;
    const logEntry = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        time: new Date().toLocaleTimeString(),
        type: logType,
        message,
        data,
        collapsed
    };
    SystemLogToConsole(logType, `${message} (Active UI: ${count})`, data, clientId);

    // LUÔN lưu vào queue (cho HTTP polling và SSE replay)
    pushToQueue(session, logEntry);
    // Và broadcast qua SSE nếu có client
    broadcastToClients(session, logEntry);
}

function emitRawIPN(clientId, rawBody, matchedKeyName = '', matchedKeyColor = '', matchedKeyId = '') {
    const session = getSession(clientId);
    if (!session) return;

    const entry = {
        type: 'raw_ipn',
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        time: new Date().toLocaleTimeString(),
        rawBody,
        matchedKeyName,
        matchedKeyColor,
        matchedKeyId
    };

    // LUÔN lưu vào queue + broadcast
    pushToQueue(session, entry);
    broadcastToClients(session, entry);
}

function SystemLogToConsole(type, msg, data, clientId = '') {
    const prefix = clientId ? `[${clientId.substring(0, 8)}...]` : '[SYSTEM]';
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    
    // Đảm bảo data được log đẹp mắt
    let logData = '';
    if (data !== null && data !== undefined) {
        if (typeof data === 'object') {
            logData = '\n' + JSON.stringify(data, null, 2);
        } else {
            logData = ' ' + data;
        }
    }

    if (type === 'error') console.error(`❌ [${timestamp}] ${prefix} ${msg}${logData}`);
    else if (type === 'success') console.log(`✅ [${timestamp}] ${prefix} ${msg}${logData}`);
    else console.log(`ℹ️ [${timestamp}] ${prefix} ${msg}${logData}`);
}

app.get('/api/events', (req, res) => {
    const clientId = req.query.clientId;
    if (!clientId) return res.status(400).send("Thiếu tham số clientId trong EventSource URL");

    const session = getSession(clientId);

    // Header SSE chuẩn để tránh buffering bởi Proxy
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Dành cho Nginx
    
    // Gửi headers ngay lập tức
    res.flushHeaders();

    const queueSize = (session.eventQueue || []).length;
    const connectMsg = queueSize > 0
        ? `🟢 Đã kết nối! Đang phát lại ${queueSize} sự kiện bị miss...`
        : '🟢 Đã kết nối Hệ thống Lắng nghe Webhook của bạn...';
    
    res.write(`data: ${JSON.stringify({ time: new Date().toLocaleTimeString(), type: 'success', message: connectMsg })}\n\n`);
    
    const client = { res, id: Date.now() };
    session.sseClients.push(client);
    
    SystemLogToConsole('success', `Cửa sổ UI mới đã kết nối. Hiện có ${session.sseClients.length} tab đang nghe. Queue: ${queueSize} sự kiện chờ.`, null, clientId);

    // REPLAY: Gửi lại tất cả sự kiện đã buffer khi UI offline
    if (queueSize > 0) {
        const queued = [...session.eventQueue];
        session.eventQueue = []; // Xóa queue sau khi gửi
        
        // Gửi ngay với delay nhỏ để đảm bảo connection sẵn sàng
        setTimeout(() => {
            queued.forEach(entry => {
                try {
                    res.write(`data: ${JSON.stringify(entry)}\n\n`);
                } catch(e) {
                    // client đã ngắt trong khi replay
                }
            });
            SystemLogToConsole('success', `Đã phát lại ${queued.length} sự kiện vào UI.`, null, clientId);
        }, 150);
    }

    req.on('close', () => {
        session.sseClients = session.sseClients.filter(c => c.id !== client.id);
        SystemLogToConsole('info', `Một cửa sổ UI đã đóng. Còn lại ${session.sseClients.length} tab.`, null, clientId);
    });
});

// HEARTBEAT INTERVAl: Chống timeout cho các proxy như Ngrok/Cloudflare
setInterval(() => {
    sessions.forEach((session, clientId) => {
        if (session.sseClients.length > 0) {
            const stale = [];
            session.sseClients.forEach(client => {
                try {
                    client.res.write(`: heartbeat\n\n`);
                } catch(e) {
                    stale.push(client);
                }
            });
            if (stale.length > 0) {
                session.sseClients = session.sseClients.filter(c => !stale.includes(c));
                SystemLogToConsole('info', `Heartbeat: loại ${stale.length} SSE client chết. Còn lại ${session.sseClients.length}.`, null, clientId);
            }
        }
    });
}, 15000); // 15 giây kiểm tra một lần

// -------------------------------------------------------------
// HTTP POLLING FALLBACK: Cho phép UI lấy events khi SSE không ổn định
// -------------------------------------------------------------
app.get('/api/poll-events', (req, res) => {
    const { clientId, since } = req.query;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });

    const session = getSession(clientId);
    
    // Lấy tất cả events từ pollQueue
    const allEvents = session.pollQueue || [];
    
    // Nếu client cung cấp `since` timestamp, chỉ trả về events mới hơn
    let events = allEvents;
    if (since) {
        const sinceId = String(since);
        const sinceIdx = allEvents.findIndex(e => String(e.id) === sinceId);
        if (sinceIdx !== -1) {
            events = allEvents.slice(sinceIdx + 1);
        }
    }
    
    res.json({ 
        events,
        lastId: allEvents.length > 0 ? allEvents[allEvents.length - 1].id : null,
        sseClients: session.sseClients.length,
        total: allEvents.length
    });
});

// -------------------------------------------------------------
// DEBUG ENDPOINT: Xem trạng thái sessions
// -------------------------------------------------------------
app.get('/api/debug-sessions', (req, res) => {
    const result = {};
    sessions.forEach((session, id) => {
        result[id] = {
            sseClients: session.sseClients.length,
            pollQueueSize: (session.pollQueue || []).length,
            eventQueueSize: (session.eventQueue || []).length,
            keys: (session.keys || []).map(k => k.name),
            lastEvent: session.pollQueue && session.pollQueue.length > 0 
                ? session.pollQueue[session.pollQueue.length - 1]
                : null
        };
    });
    res.json(result);
});

// -------------------------------------------------------------
// APP CẤU HÌNH NHIỀU SECRET KEY CỦA TỪNG PHIÊN
// -------------------------------------------------------------
app.get('/api/config-keys', (req, res) => {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    const session = getSession(clientId);
    const out = (session && session.keys) ? session.keys.map(k => ({ id: k.id, name: k.name, value: k.originalStr, color: k.color })) : [];
    res.json({ keys: out });
});

app.post('/api/config-keys', (req, res) => {
    const { keys, clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    if (!Array.isArray(keys)) return res.status(400).json({ error: 'Dữ liệu keys không hợp lệ' });
    
    const session = getSession(clientId);
    const validKeys = [];

    for (const k of keys) {
        if (!k.value) continue;
        const val = k.value.trim();
        const isHex64 = /^[0-9a-fA-F]{64}$/.test(val);
        let keyBuf;

        if (isHex64) {
            keyBuf = Buffer.from(val, 'hex');
        } else {
            keyBuf = Buffer.from(val, 'utf-8');
        }

        if (keyBuf.length === 32) {
            validKeys.push({
                id: k.id || Math.random().toString(36).substr(2, 9),
                name: k.name || 'Cấu hình không tên',
                color: k.color || '#10b981',
                buffer: keyBuf,
                originalStr: val
            });
        }
    }

    if (validKeys.length === 0 && keys.length > 0) {
        return res.status(400).json({ error: 'Tất cả các Key bạn nhập đều sai định dạng (phải là 32 bytes plain text hoặc 64 bytes HEX).' });
    }

    session.keys = validKeys;
    emitLogToUI(clientId, 'success', `🔑 Đã cập nhật xong danh sách ${validKeys.length} Secret Key!`);
    res.json({ success: true, count: validKeys.length });
});

// -------------------------------------------------------------
// ENDPOINT IPN CHÍNH THỨC (AUTO DECRYPT VỚI NHIỀU KEY & GẮN TAG)
// -------------------------------------------------------------
// Hỗ trợ dự phòng thông minh (Auto-Fallback) cho các đường dẫn lạ
app.use((req, res, next) => {
    if (req.method !== 'POST' && req.method !== 'GET') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhook/ipn')) return next();

    const activeClients = Array.from(sessions.keys()).filter(id => sessions.get(id).sseClients.length > 0);
    if (activeClients.length > 0) {
        const liveClientId = activeClients[0];
        // Bẻ lái mọi đường dẫn Callback/IPN lạ (vd: /callback, /, /ipn)
        if (!req.path.includes('.') && req.path !== '/index.html' && req.path !== '/favicon.ico') {
            SystemLogToConsole('info', `Chuyển hướng ngầm IPN từ path lạ: ${req.path} -> /webhook/ipn/${liveClientId}`);
            req.url = `/webhook/ipn/${liveClientId}`;
        }
    }
    next();
});

// Chấp nhận cả /webhook/ipn (không ID) và /webhook/ipn/:clientId
app.all(['/webhook/ipn', '/webhook/ipn/:clientId'], (req, res) => {
    let clientId = req.params.clientId;
    
    // Nếu không có ID trên URL, tìm Client đang mở Dashboard gần nhất
    if (!clientId) {
        const activeClients = Array.from(sessions.keys()).filter(id => sessions.get(id).sseClients.length > 0);
        clientId = activeClients.length > 0 ? activeClients[0] : null;
    }

    // Tạo session mới nếu cần (để buffer IPN, UI sẽ nhận khi reconnect)
    const session = clientId ? getSession(clientId) : null;
    if (!session) {
        SystemLogToConsole('error', 'Nhận IPN nhưng không tìm thấy ClientID hợp lệ. Vui lòng mở Dashboard trước.');
        return res.status(404).json({ error: 'Client ID không tồn tại. Vui lòng mở Dashboard trước.' });
    }
    
    const activeUICount = session.sseClients.length;
    if (activeUICount === 0) {
        SystemLogToConsole('info', `Nhận IPN cho session ${clientId} nhưng UI đang offline. Sẽ buffer và phát lại khi UI reconnect.`, null, clientId);
    }

    try {
        emitLogToUI(clientId, 'info', `--- CÓ HTTP ${req.method} MỚI TỚI WEBHOOK BẠN ---`);
        
        // Smart Payload Extraction (hỗ trợ nhiều định dạng và cả GET Request)
        let payload = null;
        let dataBaggage = req.method === 'GET' ? req.query : req.body;
        
        if (typeof dataBaggage === 'string') {
            const rawBodyStr = dataBaggage.trim();
            // Dùng Regex moi cái mảng HEX hoặc Base64 dài
            const match = rawBodyStr.match(/[a-fA-F0-9\-]{40,}|[A-Za-z0-9+/=]{40,}/);
            payload = match ? match[0] : rawBodyStr;
            if (payload) SystemLogToConsole('info', 'Phát hiện payload từ raw text body.', payload, clientId);
        } else if (dataBaggage && typeof dataBaggage === 'object') {
            // Ưu tiên các field chuẩn
            payload = dataBaggage.payload || dataBaggage.data || dataBaggage.token || dataBaggage.message || dataBaggage.cipher;
            
            if (!payload) {
                const searchDeep = (obj) => {
                    for (const k of Object.keys(obj)) {
                        // Trường hợp 1: Key chính là HEX dài (thường do lỗi parser form-urlencoded khi thiếu dấu =)
                        if (k.length > 40 && /^[0-9a-fA-F\-]+$/.test(k)) {
                            SystemLogToConsole('info', 'Phát hiện payload nằm ở KEY của Object (do lỗi parser hoặc đối tác gửi thiếu dấu =).', k, clientId);
                            return k.trim();
                        }
                        // Trường hợp 2: Value là HEX/Base64 dài
                        const val = obj[k];
                        if (typeof val === 'string' && val.length > 40) return val.trim();
                        
                        // Trường hợp 3: Đệ quy nếu là object nhỏ
                        if (typeof val === 'object' && val !== null) {
                            const found = searchDeep(val);
                            if (found) return found;
                        }
                    }
                    return null;
                };
                payload = searchDeep(dataBaggage);
            }
        }

        if (!payload) {
            SystemLogToConsole('error', 'Không tìm thấy bất kỳ chuỗi Encrypted Payload nào trong Request.', dataBaggage, clientId);
            emitLogToUI(clientId, 'error', 'Không tìm thấy dữ liệu hợp lệ (HEX/Base64/GCM) trong Request. Dashboard không thể tự giải mã.', dataBaggage);
            emitRawIPN(clientId, dataBaggage, 'Payload Trống/Lỗi');
            return res.status(400).json({ error: 'Missing Payload', receivedData: dataBaggage });
        }

        // Loại bỏ các ký tự rác nếu lỗi encode, ví dụ ' ở đầu
        if (typeof payload === 'string') {
            payload = payload.trim();
            if (payload.startsWith("'") && payload.endsWith("'")) payload = payload.slice(1, -1);
            if (payload.startsWith('"') && payload.endsWith('"')) payload = payload.slice(1, -1);
        }

        emitLogToUI(clientId, 'info', `Toàn bộ Request từ đối tác (Gửi qua ${req.method}):`, dataBaggage, true); 

        let decodedPayload = null;
        let matchedKeyName = '[Chưa rõ nguồn]';
        let matchedKeyColor = '';
        let matchedKeyId = 'unmatched';
        let matchedTgMethod = '';

        // Dò tất cả các Key xem Key nào mở được khóa
        for (const kObj of session.keys) {
            try {
                const keyBuffer = kObj.buffer;
                let decryptedString;
                const payloadParts = payload.split(':');

                if (payloadParts.length === 3) {
                    // Định dạng AES-256-GCM
                    const iv = Buffer.from(payloadParts[0], 'base64');
                    const authTag = Buffer.from(payloadParts[1], 'base64');
                    const encryptedText = Buffer.from(payloadParts[2], 'base64');
                    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
                    decipher.setAuthTag(authTag);
                    decryptedString = decipher.update(encryptedText, undefined, 'utf8');
                    decryptedString += decipher.final('utf8');
                    
                    // Thử parse JSON, nếu không lỗi là thành công
                    JSON.parse(decryptedString);
                    decodedPayload = decryptedString;
                    matchedKeyName = kObj.name;
                    matchedKeyColor = kObj.color || '#10b981';
                    matchedKeyId = kObj.id || 'unmatched';
                    matchedTgMethod = 'AES-256-GCM';
                    break; // Thành công với key này thì ngưng vòng lặp
                } else {
                    // Định dạng AES-256-CBC
                    const hexPayload = payload.trim();
                    const iv = Buffer.from(hexPayload.slice(0, 32), 'hex');
                    const encryptedText = Buffer.from(hexPayload.slice(32), 'hex');
                    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
                    decipher.setAutoPadding(true);
                    decryptedString = decipher.update(encryptedText, undefined, 'utf8');
                    decryptedString += decipher.final('utf8');
                    
                    JSON.parse(decryptedString);
                    decodedPayload = decryptedString;
                    matchedKeyName = kObj.name;
                    matchedKeyColor = kObj.color || '#10b981';
                    matchedKeyId = kObj.id || 'unmatched';
                    matchedTgMethod = 'AES-256-CBC (IV đầu 16B)';
                    break;
                }
            } catch (err) {
                // Key này giải không ra, bỏ qua để thử Key tiếp theo
            }
        }

        if (decodedPayload) {
            // Emits Raw IPN với tag của Nguồn
            emitRawIPN(clientId, req.body, matchedKeyName, matchedKeyColor, matchedKeyId);

            const paymentData = JSON.parse(decodedPayload);
            emitLogToUI(clientId, 'success', `✅ Giải mã tự động thành công (Nguồn: ${matchedKeyName})! Dữ liệu gốc:`, paymentData, true);

            // AUTO-SEND to Telegram 
            if (session.tgAutoSend && session.tgToken && session.tgChatId) {
                const tgMsg = formatTelegramMessage(`IPN từ: ${matchedKeyName}`, decodedPayload, matchedTgMethod);
                sendTelegramMessage(session, tgMsg)
                    .then(r => r.ok
                        ? emitLogToUI(clientId, 'success', '📤 Đã tự động gửi IPN lên Telegram!')
                        : emitLogToUI(clientId, 'error', `Telegram error: ${r.description || r.error}`)
                    )
                    .catch(e => emitLogToUI(clientId, 'error', `Telegram send failed: ${e.message}`));
            }
        } else {
            // Giải mã thất bại
            emitRawIPN(clientId, req.body, 'Giải mã thất bại', '#ef4444', 'unmatched');
            emitLogToUI(clientId, 'error', `❌ Nhận IPN nhưng TẤT CẢ các Secret Key hiện tại đều giải mã thất bại. Vui lòng kiểm tra lại cấu hình Key. Dữ liệu gốc:`, req.body);
            return res.status(200).json({ return_code: 0, message: 'Received but decryption failed with all known keys' });
        }

        return res.status(200).json({
            message: 'Webhook processed successfully',
            return_code: 1
        });

    } catch (error) {
        emitLogToUI(clientId, 'error', `❌ Lỗi System Critical. Detail: ${error.message}`);
        return res.status(200).json({ return_code: 0, message: 'System error' });
    }
});


// -------------------------------------------------------------
// TELEGRAM CONFIG & SEND ENDPOINTS PER SESSION
// -------------------------------------------------------------
app.post('/api/config-telegram', (req, res) => {
    const { botToken, chatId, autoSend, clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    if (!botToken || !chatId) return res.status(400).json({ error: 'Thiếu Bot Token hoặc Chat ID' });
    
    const session = getSession(clientId);
    session.tgToken = botToken.trim();
    session.tgChatId = chatId.trim();
    session.tgAutoSend = !!autoSend;
    emitLogToUI(clientId, 'success', `🤖 Telegram config của bạn đã lưu! Auto-send: ${session.tgAutoSend ? 'BẬT ✅' : 'TẮT ❌'}`);
    res.json({ success: true, autoSend: session.tgAutoSend });
});

app.post('/api/test-telegram', async (req, res) => {
    const { botToken, chatId } = req.body;
    if (!botToken || !chatId) return res.status(400).json({ error: 'Thiếu thông tin' });
    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: `✅ <b>IPN Secure Dashboard</b> đã kết nối thành công!\n\n🤖 Bot Telegram sẵn sàng nhận thông báo IPN giải mã từ Endpoint của bạn.\n🕐 ${new Date().toLocaleString('vi-VN')}`,
                parse_mode: 'HTML'
            })
        });
        const result = await response.json();
        if (result.ok) res.json({ success: true });
        else res.status(400).json({ error: result.description || 'Kết nối thất bại' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/send-telegram', async (req, res) => {
    const { fieldKey, data, method, clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    
    const session = getSession(clientId);
    if (!session || !session.tgToken || !session.tgChatId) {
        return res.status(400).json({ error: 'Chưa cấu hình Telegram. Vui lòng nhập Bot Token và Chat ID.' });
    }
    try {
        const text = formatTelegramMessage(fieldKey || 'data', data, method || 'Manual');
        const result = await sendTelegramMessage(session, text);
        if (result.ok) {
            emitLogToUI(clientId, 'success', `📤 Đã gửi IPN "${fieldKey}" lên Telegram!`);
            res.json({ success: true });
        } else {
            res.status(500).json({ error: result.description || 'Lỗi gửi Telegram' });
        }
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/telegram-status', (req, res) => {
    const clientId = req.query.clientId;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    const session = getSession(clientId);
    if (!session) return res.json({ configured: false });

    res.json({
        configured: !!(session.tgToken && session.tgChatId),
        autoSend: session.tgAutoSend,
        chatId: session.tgChatId,
        botToken: session.tgToken
    });
});

// -------------------------------------------------------------
// ENDPOINT DEBUG: PHÂN TÍCH TOÀN BỘ BODY RAW TỪ WEBHOOK
// -------------------------------------------------------------
app.post('/api/debug-analyze', (req, res) => {
    const { payloadStruct, clientId } = req.body; 
    const raw = payloadStruct;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });

    const session = getSession(clientId);
    const results = { rawBody: raw, analysis: [] };

    for (const [key, val] of Object.entries(raw)) {
        const strVal = typeof val === 'string' ? val.trim() : JSON.stringify(val);
        const entry = { field: key, value: strVal, byteLength: Buffer.byteLength(strVal), attempts: [] };
        
        const isHex = /^[0-9a-fA-F]+$/.test(strVal) && strVal.length % 2 === 0;

        // Vòng lặp test trọn bộ danh sách Secret Keys do user cấu hình
        for (const kObj of session.keys) {
            const keyBuffer = kObj.buffer;
            const prefix = `[Key: ${kObj.name}] `;

            if (isHex) {
                const hexBuf = Buffer.from(strVal, 'hex');
                if (session.keys.indexOf(kObj) === 0) {
                     // Log 1 lần duy nhất preview Decode HEX
                     entry.attempts.push({ method: 'HEX decode info', byteLength: hexBuf.length, preview: hexBuf.toString('utf8', 0, Math.min(50, hexBuf.length)) });
                }

                try {
                    const iv = hexBuf.slice(0, 16);
                    const cipher = hexBuf.slice(16);
                    if (cipher.length > 0) {
                        const d = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
                        d.setAutoPadding(true);
                        let out = d.update(cipher, undefined, 'utf8');
                        out += d.final('utf8');
                        entry.attempts.push({ method: prefix + 'AES-256-CBC (HEX, IV đầu 16B)', result: 'SUCCESS ✅', data: out });
                    }
                } catch(e) { /* ignore fail */ }

                try {
                    const iv = Buffer.alloc(16, 0);
                    const d = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
                    d.setAutoPadding(true);
                    let out = d.update(hexBuf, undefined, 'utf8');
                    out += d.final('utf8');
                    entry.attempts.push({ method: prefix + 'AES-256-CBC (HEX, IV=zeros)', result: 'SUCCESS ✅', data: out });
                } catch(e) { /* ignore fail */ }
            }

            try {
                const b64Buf = Buffer.from(strVal, 'base64');
                if (session.keys.indexOf(kObj) === 0) {
                     // Log 1 lần duy nhất preview Decode Base64
                     entry.attempts.push({ method: 'Base64 decode info', byteLength: b64Buf.length, preview: b64Buf.toString('utf8', 0, Math.min(50, b64Buf.length)) });
                }

                try {
                    const iv = b64Buf.slice(0, 16);
                    const cipher = b64Buf.slice(16);
                    if (cipher.length > 0) {
                        const d = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
                        d.setAutoPadding(true);
                        let out = d.update(cipher, undefined, 'utf8');
                        out += d.final('utf8');
                        entry.attempts.push({ method: prefix + 'AES-256-CBC (Base64, IV đầu 16B)', result: 'SUCCESS ✅', data: out });
                    }
                } catch(e) { /* ignore fail */ }
            } catch(e) {}

            if (strVal.split(':').length === 3) {
                try {
                    const parts = strVal.split(':');
                    const iv = Buffer.from(parts[0], 'base64');
                    const tag = Buffer.from(parts[1], 'base64');
                    const ct  = Buffer.from(parts[2], 'base64');
                    const d = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
                    d.setAuthTag(tag);
                    let out = d.update(ct, undefined, 'utf8');
                    out += d.final('utf8');
                    entry.attempts.push({ method: prefix + 'AES-256-GCM (IV:Tag:Cipher Base64)', result: 'SUCCESS ✅', data: out });
                } catch(e) { /* ignore fail */ }
            }
        }
        
        // Gắn lỗi nễu không attempt nào SUCCESS
        const hasSuccess = entry.attempts.some(a => a.result && a.result.includes('SUCCESS'));
        if (!hasSuccess) {
             entry.attempts.push({ method: 'ALL KEYS', result: `FAIL: Không có Secret Key nào khớp/giải mã được!` });
        }

        results.analysis.push(entry);
    }

    emitLogToUI(clientId, 'info', '🔬 DEBUG: Nhận được yêu cầu phân tích payload từ Web UI', results.rawBody);
    res.json(results);
});


app.post('/api/simulate-payment', async (req, res) => {
    try {
        const { clientId, payloadData, selectedKeyId } = req.body;
        if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });

        const session = getSession(clientId);
        if (!session || !session.keys || session.keys.length === 0) {
            return res.status(400).json({ error: 'Bạn đang không có bất kỳ Secret Key nào để mã hóa giả lập!' });
        }

        let targetKeyObj = session.keys[0];
        if (selectedKeyId) {
            const found = session.keys.find(k => k.id === selectedKeyId);
            if (found) targetKeyObj = found;
        }

        const jsonString = JSON.stringify(payloadData);
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', targetKeyObj.buffer, iv);
        
        let encryptedText = cipher.update(jsonString, 'utf8');
        encryptedText = Buffer.concat([encryptedText, cipher.final()]);
        
        const authTag = cipher.getAuthTag();
        const payloadStr = [
            iv.toString('base64'),
            authTag.toString('base64'),
            encryptedText.toString('base64')
        ].join(':');

        const webhookHost = 'http://127.0.0.1:' + (process.env.PORT || 3000);
        const response = await fetch(`${webhookHost}/webhook/ipn/${clientId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload: payloadStr })
        });
        
        // Trong trường hợp IPN endpoint trả về lỗi hoặc parse lỗi do timeout
        const textResult = await response.text();
        let result = { message: 'Lỗi parse text response' };
        try { result = JSON.parse(textResult); } catch(e) {}

        res.json({ success: true, payload: payloadStr, serverResponse: result, usedKeyName: targetKeyObj.name });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 IPN Webhook Server đang chạy tại http://localhost:${PORT}`);
    console.log(`👉 HÃY MỞ TRÌNH DUYỆT TẠI: http://localhost:${PORT} ĐỂ XEM WEB UI`);
    console.log(`======================================================\n`);
});
