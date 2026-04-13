/**
 * Script này đóng vai trò là "Cổng thanh toán" (ví dụ: VNPay, Momo) 
 * Tạo ra payload được mã hóa và bắn sang Webhook Receiver của bạn để test thử.
 */
const crypto = require('crypto');

// Phải TRÙNG KHỚP với Secret Key đã cấu hình ở server.js
const SECRET_KEY = Buffer.from('VOTRE_SECRET_KEY_32_BYTES_LONG_!', 'utf-8'); 

// Dữ liệu giả lập từ cổng thanh toán
const payloadData = {
    orderId: "ORDER_9999",
    amount: 500000,
    status: "SUCCESS",
    timestamp: Date.now()
};

function ecryptPayload(dataObject) {
    const jsonString = JSON.stringify(dataObject);

    // 1. Tạo IV ngẫu nhiên (Initialization Vector - 12 bytes là chuẩn an toàn cho GCM)
    const iv = crypto.randomBytes(12);

    // 2. Khởi tạo engine mã hóa AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', SECRET_KEY, iv);

    // 3. Tiến hành mã hóa
    let encryptedText = cipher.update(jsonString, 'utf8');
    const finalBuffer = cipher.final();
    encryptedText = Buffer.concat([encryptedText, finalBuffer]);

    // 4. Lấy sinh Auth Tag từ engine
    const authTag = cipher.getAuthTag();

    // 5. Build payload string format: Base64(IV):Base64(AuthTag):Base64(Ciphertext)
    const payloadStr = [
        iv.toString('base64'),
        authTag.toString('base64'),
        encryptedText.toString('base64')
    ].join(':');

    return payloadStr;
}

async function sendWebhookMock() {
    console.log('--- MÔ PHỎNG CỔNG THANH TOÁN ---');
    console.log('Dữ liệu gốc:', payloadData);

    const encryptedString = ecryptPayload(payloadData);
    console.log('Dữ liệu đã mã hóa sẽ gửi đi (Payload):\n', encryptedString, '\n');

    try {
        console.log('Đang gửi POST Request tới http://localhost:3000/webhook/ipn ...');
        // Fetch API có sẵn từ Node 18+
        const response = await fetch('http://localhost:3000/webhook/ipn', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                payload: encryptedString
            })
        });

        const resultText = await response.text();
        console.log(`\nPhản hồi từ Server Webhook (HTTP ${response.status}):`);
        console.log(resultText);

    } catch (err) {
        console.error('Lỗi khi gửi webhook. Hãy chắc chắn bạn đã start: node server.js');
        console.error(err.message);
    }
}

sendWebhookMock();
