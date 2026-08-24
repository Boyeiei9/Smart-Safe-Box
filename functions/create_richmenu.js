const { messagingApi } = require("@line/bot-sdk");
const fs = require("fs");
const path = require("path");

// อ่านไฟล์ .env ด้วยตนเองเพื่อดึง Token โดยไม่ใช้โมดูล dotenv
let lineAccessToken = "";
try {
    const envPath = path.join(__dirname, ".env");
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf8");
        // ค้นหาบรรทัด LINE_CHANNEL_ACCESS_TOKEN
        const lines = envContent.split(/\r?\n/);
        for (const line of lines) {
            if (line.trim().startsWith("LINE_CHANNEL_ACCESS_TOKEN")) {
                const parts = line.split("=");
                if (parts.length > 1) {
                    lineAccessToken = parts.slice(1).join("=").trim().replace(/['"]/g, "");
                    break;
                }
            }
        }
    }
} catch (e) {
    console.error("⚠️ เกิดข้อผิดพลาดในการเปิดไฟล์ .env:", e.message);
}

if (!lineAccessToken) {
    console.error("❌ ไม่พบ LINE_CHANNEL_ACCESS_TOKEN ในไฟล์ functions/.env");
    process.exit(1);
}

const client = new messagingApi.MessagingApiClient({
    channelAccessToken: lineAccessToken
});
const blobClient = new messagingApi.MessagingApiBlobClient({
    channelAccessToken: lineAccessToken
});

// อ่านพารามิเตอร์รูปภาพที่ส่งมาจาก CommandLine
const imagePath = process.argv[2];

if (!imagePath) {
    console.log("❌ กรุณาระบุที่อยู่ไฟล์รูปภาพของริชเมนู เช่น:");
    console.log('node functions/create_richmenu.js "C:\\วัดโคกเสือ\\รูปอุปกรณ์\\Admin.png"');
    process.exit(1);
}

if (!fs.existsSync(imagePath)) {
    console.log(`❌ ไม่พบไฟล์รูปภาพที่ระบุ: ${imagePath}`);
    process.exit(1);
}

async function run() {
    console.log("--------------------------------------------------");
    console.log("กำลังสร้าง Rich Menu บน LINE Developers Platform...");
    console.log("--------------------------------------------------");

    // โครงสร้างของ Rich Menu สำหรับ Super Admin (มี 1 ปุ่มใหญ่เต็มหน้าจอ)
    const richMenu = {
        size: {
            width: 2500,
            height: 1686 // ขนาดมาตรฐาน
        },
        selected: false,
        name: "Super Admin Dashboard Menu",
        chatBarText: "เมนูจัดการระบบ",
        areas: [
            {
                bounds: {
                    x: 0,
                    y: 0,
                    width: 2500,
                    height: 1686
                },
                action: {
                    type: "message",
                    label: "เปิดหน้าจัดการสิทธิ์",
                    text: "เข้าสู่ระบบจัดการ" // เมื่อกดปุ่มจะส่งข้อความนี้หาบอท เพื่อให้บอทส่งลิงก์พิเศษให้
                }
            }
        ]
    };

    try {
        // 1. สร้างโครงร่าง Rich Menu เพื่อเอารหัส ID
        const result = await client.createRichMenu(richMenu);
        const richMenuId = result.richMenuId;
        console.log(`✅ สร้าง Rich Menu สำเร็จ!`);
        console.log(`📌 Rich Menu ID: ${richMenuId}`);
        console.log("--------------------------------------------------");
        console.log(`กำลังอัปโหลดรูปภาพ: ${path.basename(imagePath)} ...`);

        // 2. อัปโหลดรูปภาพเบื้องหลังเข้ากับ Rich Menu
        const imageBuffer = fs.readFileSync(imagePath);
        const contentType = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
        const blob = new Blob([imageBuffer], { type: contentType });
        await blobClient.setRichMenuImage(richMenuId, blob);
        
        console.log(`✅ อัปโหลดรูปภาพสำเร็จและผูกเข้ากับเมนูเรียบร้อยแล้ว!`);
        console.log("--------------------------------------------------");
        console.log("👉 โปรดคัดลอก Rich Menu ID ด้านบนไปใส่ในไฟล์ functions/.env ของคุณ:");
        console.log(`SUPER_ADMIN_RICH_MENU_ID=${richMenuId}`);
        console.log("--------------------------------------------------");
    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error.message);
        if (error.body) {
            console.error("รายละเอียดข้อผิดพลาดจาก LINE API:", typeof error.body === 'object' ? JSON.stringify(error.body) : error.body);
        } else if (error.response && error.response.data) {
            console.error("รายละเอียดข้อผิดพลาดจาก LINE API (Response Data):", JSON.stringify(error.response.data));
        }
    }
}

run();
