const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { messagingApi } = require("@line/bot-sdk");

// Initialize Firebase Admin
admin.initializeApp();

// LINE SDK Configuration
const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};

// V10 Messaging API Client
const client = new messagingApi.MessagingApiClient({
    channelAccessToken: config.channelAccessToken
});

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
                                        text: "ระบบตู้บริจาคอัจฉริยะ วัดโคก",
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
                            const totalDoc = await admin.firestore().collection("donation").doc("total").get();
                            const currentAmount = totalDoc.exists ? (totalDoc.data().amount || 0) : 0;

                            // 2. Reset total amount
                            await admin.firestore().collection("donation").doc("total").set({
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
                            
                            await admin.firestore().collection("Users").doc(userId).set({ pendingAction: null }, { merge: true });
                            
                            const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });

                            return client.replyMessage({
                                replyToken: event.replyToken,
                                messages: [{ 
                                    type: "text", 
                                    text: `✅ ระบบได้ทำการรีเซ็ตยอดเงินในตู้เรียบร้อยแล้วครับ\n\n💰 ยอดเงินที่สรุปรอบนี้: ฿${currentAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท\n📅 วันเวลาที่รีเซ็ต: ${nowStr}\n📊 ยอดเงินในตู้ปัจจุบัน: ฿0.00\n(ประวัติการบริจาคเดิมยังคงถูกเก็บรักษาไว้)` 
                                }]
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
                                                uri: `https://smart-donate-box.web.app/?page=admins&userId=${userId}`
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
                    const statsDoc = await admin.firestore().collection("donation").doc("total").get();
                    const total = statsDoc.exists ? statsDoc.data().amount : 0;
                    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: `📊 ยอดเงินบริจาคในตู้ปัจจุบัน: ฿${total.toLocaleString()}` }] });
                }

                // 2. ดูประวัติการบริจาค
                const isHistoryCmd = ["ดูประวัติการบริจาค", "ประวัติการบริจาค", "ประวัติบริจาค", "ดูประวัติบริจาค"].includes(text) || textLower === "/history";
                if (isHistoryCmd) {
                    if (!permissions.viewDonationHistory) return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: "ขออภัย คุณไม่มีสิทธิ์เข้าถึงประวัติการบริจาคครับ" }] });
                    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: `ท่านสามารถดูรายละเอียดประวัติการบริจาคได้ที่นี่: \nhttps://smart-donate-box.web.app/?page=history&userId=${userId}` }] });
                }

                // 3. ดูรายงานยอดเงิน
                const isReportCmd = ["ดูรายงานยอดเงิน", "รายงานยอดเงิน", "ดูรายงาน", "รายงาน"].includes(text) || textLower === "/report";
                if (isReportCmd) {
                    if (!permissions.viewSummaryReport) return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: "ขออภัย คุณไม่มีสิทธิ์เข้าถึงรายงานสรุปครับ" }] });
                    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: `ท่านสามารถดูรายงานสรุปผลได้ที่นี่: \nhttps://smart-donate-box.web.app/?page=dashboard&userId=${userId}` }] });
                }

                // 4. ดูประวัติการใช้งานตู้
                const isLogsCmd = ["ดูประวัติการใช้งานตู้", "ดูประวัติการใช้งาน", "ประวัติการใช้งานตู้", "ประวัติการใช้งาน"].includes(text) || textLower === "/logs";
                if (isLogsCmd) {
                    if (!permissions.viewSystemLogs) return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: "ขออภัย คุณไม่มีสิทธิ์เข้าถึงประวัติการใช้งานตู้ครับ" }] });
                    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: `ท่านสามารถดูรายละเอียดประวัติการใช้งานตู้ได้ที่นี่: \nhttps://smart-donate-box.web.app/?page=logs&userId=${userId}` }] });
                }

                // 5. ดูสถานะของตู้
                const isStatusCmd = ["ดูสถานะของตู้", "ดูสถานะตู้", "สถานะของตู้", "สถานะตู้"].includes(text) || textLower === "/status";
                if (isStatusCmd) {
                    if (!permissions.viewBoxStatus) return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: "ขออภัย คุณไม่มีสิทธิ์เข้าถึงข้อมูลสถานะตู้ครับ" }] });
                    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "text", text: `ท่านสามารถตรวจสอบสถานะและเซ็นเซอร์ตู้ได้ที่นี่: \nhttps://smart-donate-box.web.app/?page=status&userId=${userId}` }] });
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

                        await admin.firestore().collection("Donation_Box").doc("box1").set({
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
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");

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
exports.updateTotalDonation = onDocumentCreated("Donation/{donationId}", async (event) => {
    const data = event.data.data();
    if (!data) {
        console.log(">>> [DONATION_EVENT] No data found in document.");
        return;
    }

    const amount = Number(data.amount) || 0;
    console.log(`>>> [DONATION_EVENT] New donation: ${event.params.donationId}, amount: ฿${amount}`);

    if (amount <= 0) return;

    const db = admin.firestore();
    const totalRef = db.collection("donation").doc("total");

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

    const isSecurity = data.category === "security";
    const isHigh = data.severity === "High";

    if (!isSecurity && !isHigh) {
        console.log(">>> [ALERT_EVENT] Alert is not a security incident or high severity. Skipping LINE push.");
        return;
    }

    const type = data.type || "เหตุผิดปกติ";
    const message = data.message || "ไม่มีรายละเอียดเหตุการณ์";
    const severity = data.severity || "Medium";

    let severityText = "ปานกลาง";
    if (severity === "High") {
        severityText = "🔴 สูงมาก (วิกฤต)";
    } else if (severity === "Medium") {
        severityText = "🟠 ปานกลาง";
    } else if (severity === "Low") {
        severityText = "🔵 ต่ำ";
    }

    let timeString = "";
    try {
        if (data.timestamp && typeof data.timestamp.toDate === "function") {
            timeString = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(data.timestamp.toDate());
        } else if (data.timestamp) {
            timeString = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.timestamp));
        } else {
            timeString = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
        }
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
        if (data.checkTime && typeof data.checkTime.toDate === "function") {
            timeString = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(data.checkTime.toDate());
        } else if (data.checkTime) {
            timeString = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.checkTime));
        } else {
            timeString = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
        }
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
