const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { messagingApi } = require("@line/bot-sdk");
const { jsPDF } = require("jspdf");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Initialize Firebase Admin
admin.initializeApp({
    storageBucket: "smart-donate-box.firebasestorage.app"
});

// LINE SDK Configuration
const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};

// V10 Messaging API Client
const client = new messagingApi.MessagingApiClient({
    channelAccessToken: config.channelAccessToken
});

// === Thai Baht Text Converter (server-side) ===
function arabicToThaiBaht(number) {
    if (number === null || number === undefined || isNaN(number)) return "ศูนย์บาทถ้วน";
    const num = Number(number);
    if (num === 0) return "ศูนย์บาทถ้วน";
    const rounded = Math.abs(num).toFixed(2);
    const [bahtStr, satangStr] = rounded.split(".");
    const thaiNumbers = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
    const thaiUnits = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
    function convertGroup(digitsStr) {
        let result = "";
        const len = digitsStr.length;
        for (let i = 0; i < len; i++) {
            const digit = parseInt(digitsStr[i], 10);
            const pos = len - 1 - i;
            if (digit !== 0) {
                if (pos === 1 && digit === 1) result += "สิบ";
                else if (pos === 1 && digit === 2) result += "ยี่สิบ";
                else if (pos === 0 && digit === 1 && len > 1 && digitsStr[len - 2] !== "0") result += "เอ็ด";
                else result += thaiNumbers[digit] + thaiUnits[pos];
            }
        }
        return result;
    }
    function convertBaht(digitsStr) {
        if (digitsStr === "0" || !digitsStr) return "";
        let result = "";
        let str = digitsStr;
        while (str.length > 6) {
            const group = str.slice(-6);
            str = str.slice(0, -6);
            result = "ล้าน" + convertGroup(group) + result;
        }
        result = convertGroup(str) + result;
        return result;
    }
    const bahtText = convertBaht(bahtStr);
    const satangVal = parseInt(satangStr, 10);
    let finalResult = num < 0 ? "ลบ" : "";
    finalResult += bahtText ? bahtText + "บาท" : "ศูนย์บาท";
    finalResult += satangVal === 0 ? "ถ้วน" : convertGroup(satangStr) + "สตางค์";
    return finalResult;
}

// === Canvas & Fonts Setup for Crystal Clear PDF (iOS Compatible) ===
const { createCanvas, GlobalFonts, loadImage } = require("@napi-rs/canvas");

try {
    const regularFontPath = path.join(__dirname, "fonts", "Sarabun-Regular.ttf");
    const boldFontPath = path.join(__dirname, "fonts", "Sarabun-Bold.ttf");
    GlobalFonts.registerFromPath(regularFontPath, "Sarabun");
    GlobalFonts.registerFromPath(boldFontPath, "SarabunBold");
} catch (err) {
    console.error(">>> [CANVAS_FONT] Failed to register fonts:", err.message);
}

function formatCurrencyPDF(amount) {
    return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
}

function formatDatePDF(date) {
    if (!date) return "-";
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(d);
}

function formatDateTimePDF(date) {
    if (!date) return "-";
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(d);
}

async function generateResetReportPDF({ type, items, totalAmount, periodLabel, docNo, templeName }) {
    const temple = templeName || "วัดโคกเสือ";
    const W = 1200;
    const H = 1697; // Standard A4 ratio
    const logoPath = path.join(__dirname, "temple-logo.jpg");
    let logoImg = null;
    if (fs.existsSync(logoPath)) {
        try {
            logoImg = await loadImage(logoPath);
        } catch (e) {
            console.warn(">>> [PDF] Could not load temple logo:", e.message);
        }
    }

    // Sort items chronologically ascending: earliest month/date first
    const sortedItems = [...items].sort((a, b) => {
        const ta = a.timestamp ? (typeof a.timestamp.toDate === "function" ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime()) : 0;
        const tb = b.timestamp ? (typeof b.timestamp.toDate === "function" ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime()) : 0;
        return ta - tb;
    });

    // Smart Chunk items for pages:
    // A single page with full header + metadata + table + totals + signatures + footer can comfortably hold up to 18 items.
    // If <= 18 items -> exactly 1 page (no awkward empty gap on page 1).
    // If > 18 items -> multi-page with balanced distribution so pages look full and dignified.
    const pageItemChunks = [];
    const totalCount = sortedItems.length;

    // Standard rule: Strictly 20 items per page!
    // If totalCount <= 20 -> fits on 1 complete page
    // If > 20 -> Page 1 has exactly 20 items, and subsequent pages take the rest (up to 20 per page)
    if (totalCount <= 20) {
        pageItemChunks.push(sortedItems);
    } else {
        pageItemChunks.push(sortedItems.slice(0, 20));
        let remaining = sortedItems.slice(20);
        while (remaining.length > 0) {
            if (remaining.length <= 20) {
                pageItemChunks.push(remaining);
                remaining = [];
            } else {
                pageItemChunks.push(remaining.slice(0, 20));
                remaining = remaining.slice(20);
            }
        }
    }

    const totalPages = pageItemChunks.length;
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginMm = 6;
    const printWidth = pageWidth - (marginMm * 2);
    const printHeight = (H * printWidth) / W;

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
        const pageItems = pageItemChunks[pIdx];
        const isFirstPage = pIdx === 0;
        const isLastPage = pIdx === totalPages - 1;
        const globalStartIndex = pageItemChunks.slice(0, pIdx).reduce((acc, c) => acc + c.length, 0);

        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");

        // 1. Background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);

        // 2. Certificate Outer Double Frame (Gold)
        const m = 35;
        ctx.strokeStyle = "#D4AF37";
        ctx.lineWidth = 4;
        ctx.strokeRect(m, m, W - m * 2, H - m * 2);

        ctx.strokeStyle = "#E2E8F0";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(m + 8, m + 8, W - (m + 8) * 2, H - (m + 8) * 2);

        let y = 68;

        if (isFirstPage) {
            // Header Logo & Temple Info
            if (logoImg) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(125, y + 50, 50, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(logoImg, 75, y, 100, 100);
                ctx.restore();

                ctx.strokeStyle = "#D4AF37";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(125, y + 50, 50, 0, Math.PI * 2);
                ctx.stroke();
            }

            const textStartX = 205;
            ctx.textAlign = "left";
            ctx.fillStyle = "#1E293B";
            ctx.font = "bold 36px SarabunBold";
            ctx.fillText(temple, textStartX, y + 36);

            ctx.fillStyle = "#64748B";
            ctx.font = "bold 18px SarabunBold";
            ctx.fillText("สังกัดคณะสงฆ์มหานิกาย", textStartX + 180, y + 34);

            ctx.font = "17px Sarabun";
            ctx.fillText("ตำบลโคกเสือ อำเภอบางไทร จังหวัดพระนครศรีอยุธยา 13190", textStartX, y + 66);

            ctx.fillStyle = "#1E293B";
            ctx.font = "bold 24px SarabunBold";
            ctx.fillText("ใบสำคัญรับเงิน / ใบสรุปยอดเงินบริจาค", textStartX, y + 102);

            ctx.fillStyle = "#4F46E5";
            ctx.font = "16px Sarabun";
            ctx.fillText("ระบบตู้บริจาคเงินอัจฉริยะ (Smart Safe Box System)", textStartX + 425, y + 100);

            y += 132;

            // Double Divider Line
            ctx.strokeStyle = "#D4AF37";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(60, y);
            ctx.lineTo(W - 60, y);
            ctx.stroke();

            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(60, y + 4);
            ctx.lineTo(W - 60, y + 4);
            ctx.stroke();

            y += 24;

            // 4. Meta Card
            const cardX = 60;
            const cardW = W - 120;
            const cardH = 105;
            ctx.fillStyle = "#F8FAFC";
            ctx.fillRect(cardX, y, cardW, cardH);
            ctx.strokeStyle = "#E2E8F0";
            ctx.lineWidth = 1;
            ctx.strokeRect(cardX, y, cardW, cardH);

            ctx.fillStyle = "#64748B";
            ctx.font = "16px Sarabun";
            ctx.fillText("หน่วยงานผู้ออก:", cardX + 20, y + 28);
            ctx.fillText("ประเภทเอกสาร:", cardX + 20, y + 56);
            ctx.fillText("วัตถุประสงค์:", cardX + 20, y + 84);

            ctx.fillStyle = "#1E293B";
            ctx.font = "bold 16px SarabunBold";
            ctx.fillText(temple + " (ฝ่ายการเงินและศาสนสมบัติ)", cardX + 135, y + 28);
            ctx.fillText("สรุปรายงานยอดบริจาคตู้เซฟอัจฉริยะ", cardX + 135, y + 56);
            ctx.fillText("เพื่อบำรุงพระอาราม บูรณปฏิสังขรณ์ และสาธารณประโยชน์", cardX + 135, y + 84);

            const rightColX = cardX + cardW / 2 + 50;
            ctx.fillStyle = "#64748B";
            ctx.font = "16px Sarabun";
            ctx.fillText("เลขที่เอกสาร:", rightColX, y + 28);
            ctx.fillText("วันที่ออกเอกสาร:", rightColX, y + 56);
            ctx.fillText("รอบการจัดเก็บ:", rightColX, y + 84);

            ctx.fillStyle = "#4F46E5";
            ctx.font = "bold 17px SarabunBold";
            ctx.fillText(docNo, rightColX + 130, y + 28);

            ctx.fillStyle = "#1E293B";
            ctx.font = "16px Sarabun";
            ctx.fillText(formatDatePDF(new Date()), rightColX + 130, y + 56);

            ctx.fillStyle = "#059669";
            ctx.font = "bold 16px SarabunBold";
            ctx.fillText(periodLabel, rightColX + 130, y + 84);

            y += cardH + 20;
        } else {
            // Continuation Header on Subsequent Pages
            ctx.textAlign = "left";
            ctx.fillStyle = "#1E293B";
            ctx.font = "bold 24px SarabunBold";
            ctx.fillText(temple + " — ใบสำคัญรับเงิน / ใบสรุปยอดเงินบริจาค (ต่อ)", 60, y + 30);

            ctx.textAlign = "right";
            ctx.font = "bold 16px SarabunBold";
            ctx.fillStyle = "#4F46E5";
            ctx.fillText("เลขที่เอกสาร: " + docNo + "  |  รอบ: " + periodLabel, W - 60, y + 30);

            y += 50;
            ctx.strokeStyle = "#D4AF37";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(60, y);
            ctx.lineTo(W - 60, y);
            ctx.stroke();
            y += 20;
        }

        // Table Header
        const tblX = 60;
        const tblW = W - 120;
        const colW = [80, 220, 560, 220];

        ctx.fillStyle = "#1E293B";
        ctx.fillRect(tblX, y, tblW, 40);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px SarabunBold";
        ctx.textAlign = "center";
        ctx.fillText("ลำดับ", tblX + colW[0] / 2, y + 26);
        ctx.fillText("วันที่ทำรายการ", tblX + colW[0] + colW[1] / 2, y + 26);
        ctx.textAlign = "left";
        ctx.fillText("รายการ / วัตถุประสงค์การบริจาค", tblX + colW[0] + colW[1] + 20, y + 26);
        ctx.textAlign = "right";
        ctx.fillText("จำนวนเงิน (บาท)", tblX + tblW - 20, y + 26);

        y += 40;

        // Dynamic row height to guarantee that pages are FULL and never have dead white space
        let rowH;
        if (!isLastPage) {
            // Fill intermediate page completely down to the continuation notice (y ≈ 1550)
            const availableH = (H - 140) - y;
            rowH = Math.min(56, Math.max(42, Math.floor(availableH / pageItems.length)));
        } else if (isFirstPage && isLastPage) {
            // Exactly 1 page (up to 20 items): fits header, table, totals, baht box, and signatures
            if (pageItems.length <= 10) {
                rowH = 50;
            } else if (pageItems.length <= 15) {
                rowH = 46;
            } else {
                rowH = 43;
            }
        } else {
            // Last page: row height based on count so totals and signatures fit comfortably
            if (pageItems.length <= 8) {
                rowH = 48;
            } else if (pageItems.length <= 14) {
                rowH = 44;
            } else {
                rowH = 40;
            }
        }

        pageItems.forEach((item, idx) => {
            const itemIdx = globalStartIndex + idx;
            ctx.fillStyle = itemIdx % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
            ctx.fillRect(tblX, y, tblW, rowH);

            ctx.strokeStyle = "#E2E8F0";
            ctx.lineWidth = 1;
            ctx.strokeRect(tblX, y, tblW, rowH);

            const itemDate = item.timestamp ? (typeof item.timestamp.toDate === "function" ? item.timestamp.toDate() : new Date(item.timestamp)) : new Date();
            const textMidY = y + rowH / 2;

            ctx.fillStyle = "#1E293B";
            ctx.font = "bold 15px SarabunBold";
            ctx.textAlign = "center";
            ctx.fillText(String(itemIdx + 1), tblX + colW[0] / 2, textMidY + 5);

            ctx.font = "14px Sarabun";
            ctx.fillText(formatDatePDF(itemDate), tblX + colW[0] + colW[1] / 2, textMidY + 5);

            ctx.textAlign = "left";
            ctx.font = "bold 14px SarabunBold";
            ctx.fillText("เงินบริจาคสมทบทุน " + temple, tblX + colW[0] + colW[1] + 20, textMidY - 5);

            ctx.fillStyle = "#64748B";
            ctx.font = "12px Sarabun";
            const noteText = item.note || "รอบการรีเซ็ตตู้บริจาคอัจฉริยะ (ผู้ดูแลระบบ)";
            ctx.fillText(noteText, tblX + colW[0] + colW[1] + 20, textMidY + 12);

            // Clean number display without redundant '฿' (header already specifies บาท)
            ctx.textAlign = "right";
            ctx.fillStyle = "#1E293B";
            ctx.font = "bold 16px SarabunBold";
            ctx.fillText(formatCurrencyPDF(item.amount), tblX + tblW - 20, textMidY + 5);

            y += rowH;
        });

        if (isLastPage) {
            // Total Row
            ctx.fillStyle = "#F1F5F9";
            ctx.fillRect(tblX, y, tblW, 48);
            ctx.strokeStyle = "#CBD5E1";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(tblX, y, tblW, 48);

            ctx.textAlign = "right";
            ctx.fillStyle = "#1E293B";
            ctx.font = "bold 16px SarabunBold";
            // Align label neatly with the description column
            ctx.fillText("ยอดเงินรวมสุทธิทั้งสิ้น (Total Net Amount):", tblX + colW[0] + colW[1] + colW[2] - 15, y + 31);

            ctx.fillStyle = "#047857";
            ctx.font = "bold 22px SarabunBold";
            const totalText = formatCurrencyPDF(totalAmount);
            const totalTextX = tblX + tblW - 20;
            ctx.fillText(totalText, totalTextX, y + 31);

            // Double Underline: Fitted precisely to the exact width of the total amount text
            const totalTextWidth = ctx.measureText(totalText).width;
            const linePad = 4;
            const lineRight = totalTextX + linePad;
            const lineLeft = totalTextX - totalTextWidth - linePad;

            ctx.strokeStyle = "#047857";
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(lineLeft, y + 38);
            ctx.lineTo(lineRight, y + 38);
            ctx.moveTo(lineLeft, y + 42);
            ctx.lineTo(lineRight, y + 42);
            ctx.stroke();

            y += 62;

            // 6. Baht Box
            const bahtText = arabicToThaiBaht(totalAmount);
            ctx.fillStyle = "#F8FAFC";
            ctx.fillRect(tblX, y, tblW, 42);
            ctx.strokeStyle = "#E2E8F0";
            ctx.lineWidth = 1;
            ctx.strokeRect(tblX, y, tblW, 42);

            ctx.textAlign = "left";
            ctx.fillStyle = "#1E293B";
            ctx.font = "bold 15px SarabunBold";
            ctx.fillText("จำนวนเงินตัวอักษร (Baht Text):", tblX + 20, y + 27);

            ctx.fillStyle = "#0F172A";
            ctx.font = "bold 16px SarabunBold";
            ctx.fillText("( " + bahtText + " )", tblX + 255, y + 27);

            y += 58;

            // 7. Signatures & Official Red Seal Stamp
            const sigColW = (tblW - 160) / 2;
            const sig1X = tblX;
            const sealX = tblX + sigColW + 20;
            const sig2X = sealX + 120 + 20;

            // Treasurer
            ctx.textAlign = "center";
            ctx.fillStyle = "#1E293B";
            ctx.font = "bold 15px SarabunBold";
            ctx.fillText("ผู้จัดทำรายงาน / ผู้ส่งมอบเงิน", sig1X + sigColW / 2, y);

            ctx.strokeStyle = "#CBD5E1";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sig1X + 30, y + 42);
            ctx.lineTo(sig1X + sigColW - 30, y + 42);
            ctx.stroke();

            ctx.fillStyle = "#64748B";
            ctx.font = "14px Sarabun";
            ctx.fillText("( ............................................................ )", sig1X + sigColW / 2, y + 64);
            ctx.fillText("เหรัญญิก / คณะกรรมการฝ่ายการเงิน", sig1X + sigColW / 2, y + 86);
            ctx.fillText("วันที่ .......... / .......... / ................", sig1X + sigColW / 2, y + 108);

            // Official Red Seal Stamp
            ctx.save();
            const scX = sealX + 60;
            const scY = y + 46;
            ctx.strokeStyle = "#DC2626";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(scX, scY, 44, 0, Math.PI * 2);
            ctx.stroke();

            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(scX, scY, 38, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = "#DC2626";
            ctx.font = "bold 12px SarabunBold";
            ctx.fillText("ประทับตรา", scX, scY - 11);
            ctx.font = "bold 14px SarabunBold";
            ctx.fillText(temple, scX, scY + 6);
            ctx.font = "bold 11px SarabunBold";
            ctx.fillText("(สำคัญ)", scX, scY + 21);

            ctx.font = "12px Sarabun";
            ctx.fillStyle = "#64748B";
            ctx.fillText("ตราประทับวัดประจำหน่วยงาน", scX, y + 108);
            ctx.restore();

            // Abbot
            ctx.textAlign = "center";
            ctx.fillStyle = "#1E293B";
            ctx.font = "bold 15px SarabunBold";
            ctx.fillText("ผู้รับรองรายงาน / เจ้าอาวาส", sig2X + sigColW / 2, y);

            ctx.strokeStyle = "#CBD5E1";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sig2X + 30, y + 42);
            ctx.lineTo(sig2X + sigColW - 30, y + 42);
            ctx.stroke();

            ctx.fillStyle = "#64748B";
            ctx.font = "14px Sarabun";
            ctx.fillText("( ............................................................ )", sig2X + sigColW / 2, y + 64);
            ctx.fillText("เจ้าอาวาส " + temple, sig2X + sigColW / 2, y + 86);
            ctx.fillText("วันที่ .......... / .......... / ................", sig2X + sigColW / 2, y + 108);

            y += 140;

            // 8. Official Verification Footer
            ctx.strokeStyle = "#E2E8F0";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(60, y);
            ctx.lineTo(W - 60, y);
            ctx.stroke();

            y += 22;
            ctx.textAlign = "center";
            ctx.fillStyle = "#4F46E5";
            ctx.font = "bold 14px SarabunBold";
            ctx.fillText("🛡️ เอกสารการเงินออกโดยระบบตู้บริจาคเงินอัจฉริยะ (Smart Safe Box) — " + temple, W / 2, y);

            y += 20;
            ctx.fillStyle = "#64748B";
            ctx.font = "12px Sarabun";
            ctx.fillText("เอกสารนี้เป็นหลักฐานทางการเงินที่ถูกต้อง ใช้สำหรับตรวจสอบบัญชีศาสนสมบัติและประกอบการยื่นรายงานต่อคณะสงฆ์และหน่วยงานทางการเงิน", W / 2, y);
        } else {
            // Intermediate Page Footer notice
            y = H - 110;
            ctx.textAlign = "center";
            ctx.fillStyle = "#64748B";
            ctx.font = "bold 15px SarabunBold";
            ctx.fillText("— มีรายการต่อในหน้าถัดไป (Continued on next page) —", W / 2, y);
        }

        // Page Numbering
        ctx.textAlign = "right";
        ctx.fillStyle = "#94A3B8";
        ctx.font = "14px Sarabun";
        ctx.fillText("หน้า " + (pIdx + 1) + " จาก " + totalPages, W - 60, H - 45);

        // Add page to PDF
        if (pIdx > 0) doc.addPage();
        const jpegBuf = canvas.toBuffer("image/jpeg", 92);
        doc.addImage(jpegBuf, "JPEG", marginMm, marginMm, printWidth, printHeight);
    }

    return Buffer.from(doc.output("arraybuffer"));
}

async function uploadPDFAndGetURL(pdfBuffer, userId, docNo) {
    const bucket = admin.storage().bucket("smart-donate-box.firebasestorage.app");
    const filePath = `reports/${userId}/${docNo}.pdf`;
    const file = bucket.file(filePath);
    const token = crypto.randomUUID();

    await file.save(pdfBuffer, {
        metadata: {
            contentType: "application/pdf",
            metadata: {
                firebaseStorageDownloadTokens: token
            }
        }
    });

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
    return downloadUrl;
}

exports.lineWebhook = onRequest(async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const events = req.body.events;

    try {
        await Promise.all(events.map(async (event) => {
            if (event.type === "follow") {
                const userId = event.source.userId;
                console.log(`>>> [FOLLOW] userId: ${userId} followed the bot.`);
                
                // ตรวจสอบบทบาทและสลับ Rich Menu
                const superAdminMenuId = process.env.SUPER_ADMIN_RICH_MENU_ID;
                if (superAdminMenuId) {
                    try {
                        const userDoc = await admin.firestore().collection("Users").doc(userId).get();
                        if (userDoc.exists && userDoc.data().role === "SuperAdmin") {
                            await client.linkRichMenuIdToUser(userId, superAdminMenuId);
                            console.log(`>>> [RICH_MENU] Linked SuperAdmin Rich Menu to ${userId} on follow`);
                        } else {
                            await client.unlinkRichMenuIdFromUser(userId);
                            console.log(`>>> [RICH_MENU] Unlinked custom Rich Menu from ${userId} on follow`);
                        }
                    } catch (err) {
                        console.error(">>> [RICH_MENU_ERROR] Failed to update rich menu on follow:", err.message);
                    }
                }
                
                return client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{
                        type: "flex",
                        altText: "ยินดีต้อนรับสู่ระบบตู้บริจาคอัจฉริยะ",
                        contents: {
                            type: "bubble",
                            hero: {
                                type: "image",
                                url: "https://firebasestorage.googleapis.com/v0/b/smart-donate-box.firebasestorage.app/o/Gemini_Generated_Image_ub2itkub2itkub2i.png?alt=media&token=21bad46b-89f9-4666-9694-c1d47b288dcf",
                                size: "full",
                                aspectRatio: "20:13",
                                aspectMode: "cover"
                            },
                            body: {
                                type: "box",
                                layout: "vertical",
                                spacing: "md",
                                contents: [
                                    {
                                        type: "text",
                                        text: "🙏 ยินดีต้อนรับ",
                                        weight: "bold",
                                        size: "xl",
                                        color: "#D4AF37"
                                    },
                                    {
                                        type: "text",
                                        text: "ระบบตู้บริจาคอัจฉริยะ วัดโคกเสือ",
                                        weight: "bold",
                                        size: "md",
                                        color: "#2c3e50"
                                    },
                                    {
                                        type: "text",
                                        text: "กรุณากดปุ่มด้านล่างหรือพิมพ์คำว่า \"ลงทะเบียน\" เพื่อเริ่มต้นใช้งานและยืนยันตัวตนเข้ารับสิทธิ์ในระบบครับ",
                                        wrap: true,
                                        size: "sm",
                                        color: "#555555"
                                    }
                                ]
                            },
                            footer: {
                                type: "box",
                                layout: "vertical",
                                spacing: "sm",
                                contents: [
                                    {
                                        type: "button",
                                        style: "primary",
                                        color: "#D4AF37",
                                        action: {
                                            type: "message",
                                            label: "📝 ลงทะเบียนเริ่มต้นใช้งาน",
                                            text: "ลงทะเบียน"
                                        }
                                    }
                                ]
                            }
                        }
                    }]
                });
            }

            if (event.type === "message" && event.message.type === "text") {
                const text = event.message.text.trim();
                const textLower = text.toLowerCase();
                const userId = event.source.userId;

                console.log(`>>> [INCOMING] userId: ${userId}, text: "${text}"`);

                const userDoc = await admin.firestore().collection("Users").doc(userId).get();
                const userData = userDoc.exists ? userDoc.data() : null;

                if (userData) {
                    console.log(`>>> [USER_DATA] name: ${userData.name}, isApproved: ${userData.isApproved}, pendingAction: ${userData.pendingAction}`);
                } else {
                    console.log(`>>> [USER_DATA] NOT FOUND for ${userId}`);
                }

                // 1. คำสั่งลงทะเบียน
                if (textLower === "/register" || textLower === "ลงทะเบียน") {
                    if (userData) {
                        return client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: "text",
                                text: `สวัสดีครับคุณ ${userData.name || "สมาชิก"} ท่านได้เคยลงทะเบียนในระบบแล้วครับ\n\nสถานะปัจจุบัน: ${userData.isApproved ? "✅ อนุมัติแล้ว" : "⏳ รอการอนุมัติ"}`
                            }]
                        });
                    }

                    try {
                        const profile = await client.getProfile(userId);
                        await admin.firestore().collection("Users").doc(userId).set({
                            lineId: userId,
                            name: profile.displayName,
                            role: "Staff",
                            isApproved: false,
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });

                        return client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: "text",
                                text: `สวัสดีคุณ ${profile.displayName} ระบบได้รับข้อมูลการลงทะเบียนของคุณแล้ว กรุณารอแอดมินอนุมัติสิทธิ์ในหน้า Dashboard ครับ`
                            }]
                        });
                    } catch (error) {
                        console.error(`>>> [REG_ERROR] userId: ${userId}`, error);
                        return client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: "text", text: "ขออภัย เกิดข้อผิดพลาดในการลงทะเบียน (โปรดตรวจสอบ Firebase Logs)" }]
                        });
                    }
                }

                // --- ระบบเลือกใบสรุปยอดหลังรีเซ็ต (Report Selection after Reset) ---
                if (userData && userData.pendingAction === "selectResetReport") {
                    const mainCommands = [
                        "เช็คยอดเงิน", "เช็คยอด", "เช็คยอดเงินในตู้", "ตรวจยอดเงิน", "ยอดเงิน", "/balance",
                        "ดูประวัติการบริจาค", "ประวัติการบริจาค", "ประวัติบริจาค", "ดูประวัติบริจาค", "/history",
                        "ดูรายงานยอดเงิน", "รายงานยอดเงิน", "ดูรายงาน", "รายงาน", "/report",
                        "ดูประวัติการใช้งานตู้", "ดูประวัติการใช้งาน", "ประวัติการใช้งานตู้", "ประวัติการใช้งาน", "/logs",
                        "ดูสถานะของตู้", "ดูสถานะตู้", "สถานะของตู้", "สถานะตู้", "/status",
                        "รีเซ็ตยอดเงิน", "รีเซ็ตยอด", "ล้างยอดเงิน", "ล้างยอด", "/reset",
                        "ปลดล็อก", "ปลดล็อค", "ปลดล็อกตู้", "ปลดล็อคตู้", "/unlock",
                        "ล็อก", "ล็อค", "ล็อกตู้", "ล็อคตู้", "ปิดตู้", "ปิดตู้บริจาค", "/lock",
                        "สิทธิ์ของฉัน", "/myperms", "ลงทะเบียน", "/register"
                    ];
                    const isMainCmd = mainCommands.some(cmd => text === cmd || textLower === cmd.toLowerCase());

                    const reportOptions = ["ใบสรุปรายครั้ง", "ใบสรุปรายเดือน", "ใบสรุปรายปี"];

                    if (text === "ข้ามขั้นตอนนี้") {
                        await admin.firestore().collection("Users").doc(userId).set({ pendingAction: null, resetContext: null }, { merge: true });
                        return client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: "text", text: "✅ ข้ามขั้นตอนการออกใบสรุปยอดเรียบร้อยแล้วครับ" }]
                        });
                    } else if (isMainCmd) {
                        await admin.firestore().collection("Users").doc(userId).set({ pendingAction: null, resetContext: null }, { merge: true });
                        userData.pendingAction = null;
                    } else if (reportOptions.includes(text)) {
                        try {
                            console.log(`>>> [REPORT] User ${userId} selected: ${text}`);

                            const resetCtx = userData.resetContext || {};
                            const templeName = "วัดโคกเสือ";
                            const dbRef = admin.firestore();
                            const now = new Date();
                            let items = [];
                            let totalAmount = 0;
                            let periodLabel = "";
                            let docNo = "";
                            let reportType = "single";

                            if (text === "ใบสรุปรายครั้ง") {
                                reportType = "single";
                                // Single reset (latest one / the one just done)
                                totalAmount = resetCtx.amount || 0;
                                const ts = resetCtx.timestamp ? new Date(resetCtx.timestamp) : now;
                                items = [{ amount: totalAmount, timestamp: ts }];
                                periodLabel = `รอบรีเซ็ตเมื่อ ${formatDateTimePDF(ts)}`;
                                docNo = `TAX-${ts.getTime().toString().slice(-6)}`;

                            } else if (text === "ใบสรุปรายเดือน") {
                                reportType = "monthly";
                                // All resets in current month
                                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                                
                                const snapshot = await dbRef.collection("ResetHistory")
                                    .where("timestamp", ">=", startOfMonth)
                                    .where("timestamp", "<", endOfMonth)
                                    .orderBy("timestamp", "asc")
                                    .get();

                                snapshot.forEach((docSnap) => {
                                    const data = docSnap.data();
                                    items.push({
                                        amount: data.amount || 0,
                                        timestamp: data.timestamp ? data.timestamp.toDate() : now
                                    });
                                    totalAmount += data.amount || 0;
                                });

                                if (items.length === 0) {
                                    // Fallback: use the reset context if no results from query
                                    totalAmount = resetCtx.amount || 0;
                                    items = [{ amount: totalAmount, timestamp: resetCtx.timestamp ? new Date(resetCtx.timestamp) : now }];
                                }

                                const monthName = now.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
                                periodLabel = `ประจำเดือน ${monthName}`;
                                docNo = `TAX-M-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

                            } else if (text === "ใบสรุปรายปี") {
                                reportType = "yearly";
                                // All resets in current year
                                const startOfYear = new Date(now.getFullYear(), 0, 1);
                                const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
                                
                                const snapshot = await dbRef.collection("ResetHistory")
                                    .where("timestamp", ">=", startOfYear)
                                    .where("timestamp", "<", endOfYear)
                                    .orderBy("timestamp", "asc")
                                    .get();

                                snapshot.forEach((docSnap) => {
                                    const data = docSnap.data();
                                    items.push({
                                        amount: data.amount || 0,
                                        timestamp: data.timestamp ? data.timestamp.toDate() : now
                                    });
                                    totalAmount += data.amount || 0;
                                });

                                if (items.length === 0) {
                                    totalAmount = resetCtx.amount || 0;
                                    items = [{ amount: totalAmount, timestamp: resetCtx.timestamp ? new Date(resetCtx.timestamp) : now }];
                                }

                                const yearBuddhist = now.getFullYear() + 543;
                                periodLabel = `ประจำปี พ.ศ. ${yearBuddhist}`;
                                docNo = `TAX-Y-${now.getFullYear()}`;
                            }

                            // Generate PDF
                            console.log(`>>> [REPORT] Generating PDF: ${docNo}, items: ${items.length}, total: ${totalAmount}`);
                            const pdfBuffer = await generateResetReportPDF({
                                type: text,
                                items,
                                totalAmount,
                                periodLabel,
                                docNo,
                                templeName
                            });

                            // Upload to Firebase Storage
                            const pdfUrl = await uploadPDFAndGetURL(pdfBuffer, userId, docNo);
                            console.log(`>>> [REPORT] PDF uploaded: ${pdfUrl}`);

                            // Clear pendingAction
                            await admin.firestore().collection("Users").doc(userId).set({ pendingAction: null, resetContext: null }, { merge: true });

                            // Send Flex Message with download button
                            return client.replyMessage({
                                replyToken: event.replyToken,
                                messages: [{
                                    type: "flex",
                                    altText: `📄 ใบสรุปยอด ${periodLabel} พร้อมดาวน์โหลด`,
                                    contents: {
                                        type: "bubble",
                                        body: {
                                            type: "box",
                                            layout: "vertical",
                                            spacing: "md",
                                            contents: [
                                                {
                                                    type: "text",
                                                    text: "📄 ใบสรุปยอดพร้อมแล้ว!",
                                                    weight: "bold",
                                                    size: "lg",
                                                    color: "#059669"
                                                },
                                                {
                                                    type: "separator"
                                                },
                                                {
                                                    type: "box",
                                                    layout: "vertical",
                                                    spacing: "sm",
                                                    margin: "md",
                                                    contents: [
                                                        {
                                                            type: "box",
                                                            layout: "horizontal",
                                                            contents: [
                                                                { type: "text", text: "เลขที่เอกสาร:", size: "sm", color: "#888888", flex: 4 },
                                                                { type: "text", text: docNo, size: "sm", weight: "bold", color: "#333333", flex: 5, align: "end" }
                                                            ]
                                                        },
                                                        {
                                                            type: "box",
                                                            layout: "horizontal",
                                                            contents: [
                                                                { type: "text", text: "รอบ/ประจำ:", size: "sm", color: "#888888", flex: 4 },
                                                                { type: "text", text: periodLabel, size: "sm", weight: "bold", color: "#4F46E5", flex: 5, align: "end" }
                                                            ]
                                                        },
                                                        {
                                                            type: "box",
                                                            layout: "horizontal",
                                                            contents: [
                                                                { type: "text", text: "ยอดรวม:", size: "sm", color: "#888888", flex: 4 },
                                                                { type: "text", text: `฿${formatCurrencyPDF(totalAmount)}`, size: "sm", weight: "bold", color: "#059669", flex: 5, align: "end" }
                                                            ]
                                                        },
                                                        {
                                                            type: "box",
                                                            layout: "horizontal",
                                                            contents: [
                                                                { type: "text", text: "จำนวนรอบ:", size: "sm", color: "#888888", flex: 4 },
                                                                { type: "text", text: `${items.length} รอบ`, size: "sm", weight: "bold", color: "#333333", flex: 5, align: "end" }
                                                            ]
                                                        }
                                                    ]
                                                }
                                            ]
                                        },
                                        footer: {
                                            type: "box",
                                            layout: "vertical",
                                            spacing: "sm",
                                            contents: [
                                                {
                                                    type: "button",
                                                    style: "primary",
                                                    color: "#059669",
                                                    action: {
                                                        type: "uri",
                                                        label: "📥 ดาวน์โหลดไฟล์ PDF ทันที",
                                                        uri: pdfUrl
                                                    }
                                                },
                                                {
                                                    type: "button",
                                                    style: "secondary",
                                                    action: {
                                                        type: "uri",
                                                        label: "👁️ ดูตัวอย่าง / พิมพ์เอกสารบนเว็บ",
                                                        uri: `https://smart-donate-box.web.app/?page=history&docType=${reportType}&docNo=${docNo}&openDoc=1`
                                                    }
                                                }
                                            ]
                                        }
                                    }
                                }]
                            });

                        } catch (err) {
                            console.error(">>> [REPORT_ERROR] Failed to generate report:", err);
                            await admin.firestore().collection("Users").doc(userId).set({ pendingAction: null, resetContext: null }, { merge: true });
                            return client.replyMessage({
                                replyToken: event.replyToken,
                                messages: [{ type: "text", text: "❌ เกิดข้อผิดพลาดในการสร้างใบสรุปยอด กรุณาลองใหม่หรือดาวน์โหลดจากหน้าเว็บครับ" }]
                            });
                        }
                    } else {
                        // User typed something that's not a valid option
                        return client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: "flex",
                                altText: "กรุณาเลือกประเภทใบสรุปยอด",
                                contents: {
                                    type: "bubble",
                                    body: {
                                        type: "box",
                                        layout: "vertical",
                                        spacing: "md",
                                        contents: [
                                            {
                                                type: "text",
                                                text: "📄 กรุณาเลือกประเภทใบสรุปยอด",
                                                weight: "bold",
                                                size: "md",
                                                color: "#4F46E5"
                                            },
                                            {
                                                type: "text",
                                                text: "กดปุ่มด้านล่างเพื่อเลือกรูปแบบใบสรุปยอดที่ต้องการ หรือกด \"ข้ามขั้นตอนนี้\" หากไม่ต้องการ",
                                                wrap: true,
                                                size: "sm",
                                                color: "#555555"
                                            }
                                        ]
                                    },
                                    footer: {
                                        type: "box",
                                        layout: "vertical",
                                        spacing: "sm",
                                        contents: [
                                            {
                                                type: "button",
                                                style: "primary",
                                                color: "#4F46E5",
                                                action: { type: "message", label: "📋 ใบสรุปรายครั้ง (ครั้งนี้)", text: "ใบสรุปรายครั้ง" }
                                            },
                                            {
                                                type: "button",
                                                style: "primary",
                                                color: "#059669",
                                                action: { type: "message", label: "📅 ใบสรุปรายเดือน (เดือนนี้)", text: "ใบสรุปรายเดือน" }
                                            },
                                            {
                                                type: "button",
                                                style: "primary",
                                                color: "#D97706",
                                                action: { type: "message", label: "📆 ใบสรุปรายปี (ปีนี้)", text: "ใบสรุปรายปี" }
                                            },
                                            {
                                                type: "button",
                                                style: "secondary",
                                                action: { type: "message", label: "ข้ามขั้นตอนนี้", text: "ข้ามขั้นตอนนี้" }
                                            }
                                        ]
                                    }
                                }
                            }]
                        });
                    }
                }

                // --- ระบบยืนยันคำสั่ง (Confirmation System) ---
                if (userData && userData.pendingAction === "resetBalance") {
                    const mainCommands = [
                        "เช็คยอดเงิน", "เช็คยอด", "เช็คยอดเงินในตู้", "ตรวจยอดเงิน", "ยอดเงิน", "/balance",
                        "ดูประวัติการบริจาค", "ประวัติการบริจาค", "ประวัติบริจาค", "ดูประวัติบริจาค", "/history",
                        "ดูรายงานยอดเงิน", "รายงานยอดเงิน", "ดูรายงาน", "รายงาน", "/report",
                        "ดูประวัติการใช้งานตู้", "ดูประวัติการใช้งาน", "ประวัติการใช้งานตู้", "ประวัติการใช้งาน", "/logs",
                        "ดูสถานะของตู้", "ดูสถานะตู้", "สถานะของตู้", "สถานะตู้", "/status",
                        "รีเซ็ตยอดเงิน", "รีเซ็ตยอด", "ล้างยอดเงิน", "ล้างยอด", "/reset",
                        "ปลดล็อก", "ปลดล็อค", "ปลดล็อกตู้", "ปลดล็อคตู้", "/unlock",
                        "ล็อก", "ล็อค", "ล็อกตู้", "ล็อคตู้", "ปิดตู้", "ปิดตู้บริจาค", "/lock",
                        "สิทธิ์ของฉัน", "/myperms", "ลงทะเบียน", "/register"
                    ];
                    
                    const isMainCmd = mainCommands.some(cmd => text === cmd || textLower === cmd.toLowerCase());

                    if (text === "ตกลง") {
                        try {
                            console.log(`>>> [ACTION] Processing RESET for ${userId}`);
                            
                            // 1. Fetch current total amount before resetting
                            const totalDoc = await admin.firestore().collection("DonationTotal").doc("total").get();
                            const currentAmount = totalDoc.exists ? (totalDoc.data().amount || 0) : 0;

                            // 2. Reset total amount
                            await admin.firestore().collection("DonationTotal").doc("total").set({
                                amount: 0,
                                lastResetAt: admin.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });

                            // 3. Save to ResetHistory collection
                            await admin.firestore().collection("ResetHistory").add({
                                amount: currentAmount,
                                resetBy: userData.name || "ผู้ดูแลระบบ",
                                userId: userId,
                                note: "รีเซ็ตยอดเงินผ่าน LINE Bot",
                                timestamp: admin.firestore.FieldValue.serverTimestamp()
                            });

                            // 4. Log to SystemLogs (ประวัติการบริจาครายคนยังคงถูกเก็บไว้เพื่อเป็นประวัติ)
                            await admin.firestore().collection("SystemLogs").add({
                                action: "รีเซ็ตยอดเงินในตู้ผ่าน LINE",
                                user: userData.name || "ผู้ดูแลระบบ",
                                note: `สรุปยอดเงินจากการรีเซ็ต: ฿${currentAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`,
                                type: "user",
                                timestamp: admin.firestore.FieldValue.serverTimestamp()
                            });
                            
                            // Generate all 3 reports automatically (single, monthly, yearly)
                            const templeName = "วัดโคกเสือ";
                            const dbRef = admin.firestore();
                            const now = new Date();

                            // --- 1. Per-Reset (Single) ---
                            const singleTs = new Date();
                            const singleItems = [{ amount: currentAmount, timestamp: singleTs }];
                            const singlePeriodLabel = `รอบรีเซ็ตเมื่อ ${formatDateTimePDF(singleTs)}`;
                            const singleDocNo = `TAX-${singleTs.getTime().toString().slice(-6)}`;

                            // --- 2. Monthly ---
                            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                            const monthlySnapshot = await dbRef.collection("ResetHistory")
                                .where("timestamp", ">=", startOfMonth)
                                .where("timestamp", "<", endOfMonth)
                                .orderBy("timestamp", "asc")
                                .get();

                            let monthlyItems = [];
                            let monthlyTotal = 0;
                            monthlySnapshot.forEach((docSnap) => {
                                const data = docSnap.data();
                                monthlyItems.push({
                                    amount: data.amount || 0,
                                    timestamp: data.timestamp ? data.timestamp.toDate() : now
                                });
                                monthlyTotal += data.amount || 0;
                            });
                            if (monthlyItems.length === 0) {
                                monthlyTotal = currentAmount;
                                monthlyItems = [{ amount: currentAmount, timestamp: singleTs }];
                            }
                            const monthName = now.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
                            const monthlyPeriodLabel = `ประจำเดือน ${monthName}`;
                            const monthlyDocNo = `TAX-M-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

                            // --- 3. Yearly ---
                            const startOfYear = new Date(now.getFullYear(), 0, 1);
                            const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
                            const yearlySnapshot = await dbRef.collection("ResetHistory")
                                .where("timestamp", ">=", startOfYear)
                                .where("timestamp", "<", endOfYear)
                                .orderBy("timestamp", "asc")
                                .get();

                            let yearlyItems = [];
                            let yearlyTotal = 0;
                            yearlySnapshot.forEach((docSnap) => {
                                const data = docSnap.data();
                                yearlyItems.push({
                                    amount: data.amount || 0,
                                    timestamp: data.timestamp ? data.timestamp.toDate() : now
                                });
                                yearlyTotal += data.amount || 0;
                            });
                            if (yearlyItems.length === 0) {
                                yearlyTotal = currentAmount;
                                yearlyItems = [{ amount: currentAmount, timestamp: singleTs }];
                            }
                            const yearBuddhist = now.getFullYear() + 543;
                            const yearlyPeriodLabel = `ประจำปี พ.ศ. ${yearBuddhist}`;
                            const yearlyDocNo = `TAX-Y-${now.getFullYear()}`;

                            // Generate all 3 PDFs in parallel
                            console.log(`>>> [REPORT] Generating all 3 PDFs for user ${userId}...`);
                            const [singlePdf, monthlyPdf, yearlyPdf] = await Promise.all([
                                generateResetReportPDF({ type: "ใบสรุปรายครั้ง", items: singleItems, totalAmount: currentAmount, periodLabel: singlePeriodLabel, docNo: singleDocNo, templeName }),
                                generateResetReportPDF({ type: "ใบสรุปรายเดือน", items: monthlyItems, totalAmount: monthlyTotal, periodLabel: monthlyPeriodLabel, docNo: monthlyDocNo, templeName }),
                                generateResetReportPDF({ type: "ใบสรุปรายปี", items: yearlyItems, totalAmount: yearlyTotal, periodLabel: yearlyPeriodLabel, docNo: yearlyDocNo, templeName })
                            ]);

                            // Upload all 3 PDFs in parallel
                            const [singleUrl, monthlyUrl, yearlyUrl] = await Promise.all([
                                uploadPDFAndGetURL(singlePdf, userId, singleDocNo),
                                uploadPDFAndGetURL(monthlyPdf, userId, monthlyDocNo),
                                uploadPDFAndGetURL(yearlyPdf, userId, yearlyDocNo)
                            ]);
                            console.log(`>>> [REPORT] All 3 PDFs uploaded successfully.`);

                            // Clear pendingAction (no more selectResetReport needed)
                            await admin.firestore().collection("Users").doc(userId).set({ pendingAction: null, resetContext: null }, { merge: true });

                            const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });

                            return client.replyMessage({
                                replyToken: event.replyToken,
                                messages: [
                                    { 
                                        type: "text", 
                                        text: `✅ ระบบได้ทำการรีเซ็ตยอดเงินในตู้เรียบร้อยแล้วครับ\n\n💰 ยอดเงินที่สรุปรอบนี้: ฿${currentAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท\n📅 วันเวลาที่รีเซ็ต: ${nowStr}\n📊 ยอดเงินในตู้ปัจจุบัน: ฿0.00\n(ประวัติการบริจาคเดิมยังคงถูกเก็บรักษาไว้)` 
                                    },
                                    {
                                        type: "flex",
                                        altText: "📄 ใบสรุปยอดทั้ง 3 แบบพร้อมดาวน์โหลด",
                                        contents: {
                                            type: "carousel",
                                            contents: [
                                                // --- Bubble 1: Per-Reset ---
                                                {
                                                    type: "bubble",
                                                    size: "kilo",
                                                    header: {
                                                        type: "box",
                                                        layout: "vertical",
                                                        backgroundColor: "#4F46E5",
                                                        paddingAll: "16px",
                                                        contents: [
                                                            { type: "text", text: "📋 ใบสรุปรายครั้ง", weight: "bold", size: "md", color: "#FFFFFF" },
                                                            { type: "text", text: "สรุปยอดเงินรอบนี้", size: "xs", color: "#C7D2FE", margin: "sm" }
                                                        ]
                                                    },
                                                    body: {
                                                        type: "box",
                                                        layout: "vertical",
                                                        spacing: "sm",
                                                        contents: [
                                                            {
                                                                type: "box", layout: "horizontal",
                                                                contents: [
                                                                    { type: "text", text: "เลขที่:", size: "xs", color: "#888888", flex: 3 },
                                                                    { type: "text", text: singleDocNo, size: "xs", weight: "bold", color: "#333333", flex: 5, align: "end" }
                                                                ]
                                                            },
                                                            {
                                                                type: "box", layout: "horizontal",
                                                                contents: [
                                                                    { type: "text", text: "ยอดรวม:", size: "xs", color: "#888888", flex: 3 },
                                                                    { type: "text", text: `฿${formatCurrencyPDF(currentAmount)}`, size: "xs", weight: "bold", color: "#059669", flex: 5, align: "end" }
                                                                ]
                                                            }
                                                        ]
                                                    },
                                                    footer: {
                                                        type: "box",
                                                        layout: "vertical",
                                                        spacing: "sm",
                                                        contents: [
                                                            { type: "button", style: "primary", color: "#4F46E5", action: { type: "uri", label: "📥 ดาวน์โหลด PDF", uri: singleUrl } },
                                                            { type: "button", style: "secondary", action: { type: "uri", label: "👁️ ดูบนเว็บ", uri: `https://smart-donate-box.web.app/?page=history&docType=single&docNo=${singleDocNo}&openDoc=1` } }
                                                        ]
                                                    }
                                                },
                                                // --- Bubble 2: Monthly ---
                                                {
                                                    type: "bubble",
                                                    size: "kilo",
                                                    header: {
                                                        type: "box",
                                                        layout: "vertical",
                                                        backgroundColor: "#059669",
                                                        paddingAll: "16px",
                                                        contents: [
                                                            { type: "text", text: "📅 ใบสรุปรายเดือน", weight: "bold", size: "md", color: "#FFFFFF" },
                                                            { type: "text", text: monthlyPeriodLabel, size: "xs", color: "#A7F3D0", margin: "sm" }
                                                        ]
                                                    },
                                                    body: {
                                                        type: "box",
                                                        layout: "vertical",
                                                        spacing: "sm",
                                                        contents: [
                                                            {
                                                                type: "box", layout: "horizontal",
                                                                contents: [
                                                                    { type: "text", text: "เลขที่:", size: "xs", color: "#888888", flex: 3 },
                                                                    { type: "text", text: monthlyDocNo, size: "xs", weight: "bold", color: "#333333", flex: 5, align: "end" }
                                                                ]
                                                            },
                                                            {
                                                                type: "box", layout: "horizontal",
                                                                contents: [
                                                                    { type: "text", text: "ยอดรวม:", size: "xs", color: "#888888", flex: 3 },
                                                                    { type: "text", text: `฿${formatCurrencyPDF(monthlyTotal)}`, size: "xs", weight: "bold", color: "#059669", flex: 5, align: "end" }
                                                                ]
                                                            },
                                                            {
                                                                type: "box", layout: "horizontal",
                                                                contents: [
                                                                    { type: "text", text: "จำนวนรอบ:", size: "xs", color: "#888888", flex: 3 },
                                                                    { type: "text", text: `${monthlyItems.length} รอบ`, size: "xs", weight: "bold", color: "#333333", flex: 5, align: "end" }
                                                                ]
                                                            }
                                                        ]
                                                    },
                                                    footer: {
                                                        type: "box",
                                                        layout: "vertical",
                                                        spacing: "sm",
                                                        contents: [
                                                            { type: "button", style: "primary", color: "#059669", action: { type: "uri", label: "📥 ดาวน์โหลด PDF", uri: monthlyUrl } },
                                                            { type: "button", style: "secondary", action: { type: "uri", label: "👁️ ดูบนเว็บ", uri: `https://smart-donate-box.web.app/?page=history&docType=monthly&docNo=${monthlyDocNo}&openDoc=1` } }
                                                        ]
                                                    }
                                                },
                                                // --- Bubble 3: Yearly ---
                                                {
                                                    type: "bubble",
                                                    size: "kilo",
                                                    header: {
                                                        type: "box",
                                                        layout: "vertical",
                                                        backgroundColor: "#D97706",
                                                        paddingAll: "16px",
                                                        contents: [
                                                            { type: "text", text: "📆 ใบสรุปรายปี", weight: "bold", size: "md", color: "#FFFFFF" },
                                                            { type: "text", text: yearlyPeriodLabel, size: "xs", color: "#FDE68A", margin: "sm" }
                                                        ]
                                                    },
                                                    body: {
                                                        type: "box",
                                                        layout: "vertical",
                                                        spacing: "sm",
                                                        contents: [
                                                            {
                                                                type: "box", layout: "horizontal",
                                                                contents: [
                                                                    { type: "text", text: "เลขที่:", size: "xs", color: "#888888", flex: 3 },
                                                                    { type: "text", text: yearlyDocNo, size: "xs", weight: "bold", color: "#333333", flex: 5, align: "end" }
                                                                ]
                                                            },
                                                            {
                                                                type: "box", layout: "horizontal",
                                                                contents: [
                                                                    { type: "text", text: "ยอดรวม:", size: "xs", color: "#888888", flex: 3 },
                                                                    { type: "text", text: `฿${formatCurrencyPDF(yearlyTotal)}`, size: "xs", weight: "bold", color: "#059669", flex: 5, align: "end" }
                                                                ]
                                                            },
                                                            {
                                                                type: "box", layout: "horizontal",
                                                                contents: [
                                                                    { type: "text", text: "จำนวนรอบ:", size: "xs", color: "#888888", flex: 3 },
                                                                    { type: "text", text: `${yearlyItems.length} รอบ`, size: "xs", weight: "bold", color: "#333333", flex: 5, align: "end" }
                                                                ]
                                                            }
                                                        ]
                                                    },
                                                    footer: {
                                                        type: "box",
                                                        layout: "vertical",
                                                        spacing: "sm",
                                                        contents: [
                                                            { type: "button", style: "primary", color: "#D97706", action: { type: "uri", label: "📥 ดาวน์โหลด PDF", uri: yearlyUrl } },
                                                            { type: "button", style: "secondary", action: { type: "uri", label: "👁️ ดูบนเว็บ", uri: `https://smart-donate-box.web.app/?page=history&docType=yearly&docNo=${yearlyDocNo}&openDoc=1` } }
                                                        ]
                                                    }
                                                }
                                            ]
                                        }
                                    }
                                ]
                            });
                        } catch (err) {
                            console.error(">>> [ERROR] Reset failed:", err);
                            return client.replyMessage({
                                replyToken: event.replyToken,
                                messages: [{ type: "text", text: "❌ เกิดข้อผิดพลาดในการรีเซ็ตยอดเงิน (โปรดติดต่อแอดมิน)" }]
                            });
                        }
                    } else if (text === "ยกเลิก") {
                        console.log(`>>> [ACTION] Processing CANCEL for ${userId}`);
                        await admin.firestore().collection("Users").doc(userId).set({ pendingAction: null }, { merge: true });
                        return client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: "text", text: "❌ ยกเลิกรายการเรียบร้อยแล้วครับ" }]
                        });
                    } else if (isMainCmd) {
                        // Clear pendingAction and proceed to handle the new main command
                        await admin.firestore().collection("Users").doc(userId).set({ pendingAction: null }, { merge: true });
                        userData.pendingAction = null;
                    } else {
                        // User typed something else that is not a main command, remind them
                        return client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: "flex",
                                altText: "กรุณายืนยันคำสั่งรีเซ็ตยอดเงิน",
                                contents: {
                                    type: "bubble",
                                    body: {
                                        type: "box",
                                        layout: "vertical",
                                        spacing: "md",
                                        contents: [
                                            {
                                                type: "text",
                                                text: "⚠️ กรุณายืนยันคำสั่งรีเซ็ตยอดเงิน",
                                                weight: "bold",
                                                size: "lg",
                                                color: "#DE3B3B"
                                            },
                                            {
                                                type: "text",
                                                text: "โปรดกดปุ่ม \"ตกลง\" ด้านล่างเพื่อยืนยันว่าได้นำเงินออกจากตู้หมดแล้วและต้องการรีเซ็ตยอดเงินเป็น ฿0 หรือกด \"ยกเลิก\" เพื่อยกเลิกคำสั่งเดิม",
                                                wrap: true,
                                                size: "sm",
                                                color: "#555555"
                                            }
                                        ]
                                    },
                                    footer: {
                                        type: "box",
                                        layout: "horizontal",
                                        spacing: "sm",
                                        contents: [
                                            {
                                                type: "button",
                                                style: "primary",
                                                color: "#DE3B3B",
                                                action: {
                                                    type: "message",
                                                    label: "ตกลง",
                                                    text: "ตกลง"
                                                }
                                            },
                                            {
                                                type: "button",
                                                style: "secondary",
                                                action: {
                                                    type: "message",
                                                    label: "ยกเลิก",
                                                    text: "ยกเลิก"
                                                }
                                            }
                                        ]
                                    }
                                }
                            }]
                        });
                    }
                }

                if (!userData) {
                    console.log(`>>> [FLOW] User not registered. Ignoring command.`);
                    return;
                }

                if (!userData.isApproved) {
                    console.log(`>>> [FLOW] User not approved. Ignoring command.`);
                    return client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{ type: "text", text: "⏳ บัญชีของคุณยังไม่ได้รับการอนุมัติ กรุณารอแอดมินตรวจสอบสิทธิ์ครับ" }]
                    });
                }

                // คำสั่งเข้าสู่ระบบจัดการสำหรับ Super Admin
                if (text === "เข้าสู่ระบบจัดการ" || textLower === "/admin") {
                    return client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: "flex",
                            altText: "ลิงก์เข้าสู่หน้าจัดการระบบ",
                            contents: {
                                type: "bubble",
                                body: {
                                    type: "box",
                                    layout: "vertical",
                                    spacing: "md",
                                    contents: [
                                        {
                                            type: "text",
                                            text: "🛡️ ระบบจัดการสิทธิ์ผู้ดูแล",
                                            weight: "bold",
                                            size: "lg",
                                            color: "#D4AF37"
                                        },
                                        {
                                            type: "text",
                                            text: "สวัสดีครับคุณแอดมินสูงสุด\n\nท่านสามารถกดปุ่มด้านล่างเพื่อเข้าสู่หน้าต่างบริหารจัดการและอนุมัติสิทธิ์ผู้ดูแลระบบคนอื่น ๆ ได้ทันทีครับ",
                                            wrap: true,
                                            size: "sm",
                                            color: "#555555"
                                        }
                                    ]
                                },
                                footer: {
                                    type: "box",
                                    layout: "vertical",
                                    spacing: "sm",
                                    contents: [
                                        {
                                            type: "button",
                                            style: "primary",
                                            color: "#D4AF37",
                                            action: {
                                                type: "uri",
                                                label: "⚙️ เปิดหน้าจัดการระบบ",
                                                uri: `https://smart-donate-box.web.app/?page=admins&userId=${userId}&openExternalBrowser=1`
                                            }
                                        }
                                    ]
                                }
                            }
                        }]
                    });
                }

                if (userData.role === "SuperAdmin") {
                    console.log(`>>> [FLOW] User is SuperAdmin. Blocking cabinet commands.`);
                    return client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{ type: "text", text: "🛡️ คุณเป็นผู้ดูแลระบบสูงสุด (Super Admin) มีสิทธิ์เฉพาะการจัดการระบบบนหน้าเว็บเท่านั้น ไม่สามารถใช้คำสั่งควบคุมตู้ผ่าน LINE ได้ครับ" }]
                    });
                }

                const permissions = userData.permissions || {};

                // คำสั่ง: สิทธิ์ของฉัน
                if (text === "สิทธิ์ของฉัน" || textLower === "/myperms") {
                    const labels = {
                        checkBalance: "เช็คยอดเงิน",
                        viewDonationHistory: "ดูประวัติการบริจาค",
                        viewSummaryReport: "ดูรายงานยอดเงิน",
                        viewSystemLogs: "ดูประวัติการใช้งานตู้",
                        viewBoxStatus: "ดูสถานะของตู้",
                        resetBalance: "รีเซ็ตยอดเงิน",
                        controlLock: "ควบคุมระบบล็อกตู้"
                    };
                    
                    const granted = Object.keys(labels)
                        .filter(key => permissions[key] === true)
                        .map(key => `• ${labels[key]}`)
                        .join("\n");

                    return client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: "text",
                            text: `👤 ข้อมูลของคุณ: ${userData.name}\n\n${granted ? "สิทธิ์ในระบบที่คุณมี:\n" + granted : "คุณยังไม่ได้รับสิทธิ์สั่งการใดๆ"}`
                        }]
                    });
                }

                // 1. เช็คยอดเงิน
                const isBalanceCmd = ["เช็คยอดเงิน", "เช็คยอด", "เช็คยอดเงินในตู้", "ตรวจยอดเงิน", "ยอดเงิน"].includes(text) || textLower === "/balance";
                if (isBalanceCmd) {
                    if (!permissions.checkBalance) return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: "ขออภัย คุณไม่มีสิทธิ์เข้าถึงข้อมูลยอดเงินครับ" }] });
                    const statsDoc = await admin.firestore().collection("DonationTotal").doc("total").get();
                    const total = statsDoc.exists ? statsDoc.data().amount : 0;
                    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: `📊 ยอดเงินบริจาคในตู้ปัจจุบัน: ฿${total.toLocaleString()}` }] });
                }

                // 2. ดูประวัติการบริจาค
                const isHistoryCmd = ["ดูประวัติการบริจาค", "ประวัติการบริจาค", "ประวัติบริจาค", "ดูประวัติบริจาค"].includes(text) || textLower === "/history";
                if (isHistoryCmd) {
                    if (!permissions.viewDonationHistory) return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: "ขออภัย คุณไม่มีสิทธิ์เข้าถึงประวัติการบริจาคครับ" }] });
                    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: `ท่านสามารถดูรายละเอียดประวัติการบริจาคได้ที่นี่: \nhttps://smart-donate-box.web.app/?page=history&userId=${userId}&openExternalBrowser=1` }] });
                }

                // 3. ดูรายงานยอดเงิน
                const isReportCmd = ["ดูรายงานยอดเงิน", "รายงานยอดเงิน", "ดูรายงาน", "รายงาน"].includes(text) || textLower === "/report";
                if (isReportCmd) {
                    if (!permissions.viewSummaryReport) return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: "ขออภัย คุณไม่มีสิทธิ์เข้าถึงรายงานสรุปครับ" }] });
                    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: `ท่านสามารถดูรายงานสรุปผลได้ที่นี่: \nhttps://smart-donate-box.web.app/?page=dashboard&userId=${userId}&openExternalBrowser=1` }] });
                }

                // 4. ดูประวัติการใช้งานตู้
                const isLogsCmd = ["ดูประวัติการใช้งานตู้", "ดูประวัติการใช้งาน", "ประวัติการใช้งานตู้", "ประวัติการใช้งาน"].includes(text) || textLower === "/logs";
                if (isLogsCmd) {
                    if (!permissions.viewSystemLogs) return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: "ขออภัย คุณไม่มีสิทธิ์เข้าถึงประวัติการใช้งานตู้ครับ" }] });
                    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: `ท่านสามารถดูรายละเอียดประวัติการใช้งานตู้ได้ที่นี่: \nhttps://smart-donate-box.web.app/?page=logs&userId=${userId}&openExternalBrowser=1` }] });
                }

                // 5. ดูสถานะของตู้
                const isStatusCmd = ["ดูสถานะของตู้", "ดูสถานะตู้", "สถานะของตู้", "สถานะตู้"].includes(text) || textLower === "/status";
                if (isStatusCmd) {
                    if (!permissions.viewBoxStatus) return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: "ขออภัย คุณไม่มีสิทธิ์เข้าถึงข้อมูลสถานะตู้ครับ" }] });
                    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: `ท่านสามารถตรวจสอบสถานะและเซ็นเซอร์ตู้ได้ที่นี่: \nhttps://smart-donate-box.web.app/?page=status&userId=${userId}&openExternalBrowser=1` }] });
                }

                // 6. รีเซ็ตยอดเงิน (แบบยืนยัน)
                const isResetCmd = ["รีเซ็ตยอดเงิน", "รีเซ็ตยอด", "ล้างยอดเงิน", "ล้างยอด"].includes(text) || textLower === "/reset";
                if (isResetCmd) {
                    if (!permissions.resetBalance) return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: "ขออภัย คุณไม่มีสิทธิ์สั่งการรีเซ็ตยอดเงินครับ" }] });
                    
                    await admin.firestore().collection("Users").doc(userId).set({ pendingAction: "resetBalance" }, { merge: true });
                    
                    return client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: "flex",
                            altText: "ยืนยันการรีเซ็ตยอดเงินในตู้",
                            contents: {
                                type: "bubble",
                                body: {
                                    type: "box",
                                    layout: "vertical",
                                    spacing: "md",
                                    contents: [
                                        {
                                            type: "text",
                                            text: "⚠️ ยืนยันการรีเซ็ตยอดเงิน",
                                            weight: "bold",
                                            size: "lg",
                                            color: "#DE3B3B"
                                        },
                                        {
                                            type: "text",
                                            text: "ท่านได้นำเงินออกจากตู้หมดแล้วใช่หรือไม่?\n\nหากยืนยัน ยอดเงินปัจจุบันในตู้จะถูกปรับเป็น ฿0 ทันที",
                                            wrap: true,
                                            size: "sm",
                                            color: "#555555"
                                        }
                                    ]
                                },
                                footer: {
                                    type: "box",
                                    layout: "horizontal",
                                    spacing: "sm",
                                    contents: [
                                        {
                                            type: "button",
                                            style: "primary",
                                            color: "#DE3B3B",
                                            action: {
                                                type: "message",
                                                label: "ตกลง",
                                                text: "ตกลง"
                                            }
                                        },
                                        {
                                            type: "button",
                                            style: "secondary",
                                            action: {
                                                type: "message",
                                                label: "ยกเลิก",
                                                text: "ยกเลิก"
                                            }
                                        }
                                    ]
                                }
                            }
                        }]
                    });
                }

                // 7. ควบคุมระบบล็อกตู้ (แยกคำสั่ง ปลดล็อก/ปิดตู้)
                const isUnlockCmd = ["ปลดล็อก", "ปลดล็อค", "ปลดล็อกตู้", "ปลดล็อคตู้"].includes(text) || textLower === "/unlock";
                const isLockCmd = ["ล็อก", "ล็อค", "ล็อกตู้", "ล็อคตู้", "ปิดตู้", "ปิดตู้บริจาค"].includes(text) || textLower === "/lock";

                if (isUnlockCmd || isLockCmd) {
                    console.log(`>>> [ACTION] Lock command detected: ${text}`);
                    if (!permissions.controlLock) return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: "ขออภัย คุณไม่มีสิทธิ์ควบคุมระบบล็อกตู้ครับ" }] });
                    
                    try {
                        const isUnlock = isUnlockCmd;
                        console.log(`>>> [ACTION] User ${userId} setting doorLock to ${isUnlock}`);
                        
                        await admin.firestore().collection("BoxStatus").doc("sensors").set({
                            doorLock: isUnlock
                        }, { merge: true });

                        // บันทึก Log การใช้งานลงใน SystemLogs (แทนที่ UsageLogs เดิมเพื่อให้ขึ้นที่เว็บ)
                        await admin.firestore().collection("SystemLogs").add({
                            action: isUnlock ? "ปลดล็อกตู้ผ่าน LINE" : "ล็อกตู้ผ่าน LINE",
                            user: userData.name || "ผู้ดูแลระบบ",
                            note: `ดำเนินการผ่าน LINE Bot (Line ID: ${userId})`,
                            type: "user",
                            timestamp: admin.firestore.FieldValue.serverTimestamp()
                        });

                        return client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: "text", text: `🔒 ดำเนินการ${isUnlock ? "เปิดตู้ (ปลดล็อก)" : "ปิดตู้ (ล็อก)"} เรียบร้อยแล้วครับ` }]
                        });
                    } catch (err) {
                        console.error(">>> [ERROR] Lock control failed:", err);
                        return client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: "text", text: "❌ เกิดข้อผิดพลาดในการควบคุมระบบล็อก (โปรดติดต่อแอดมิน)" }]
                        });
                    }
                }
            }
        }));
        res.status(200).send("OK");
    } catch (error) {
        console.error(">>> [CRITICAL] Webhook Global Error:", error);
        res.status(500).send("Internal Server Error");
    }
});

// ฟังก์ชันแจ้งเตือนเมื่อแอดมินกดเสร็จสิ้น
exports.notifyUserApproval = onDocumentUpdated("Users/{userId}", async (event) => {
    const userId = event.params.userId;
    const newValue = event.data.after.data();
    const previousValue = event.data.before.data();

    // ล็อกทุกการอัปเดตเพื่อตรวจสอบ
    console.log(`>>> [EVENT] User Updated: ${userId}`);
    console.log(`>>> [DATA] notifyUser: ${previousValue?.notifyUser} -> ${newValue?.notifyUser}`);

    // อัปเดต Rich Menu ทันทีหากพบบทบาทที่เปลี่ยนไป
    if (newValue.role !== previousValue?.role) {
        const superAdminMenuId = process.env.SUPER_ADMIN_RICH_MENU_ID;
        try {
            if (newValue.role === "SuperAdmin" && superAdminMenuId) {
                await client.linkRichMenuIdToUser(userId, superAdminMenuId);
                console.log(`>>> [RICH_MENU] Dynamic role change: Linked SuperAdmin Rich Menu to ${userId}`);
            } else {
                await client.unlinkRichMenuIdFromUser(userId);
                console.log(`>>> [RICH_MENU] Dynamic role change: Unlinked custom Rich Menu from ${userId}`);
            }
        } catch (err) {
            console.error(">>> [RICH_MENU_ERROR] Failed to update rich menu dynamically:", err.message);
        }
    }

    // ลดความซับซ้อนของเงื่อนไข เพื่อให้มั่นใจว่ารันแน่นอนถ้าค่าเป็น true
    if (newValue.notifyUser === true) {
        console.log(`>>> [PROCESS] Condition met for ${userId}. Preparing message...`);
        
        const name = newValue.name || "ผู้ใช้งาน";
        const permissions = newValue.permissions || {};
        
        const labels = {
            checkBalance: "เช็คยอดเงิน",
            viewDonationHistory: "ดูประวัติการบริจาค",
            viewSummaryReport: "ดูรายงานยอดเงิน",
            viewSystemLogs: "ดูประวัติการใช้งานตู้",
            viewBoxStatus: "ดูสถานะของตู้",
            resetBalance: "รีเซ็ตยอดเงิน",
            controlLock: "ควบคุมระบบล็อกตู้"
        };
        
        const granted = Object.keys(labels)
            .filter(key => permissions[key] === true)
            .map(key => `• ${labels[key]}`)
            .join("\n");

        const messageText = `✅ สวัสดีครับคุณ ${name}\n\nสิทธิ์การใช้งานระบบได้รับการอนุมัติแล้ว!\n\n${granted ? "สิทธิ์ที่คุณได้รับ:\n" + granted : "ท่านสามารถเริ่มใช้งานระบบได้ทันที"}\n\nลองพิมพ์ "เช็คยอดเงิน" เพื่อทดสอบได้เลยครับ!`;

        try {
            console.log(`>>> [LINE] Sending push to: ${userId}`);
            console.log(`>>> [LINE] Content: ${messageText.replace(/\n/g, ' ')}`);
            
            const result = await client.pushMessage({
                to: userId,
                messages: [{ type: "text", text: messageText }]
            });
            
            console.log(`>>> [SUCCESS] LINE Response:`, JSON.stringify(result));

            // เคลียร์สถานะทันที
            await admin.firestore().collection("Users").doc(userId).update({
                notifyUser: false,
                lastNotificationStatus: "success",
                lastNotificationAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`>>> [DONE] Firestore status reset.`);
        } catch (error) {
            console.error(`>>> [ERROR] Push Failed for ${userId}:`, error.message);
            
            // บันทึก Error ลง Firestore ให้แอดมินเห็น
            await admin.firestore().collection("Users").doc(userId).update({
                notifyUser: false,
                lastNotificationStatus: "failed",
                lastNotificationError: error.message || "Unknown error",
                lastNotificationAt: admin.firestore.FieldValue.serverTimestamp()
            });

            if (error.response && error.response.data) {
                console.error(`>>> [ERROR_DETAILS] API Error:`, JSON.stringify(error.response.data));
            }
        }
    }
});

// ฟังก์ชันอัปเดตยอดเงินรวมในตู้เมื่อมีรายการบริจาคใหม่เข้ามา
exports.updateTotalDonation = onDocumentCreated("DonationLogs/{donationId}", async (event) => {
    const data = event.data.data();
    if (!data) {
        console.log(">>> [DONATION_EVENT] No data found in document.");
        return;
    }

    const amount = Number(data.amount) || 0;
    console.log(`>>> [DONATION_EVENT] New donation: ${event.params.donationId}, amount: ฿${amount}`);

    if (amount <= 0) return;

    const db = admin.firestore();
    const totalRef = db.collection("DonationTotal").doc("total");

    try {
        await db.runTransaction(async (transaction) => {
            const totalDoc = await transaction.get(totalRef);
            const currentAmount = totalDoc.exists ? (Number(totalDoc.data().amount) || 0) : 0;
            
            transaction.set(totalRef, {
                amount: currentAmount + amount,
                lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        console.log(`>>> [SUCCESS] Added ฿${amount} to total. Transaction completed.`);
    } catch (error) {
        console.error(">>> [ERROR] Failed to update total donation amount:", error);
    }
});

// ฟังก์ชันแจ้งเตือนภัยผ่าน LINE เมื่อมีเอกสารใหม่ใน Alerts ที่เกี่ยวข้องกับความปลอดภัยหรือความรุนแรงระดับสูง
exports.notifySecurityAlert = onDocumentCreated("Alerts/{alertId}", async (event) => {
    const data = event.data.data();
    if (!data) {
        console.log(">>> [ALERT_EVENT] No data found in document.");
        return;
    }

    console.log(`>>> [ALERT_EVENT] New alert: ${event.params.alertId}`, JSON.stringify(data));

    const category = (data.category || '').toLowerCase();
    const isSecurity = category === "security" || category === "ความปลอดภัย" || (data.type || '').includes("สั่น") || (data.type || '').includes("กระทบ");
    const severityVal = (data.severity || '').toString();
    const isHighOrCritical = severityVal === "High" || severityVal === "สูง" || severityVal === "สูงมาก" || severityVal === "critical";

    if (!isSecurity && !isHighOrCritical) {
        console.log(">>> [ALERT_EVENT] Alert is not a security incident or high severity. Skipping LINE push.");
        return;
    }

    const type = data.type || "เหตุผิดปกติ";
    const message = data.message || "ไม่มีรายละเอียดเหตุการณ์";

    let severityText = "ปานกลาง";
    if (severityVal === "สูงมาก" || severityVal === "High" || severityVal.includes("วิกฤต")) {
        severityText = "🔴 สูงมาก (ไซเรนทำงาน)";
    } else if (severityVal === "สูง") {
        severityText = "🟠 สูง";
    } else if (severityVal === "Medium" || severityVal === "ปานกลาง") {
        severityText = "🟢 ปานกลาง";
    } else if (severityVal === "Low" || severityVal === "ต่ำ") {
        severityText = "🟢 ต่ำ";
    }

    let timeString = "";
    try {
        const d = (data.timestamp && typeof data.timestamp.toDate === "function") 
            ? data.timestamp.toDate() 
            : (data.timestamp ? new Date(data.timestamp) : new Date());
        timeString = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(d);
    } catch (e) {
        timeString = new Date().toISOString();
    }

    const messageText = `🚨 แจ้งเตือนเหตุผิดปกติจากตู้บริจาค 🚨\n\n📌 ประเภท: ${type}\n⚠️ ความรุนแรง: ${severityText}\n📝 รายละเอียด: ${message}\n⏰ เวลา: ${timeString}\n\nโปรดตรวจสอบระบบหรือตู้บริจาคทันที!`;

    try {
        const usersSnapshot = await admin.firestore().collection("Users").where("isApproved", "==", true).get();
        if (usersSnapshot.empty) {
            console.log(">>> [ALERT_EVENT] No approved users found to notify.");
            return;
        }

        const pushPromises = [];
        usersSnapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            const userId = userData.lineId || userDoc.id;

            if (userId && userId.startsWith("U") && userId.length >= 33) {
                console.log(`>>> [ALERT_EVENT] Sending security alert to: ${userData.name} (${userId})`);
                pushPromises.push(
                    client.pushMessage({
                        to: userId,
                        messages: [{ type: "text", text: messageText }]
                    }).then(res => {
                        console.log(`>>> [ALERT_EVENT] Successfully sent notification to ${userData.name}`);
                        return res;
                    }).catch(err => {
                        console.error(`>>> [ALERT_EVENT] Failed to send notification to ${userData.name}:`, err.message);
                    })
                );
            }
        });

        await Promise.all(pushPromises);
        console.log(">>> [ALERT_EVENT] Finished processing security alert notifications.");
    } catch (error) {
        console.error(">>> [ALERT_EVENT] Error in notifySecurityAlert:", error);
    }
});

// ฟังก์ชันแจ้งเตือนผลการตรวจสุขภาพระบบประจำวัน (19:00 น.) ทาง LINE
exports.notifyDailyHardwareCheck = onDocumentCreated("DailyHardwareCheck/{checkId}", async (event) => {
    const data = event.data.data();
    if (!data) {
        console.log(">>> [DAILY_CHECK_EVENT] No data found in document.");
        return;
    }

    console.log(`>>> [DAILY_CHECK_EVENT] New daily check: ${event.params.checkId}`, JSON.stringify(data));

    const boxId = data.boxId || "box1";
    const statusSummary = data.statusSummary || "UNKNOWN";
    
    let statusText = "";
    let statusEmoji = "";
    if (statusSummary === "SUCCESS") {
        statusText = "ปกติทั้งหมด (SUCCESS)";
        statusEmoji = "✅";
    } else {
        statusText = "พบข้อผิดพลาด / เซ็นเซอร์ขัดข้อง (WARNING)";
        statusEmoji = "⚠️";
    }

    let timeString = "";
    try {
        const d = (data.checkTime && typeof data.checkTime.toDate === "function") 
            ? data.checkTime.toDate() 
            : (data.checkTime ? new Date(data.checkTime) : new Date());
        timeString = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(d);
    } catch (e) {
        timeString = new Date().toISOString();
    }

    // จัดรูปแบบข้อความแจ้งเตือนประจำวัน
    const messageText = `📋 รายงานผลการตรวจสอบอุปกรณ์ตู้บริจาคประจำวัน 📋\n\n📌 รหัสตู้: ${boxId}\n📊 สถานะระบบ: ${statusEmoji} ${statusText}\n⏰ เวลาตรวจสอบ: ${timeString}\n\n${statusSummary === "SUCCESS" ? "ระบบและเซ็นเซอร์ทั้งหมดพร้อมใช้งานปกติครับ" : "🚨 โปรดเข้าตรวจสอบสภาพกล่องเซ็นเซอร์และอุปกรณ์ทันที!"}`;

    try {
        const db = admin.firestore();
        const usersSnapshot = await db.collection("Users").where("isApproved", "==", true).get();
        if (usersSnapshot.empty) {
            console.log(">>> [DAILY_CHECK_EVENT] No approved users found to notify.");
            return;
        }

        const pushPromises = [];
        usersSnapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            const userId = userData.lineId || userDoc.id;

            if (userId && userId.startsWith("U") && userId.length >= 33) {
                console.log(`>>> [DAILY_CHECK_EVENT] Sending daily hardware check to: ${userData.name} (${userId})`);
                pushPromises.push(
                    client.pushMessage({
                        to: userId,
                        messages: [{ type: "text", text: messageText }]
                    }).then(res => {
                        console.log(`>>> [DAILY_CHECK_EVENT] Successfully sent daily report to ${userData.name}`);
                        return res;
                    }).catch(err => {
                        console.error(`>>> [DAILY_CHECK_EVENT] Failed to send daily report to ${userData.name}:`, err.message);
                    })
                );
            }
        });

        await Promise.all(pushPromises);
        console.log(">>> [DAILY_CHECK_EVENT] Finished processing daily hardware check notifications.");
    } catch (error) {
        console.error(">>> [DAILY_CHECK_EVENT] Error in notifyDailyHardwareCheck:", error);
    }
});

// ฟังก์ชันตรวจสอบตู้ออฟไลน์อัตโนมัติ (ทุกวัน 19:30 น.)
// ถ้า DailyHardwareCheck ของวันนี้ไม่มี → แจ้งเตือนว่าตู้อาจไม่มีไฟเลี้ยง
exports.checkBoxOffline = onSchedule({
    schedule: "30 19 * * *",
    timeZone: "Asia/Bangkok",
    region: "asia-southeast1"
}, async (event) => {
    console.log(">>> [OFFLINE_CHECK] เริ่มตรวจสอบตู้ออฟไลน์ประจำวัน...");
    
    const db = admin.firestore();
    
    // สร้าง doc ID ของวันนี้ (format: box1_YYYY-MM-DD)
    const now = new Date();
    const bangkokTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const year = bangkokTime.getFullYear();
    const month = String(bangkokTime.getMonth() + 1).padStart(2, "0");
    const day = String(bangkokTime.getDate()).padStart(2, "0");
    const todayDocId = `box1_${year}-${month}-${day}`;
    
    try {
        // 1. เช็คว่ามี DailyHardwareCheck ของวันนี้หรือไม่
        const checkDoc = await db.collection("DailyHardwareCheck").doc(todayDocId).get();
        
        if (checkDoc.exists) {
            console.log(`>>> [OFFLINE_CHECK] พบรายงานสุขภาพของวันนี้ (${todayDocId}) - ตู้ออนไลน์ปกติ`);
            return;
        }
        
        // 2. เช็ค heartbeat ล่าสุด
        const heartbeatDoc = await db.collection("HardwareHeartbeat").doc("box1").get();
        let lastSeenText = "ไม่ทราบ";
        if (heartbeatDoc.exists && heartbeatDoc.data().lastSeen) {
            const lastSeen = heartbeatDoc.data().lastSeen.toDate();
            lastSeenText = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(lastSeen);
        }
        
        console.log(`>>> [OFFLINE_CHECK] ⚠️ ไม่พบรายงานสุขภาพของวันนี้ (${todayDocId}) - ตู้อาจออฟไลน์!`);
        
        // 3. บันทึก DailyHardwareCheck เป็นสถานะ OFFLINE พร้อมรายละเอียดเซ็นเซอร์
        const sensorData = heartbeatDoc.exists ? heartbeatDoc.data() : {};
        const wifiOk = sensorData.wifi === "online";
        const coinOk = sensorData.coin === "online";
        const vibOk = sensorData.vib === "online";
        
        const failedSystems = [];
        if (!wifiOk) failedSystems.push("WiFi / Internet");
        if (!coinOk) failedSystems.push("เซ็นเซอร์นับเหรียญ");
        if (!vibOk) failedSystems.push("เซ็นเซอร์สั่นสะเทือน");
        failedSystems.push("การเชื่อมต่อเซิร์ฟเวอร์");

        await db.collection("DailyHardwareCheck").doc(todayDocId).set({
            boxId: "box1",
            statusSummary: "OFFLINE",
            checkTime: admin.firestore.FieldValue.serverTimestamp(),
            source: "auto_offline_check",
            sensors: {
                wifi: sensorData.wifi || "offline",
                coin: sensorData.coin || "offline",
                vib: sensorData.vib || "offline"
            },
            failedSystems: failedSystems,
            note: `ตู้ไม่ได้ส่งรายงานสุขภาพประจำวัน | สัญญาณล่าสุด: ${lastSeenText}`
        });
        console.log(`>>> [OFFLINE_CHECK] บันทึก DailyHardwareCheck สถานะ OFFLINE สำหรับ ${todayDocId}`);
        
        // 4. สร้าง Alert อัตโนมัติ
        await db.collection("Alerts").add({
            type: "ตู้ไม่ตอบสนอง",
            message: `ตู้บริจาค box1 ไม่ได้ส่งรายงานสุขภาพประจำวัน (19:00 น.) อาจไม่มีไฟเลี้ยงหรือระบบขัดข้อง | สัญญาณล่าสุด: ${lastSeenText}`,
            severity: "สูง",
            category: "ระบบออฟไลน์",
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 4. แจ้งเตือนผ่าน LINE
        const messageText = `🔴 แจ้งเตือน: ตู้บริจาคไม่ตอบสนอง\n\n📌 รหัสตู้: box1\n⚠️ สถานะ: ไม่ได้ส่งรายงานสุขภาพประจำวัน (19:00 น.)\n📡 สัญญาณล่าสุด: ${lastSeenText}\n\n🔧 สาเหตุที่เป็นไปได้:\n• ไม่มีไฟเลี้ยง (ไฟดับ)\n• WiFi ขาดการเชื่อมต่อ\n• บอร์ดค้างหรือรีสตาร์ท\n\nโปรดตรวจสอบสภาพตู้โดยเร็ว!`;
        
        const usersSnapshot = await db.collection("Users").where("isApproved", "==", true).get();
        
        if (!usersSnapshot.empty) {
            const pushPromises = [];
            usersSnapshot.forEach((userDoc) => {
                const userData = userDoc.data();
                const userId = userData.lineId || userDoc.id;
                
                if (userId && userId.startsWith("U") && userId.length >= 33) {
                    pushPromises.push(
                        client.pushMessage({
                            to: userId,
                            messages: [{ type: "text", text: messageText }]
                        }).catch(err => {
                            console.error(`>>> [OFFLINE_CHECK] Failed to notify ${userData.name}:`, err.message);
                        })
                    );
                }
            });
            
            await Promise.all(pushPromises);
        }
        
        console.log(">>> [OFFLINE_CHECK] แจ้งเตือนตู้ออฟไลน์เรียบร้อย");
    } catch (error) {
        console.error(">>> [OFFLINE_CHECK] Error:", error);
    }
});

// ฟังก์ชันตรวจสอบ Heartbeat ทุก 10 นาที
// ถ้าตู้ขาดการเชื่อมต่อเกิน 10 นาที → ส่ง LINE แจ้งเตือนเจ้าอาวาส (แจ้งครั้งเดียวจนกว่าจะกลับมาออนไลน์)
exports.monitorHeartbeat = onSchedule({
    schedule: "*/10 * * * *",
    timeZone: "Asia/Bangkok",
    region: "asia-southeast1"
}, async (event) => {
    const db = admin.firestore();
    const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 นาที

    try {
        const heartbeatDoc = await db.collection("HardwareHeartbeat").doc("box1").get();

        if (!heartbeatDoc.exists || !heartbeatDoc.data().lastSeen) {
            console.log(">>> [HEARTBEAT_MONITOR] ไม่พบข้อมูล heartbeat");
            return;
        }

        const data = heartbeatDoc.data();
        const lastSeen = data.lastSeen.toDate();
        const diffMs = Date.now() - lastSeen.getTime();
        const isOffline = diffMs > OFFLINE_THRESHOLD_MS;
        const alreadyNotified = data.offlineNotified === true;

        if (isOffline && !alreadyNotified) {
            // ตู้ออฟไลน์และยังไม่ได้แจ้ง → ส่ง LINE แจ้งเตือน
            const lastSeenText = new Intl.DateTimeFormat("th-TH", {
                dateStyle: "long",
                timeStyle: "medium",
                timeZone: "Asia/Bangkok"
            }).format(lastSeen);

            const diffMinutes = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMinutes / 60);
            let durationText = "";
            if (diffHours > 0) {
                durationText = `${diffHours} ชั่วโมง ${diffMinutes % 60} นาที`;
            } else {
                durationText = `${diffMinutes} นาที`;
            }

            const messageText = `🔴 แจ้งเตือน: ตู้บริจาคขาดการเชื่อมต่อ\n\n📌 รหัสตู้: box1\n⏰ สัญญาณล่าสุด: ${lastSeenText}\n⏳ ขาดหายไปแล้ว: ${durationText}\n\n🔧 สาเหตุที่เป็นไปได้:\n• ไฟฟ้าดับ / ไม่มีไฟเลี้ยง\n• WiFi ขัดข้อง\n• บอร์ดค้างหรือรีสตาร์ท\n\nโปรดตรวจสอบสภาพตู้บริจาคโดยเร็ว!`;

            console.log(`>>> [HEARTBEAT_MONITOR] ⚠️ ตู้ออฟไลน์! สัญญาณล่าสุด: ${lastSeenText} (ขาดหาย ${durationText})`);

            // ตั้ง flag ว่าแจ้งเตือนแล้ว (จะไม่แจ้งซ้ำจนกว่าตู้จะกลับมา)
            await db.collection("HardwareHeartbeat").doc("box1").update({
                offlineNotified: true,
                offlineNotifiedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // ส่ง LINE แจ้งเตือนผู้ใช้ที่ approved ทุกคน
            const usersSnapshot = await db.collection("Users").where("isApproved", "==", true).get();
            if (!usersSnapshot.empty) {
                const pushPromises = [];
                usersSnapshot.forEach((userDoc) => {
                    const userData = userDoc.data();
                    const userId = userData.lineId || userDoc.id;
                    if (userId && userId.startsWith("U") && userId.length >= 33) {
                        console.log(`>>> [HEARTBEAT_MONITOR] ส่งแจ้งเตือนไปที่: ${userData.name} (${userId})`);
                        pushPromises.push(
                            client.pushMessage({
                                to: userId,
                                messages: [{ type: "text", text: messageText }]
                            }).catch(err => {
                                console.error(`>>> [HEARTBEAT_MONITOR] ส่งไม่สำเร็จ ${userData.name}:`, err.message);
                            })
                        );
                    }
                });
                await Promise.all(pushPromises);
            }

            // สร้าง Alert ด้วย
            await db.collection("Alerts").add({
                type: "ตู้ขาดการเชื่อมต่อ",
                message: `ตู้บริจาค box1 ขาดการเชื่อมต่อตั้งแต่ ${lastSeenText} (ขาดหาย ${durationText})`,
                severity: "สูง",
                category: "ระบบออฟไลน์",
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(">>> [HEARTBEAT_MONITOR] ส่งแจ้งเตือนตู้ออฟไลน์เรียบร้อย");

        } else if (!isOffline && alreadyNotified) {
            // ตู้กลับมาออนไลน์แล้ว → รีเซ็ต flag
            await db.collection("HardwareHeartbeat").doc("box1").update({
                offlineNotified: false
            });
            console.log(">>> [HEARTBEAT_MONITOR] ✅ ตู้กลับมาออนไลน์แล้ว - รีเซ็ต flag");

        } else if (isOffline && alreadyNotified) {
            console.log(">>> [HEARTBEAT_MONITOR] ตู้ยังออฟไลน์อยู่ (แจ้งเตือนไปแล้ว)");
        } else {
            console.log(">>> [HEARTBEAT_MONITOR] ✅ ตู้ออนไลน์ปกติ");
        }

    } catch (error) {
        console.error(">>> [HEARTBEAT_MONITOR] Error:", error);
    }
});
