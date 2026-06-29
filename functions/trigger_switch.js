const { messagingApi } = require("@line/bot-sdk");
const fs = require("fs");
const path = require("path");

let lineAccessToken = "";
let superAdminMenuId = "";
try {
    const envPath = path.join(__dirname, ".env");
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf8");
        const lines = envContent.split(/\r?\n/);
        for (const line of lines) {
            if (line.trim().startsWith("LINE_CHANNEL_ACCESS_TOKEN")) {
                lineAccessToken = line.split("=").slice(1).join("=").trim().replace(/['"]/g, "");
            }
            if (line.trim().startsWith("SUPER_ADMIN_RICH_MENU_ID")) {
                superAdminMenuId = line.split("=").slice(1).join("=").trim().replace(/['"]/g, "");
            }
        }
    }
} catch (e) {
    console.error("⚠️ เกิดข้อผิดพลาดในการอ่านไฟล์ .env:", e.message);
}

if (!lineAccessToken || !superAdminMenuId) {
    console.error("❌ ไม่พบ Access Token หรือ Rich Menu ID ในไฟล์ functions/.env");
    process.exit(1);
}

const client = new messagingApi.MessagingApiClient({
    channelAccessToken: lineAccessToken
});

const userId = "U20282d821a364e478b5328230b1b6f6e";

async function run() {
    console.log("--------------------------------------------------");
    console.log(`กำลังเชื่อมต่อริชเมนูเฉพาะบุคคลเข้ากับ LINE ID: ${userId} ...`);
    console.log(`Rich Menu ID: ${superAdminMenuId}`);
    console.log("--------------------------------------------------");
    try {
        await client.linkRichMenuIdToUser(userId, superAdminMenuId);
        console.log("✅ เชื่อมต่อริชเมนูเฉพาะตัวสำเร็จแล้ว!");
        console.log("โปรดปิดแชทบอทในแอป LINE แล้วเปิดใหม่อีกครั้งเพื่อแสดงผลแผงริชเมนูใหม่");
        console.log("--------------------------------------------------");
    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error.message);
    }
}

run();
