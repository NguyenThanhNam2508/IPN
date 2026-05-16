const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
`const path = require('path');`,
`const path = require('path');
const { sql } = require('@vercel/postgres');`
);

code = code.replace(
`const DEFAULT_SECRET_KEY = Buffer.from('VOTRE_SECRET_KEY_32_BYTES_LONG_!', 'utf-8');
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
}`,
`const DEFAULT_SECRET_KEY = Buffer.from('VOTRE_SECRET_KEY_32_BYTES_LONG_!', 'utf-8');
const sessions = new Map();
const MAX_QUEUE_SIZE = 200; // Số sự kiện tối đa lưu buffer

function getSession(clientId) {
    if (!clientId) return null;
    if (!sessions.has(clientId)) {
        sessions.set(clientId, {
            tgToken: '',
            tgChatId: '',
            tgAutoSend: false,
            sseClients: [],
            pollQueue: [],
            eventQueue: []
        });
    }
    return sessions.get(clientId);
}

async function getClientKeys(clientId) {
    try {
        const { rows } = await sql\`SELECT * FROM client_keys WHERE client_id = \${clientId}\`;
        if (rows.length === 0) {
            return [{
                id: 'default',
                name: 'Đối tác Mặc định',
                buffer: DEFAULT_SECRET_KEY,
                originalStr: 'VOTRE_SECRET_KEY_32_BYTES_LONG_!',
                color: '#10b981'
            }];
        }
        return rows.map(r => {
            const val = r.value.trim();
            const isHex64 = /^[0-9a-fA-F]{64}$/.test(val);
            let keyBuf = isHex64 ? Buffer.from(val, 'hex') : Buffer.from(val, 'utf-8');
            return {
                id: r.key_id,
                name: r.name,
                buffer: keyBuf,
                originalStr: val,
                color: r.color
            };
        });
    } catch(e) {
        console.error("DB Error getClientKeys:", e);
        return [{ id: 'default', name: 'DB Error', buffer: DEFAULT_SECRET_KEY, originalStr: 'ERROR', color: '#ef4444' }];
    }
}`
);

code = code.replace(
`app.post('/api/clear-events', (req, res) => {
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    const session = getSession(clientId);
    if (session) {
        session.pollQueue = [];
        session.eventQueue = [];
    }
    res.json({ success: true });
});`,
`app.post('/api/clear-events', async (req, res) => {
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    const session = getSession(clientId);
    if (session) {
        session.pollQueue = [];
        session.eventQueue = [];
    }
    try {
        await sql\`DELETE FROM ipn_logs WHERE client_id = \${clientId}\`;
    } catch(e) {
        console.error("Lỗi xóa IPN DB:", e);
    }
    res.json({ success: true });
});

app.get('/api/ipns', async (req, res) => {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    try {
        const { rows } = await sql`
            SELECT id, client_id, source, matched_name, matched_color, matched_id, body_obj, 
                   TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at 
            FROM ipn_logs 
            WHERE client_id = ${clientId} 
            ORDER BY id DESC LIMIT 50
        `;
        res.json({ ipns: rows });
    } catch(e) {
        console.error("Lỗi lấy lịch sử IPN:", e);
        res.status(500).json({ error: 'Lỗi lấy IPN' });
    }
});`
);

code = code.replace(
`app.get('/api/config-keys', (req, res) => {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    const session = getSession(clientId);
    const out = (session && session.keys) ? session.keys.map(k => ({ id: k.id, name: k.name, value: k.originalStr, color: k.color })) : [];
    res.json({ keys: out });
});`,
`app.get('/api/config-keys', async (req, res) => {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    const keys = await getClientKeys(clientId);
    const out = keys.map(k => ({ id: k.id, name: k.name, value: k.originalStr, color: k.color }));
    res.json({ keys: out });
});`
);

code = code.replace(
`app.post('/api/config-keys', (req, res) => {
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
    emitLogToUI(clientId, 'success', \`🔑 Đã cập nhật xong danh sách \${validKeys.length} Secret Key!\`);
    res.json({ success: true, count: validKeys.length });
});`,
`app.post('/api/config-keys', async (req, res) => {
    const { keys, clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    if (!Array.isArray(keys)) return res.status(400).json({ error: 'Dữ liệu keys không hợp lệ' });
    
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

    try {
        await sql\`DELETE FROM client_keys WHERE client_id = \${clientId}\`;
        for (const vk of validKeys) {
            await sql\`
                INSERT INTO client_keys (client_id, key_id, name, value, color)
                VALUES (\${clientId}, \${vk.id}, \${vk.name}, \${vk.originalStr}, \${vk.color})
            \`;
        }
        
        // Cập nhật UI thông qua SSE
        const session = getSession(clientId);
        if (session) {
            const entry = {
                type: 'keys_updated',
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                time: new Date().toLocaleTimeString(),
                message: 'Danh sách Key đã được cập nhật bởi một thiết bị khác. Đang tải lại...'
            };
            pushToQueue(session, entry);
            broadcastToClients(session, entry);
        }

        emitLogToUI(clientId, 'success', \`🔑 Đã cập nhật xong danh sách \${validKeys.length} Secret Key vào Database!\`);
        res.json({ success: true, count: validKeys.length });
    } catch(e) {
        console.error("DB Error save keys:", e);
        res.status(500).json({ error: "Lỗi lưu DB" });
    }
});`
);

code = code.replace(
`app.post('/api/reevaluate-packets', (req, res) => {
    const { packets, clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    const session = getSession(clientId);
    if (!session) return res.json({ success: true, results: packets.map(() => ({ matchedName: 'Giải mã thất bại', matchedColor: '#ef4444', matchedId: 'unmatched' })) });

    const results = packets.map(dataBaggage => {`,
`app.post('/api/reevaluate-packets', async (req, res) => {
    const { packets, clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });
    const keys = await getClientKeys(clientId);

    const results = packets.map(dataBaggage => {`
);

code = code.replace(
`        if (payload) {
            for (const kObj of session.keys) {`,
`        if (payload) {
            for (const kObj of keys) {`
);

code = code.replace(
`app.all(['/:clientId', '/webhook/ipn', '/webhook/ipn/:clientId'], (req, res) => {`,
`app.all(['/:clientId', '/webhook/ipn', '/webhook/ipn/:clientId'], async (req, res) => {`
);

code = code.replace(
`        // Dò tất cả các Key xem Key nào mở được khóa
        for (const kObj of session.keys) {`,
`        // Dò tất cả các Key xem Key nào mở được khóa
        const keys = await getClientKeys(clientId);
        for (const kObj of keys) {`
);

code = code.replace(
`            const paymentData = JSON.parse(decodedPayload);
            emitLogToUI(clientId, 'success', \`✅ Giải mã tự động thành công (Nguồn: \${matchedKeyName})! Dữ liệu gốc:\`, paymentData, true);`,
`            const paymentData = JSON.parse(decodedPayload);
            emitLogToUI(clientId, 'success', \`✅ Giải mã tự động thành công (Nguồn: \${matchedKeyName})! Dữ liệu gốc:\`, paymentData, true);
            
            try {
                const bodyObjStr = typeof dataBaggage === 'string' ? dataBaggage : JSON.stringify(dataBaggage);
                await sql\`
                    INSERT INTO ipn_logs (client_id, source, matched_name, matched_color, matched_id, body_obj, created_at)
                    VALUES (${clientId}, 'Webhook IPN', ${matchedKeyName}, ${matchedKeyColor}, ${matchedKeyId}, ${bodyObjStr}::jsonb, NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
                \`;
            } catch(e) {
                console.error("Lỗi insert IPN to DB:", e);
            }`
);

code = code.replace(
`            // Giải mã thất bại
            emitRawIPN(clientId, req.body, 'Giải mã thất bại', '#ef4444', 'unmatched');
            emitLogToUI(clientId, 'error', \`❌ Nhận IPN nhưng TẤT CẢ các Secret Key hiện tại đều giải mã thất bại. Vui lòng kiểm tra lại cấu hình Key. Dữ liệu gốc:\`, req.body);
            return res.status(200).json({ return_code: 0, message: 'Received but decryption failed with all known keys' });`,
`            // Giải mã thất bại
            emitRawIPN(clientId, req.body, 'Giải mã thất bại', '#ef4444', 'unmatched');
            emitLogToUI(clientId, 'error', \`❌ Nhận IPN nhưng TẤT CẢ các Secret Key hiện tại đều giải mã thất bại. Vui lòng kiểm tra lại cấu hình Key. Dữ liệu gốc:\`, req.body);
            
            try {
                const bodyObjStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
                await sql\`
                    INSERT INTO ipn_logs (client_id, source, matched_name, matched_color, matched_id, body_obj, created_at)
                    VALUES (${clientId}, 'Webhook IPN', 'Giải mã thất bại', '#ef4444', 'unmatched', ${bodyObjStr}::jsonb, NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
                \`;
            } catch(e) {
                console.error("Lỗi insert IPN to DB (thất bại):", e);
            }

            return res.status(200).json({ return_code: 0, message: 'Received but decryption failed with all known keys' });`
);

code = code.replace(
`app.post('/api/debug-analyze', (req, res) => {
    const { payloadStruct, clientId } = req.body; 
    const raw = payloadStruct;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });

    const session = getSession(clientId);
    const results = { rawBody: raw, analysis: [] };`,
`app.post('/api/debug-analyze', async (req, res) => {
    const { payloadStruct, clientId } = req.body; 
    const raw = payloadStruct;
    if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });

    const keys = await getClientKeys(clientId);
    const results = { rawBody: raw, analysis: [] };`
);

code = code.replace(
`        // Vòng lặp test trọn bộ danh sách Secret Keys do user cấu hình
        for (const kObj of session.keys) {`,
`        // Vòng lặp test trọn bộ danh sách Secret Keys do user cấu hình
        for (const kObj of keys) {`
);

code = code.replace(
`                if (session.keys.indexOf(kObj) === 0) {`,
`                if (keys.indexOf(kObj) === 0) {`
);
code = code.replace(
`                if (session.keys.indexOf(kObj) === 0) {`,
`                if (keys.indexOf(kObj) === 0) {`
);

code = code.replace(
`app.post('/api/simulate-payment', async (req, res) => {
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
`,
`app.post('/api/simulate-payment', async (req, res) => {
    try {
        const { clientId, payloadData, selectedKeyId } = req.body;
        if (!clientId) return res.status(400).json({ error: 'Thiếu clientId' });

        const keys = await getClientKeys(clientId);
        if (keys.length === 0) {
            return res.status(400).json({ error: 'Bạn đang không có bất kỳ Secret Key nào để mã hóa giả lập!' });
        }

        let targetKeyObj = keys[0];
        if (selectedKeyId) {
            const found = keys.find(k => k.id === selectedKeyId);
            if (found) targetKeyObj = found;
        }`
);

fs.writeFileSync('server.js', code, 'utf8');
console.log("Patched server.js");
