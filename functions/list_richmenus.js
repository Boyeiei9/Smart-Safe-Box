const { messagingApi } = require("@line/bot-sdk");
const fs = require("fs");
const path = require("path");

// อ่านไฟล์ .env ด้วยตนเองเพื่อดึง Token โดยไม่ใช้โมดูล dotenv
let lineAccessToken = "";
try {
    const envPath = path.join(__dirname, ".env");
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf8");
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

async function run() {
    console.log("--------------------------------------------------");
    console.log("กำลังดึงรายชื่อ Rich Menu ทั้งหมดจากระบบ LINE...");
    console.log("--------------------------------------------------");
    try {
        const response = await client.getRichMenuList();
        const richmenus = response.richmenus || [];
        if (richmenus.length === 0) {
            console.log("❌ ไม่พบ Rich Menu ใด ๆ ในระบบ LINE ของบอทตัวนี้");
            console.log("โปรดเข้าเว็บบริหารจัดการ LINE Official Account และสร้าง Rich Menu ก่อน");
            return;
        }
        console.log(`✅ พบทั้งหมด ${richmenus.length} Rich Menu:`);
        richmenus.forEach((menu, index) => {
            console.log(`\n[รายการที่ ${index + 1}]`);
            console.log(`📌 Rich Menu ID : ${menu.richMenuId}`);
            console.log(`💬 ชื่อ (Name)   : ${menu.name}`);
            console.log(`📏 ขนาด (Size)  : ${menu.size.width}x${menu.size.height} พิกเซล`);
            console.log(`🏷️ คำหลักแทบเมนู : ${menu.chatBarText}`);
        });
        console.log("--------------------------------------------------");
    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาดในการดึงข้อมูล:", error.message);
        if (error.response && error.response.data) {
            console.error("รายละเอียดข้อผิดพลาดจาก LINE API:", JSON.stringify(error.response.data));
        }
    }
}

run();
