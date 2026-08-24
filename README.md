# 🪙 ระบบตู้บริจาคเงินอัจฉริยะ (Smart Safe Box & Donation Dashboard)

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%26%20Functions-FFCA28?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![LINE](https://img.shields.io/badge/LINE-Messaging%20API-00B900?style=flat-square&logo=line)](https://developers.line.biz/)

เว็บแอปพลิเคชันและระบบบริหารจัดการ **ตู้บริจาคเงินอัจฉริยะ (Smart Safe Box)** แบบเรียลไทม์ เชื่อมต่อข้อมูลระหว่างอุปกรณ์ฮาร์ดแวร์ IoT, ระบบคลาวด์ Firebase และระบบแจ้งเตือนผ่านแอปพลิเคชัน LINE Official Account ช่วยให้ผู้ดูแลระบบและเจ้าหน้าที่สามารถติดตามยอดเงินบริจาค ตรวจสอบสถานะอุปกรณ์ และรับการแจ้งเตือนความปลอดภัยได้ทันที

---

## 🌟 ฟีเจอร์หลัก (Key Features)

- 📊 **Real-Time Donation Dashboard**: แสดงยอดเงินบริจาครวม ยอดเงินรายวัน/รายสัปดาห์/รายเดือน พร้อมกราฟสถิติต่าง ๆ แบบเรียลไทม์ และอนิเมชันฉลองยอดบริจาค (Confetti)
- 🛡️ **IoT Hardware Status Monitoring**: ตรวจสอบสถานะการเชื่อมต่อฮาร์ดแวร์แบบ Live Sync เช่น สัญญาณ Wi-Fi, เครื่องรับเหรียญ, เซนเซอร์สั่นสะเทือน (Vibration Sensor) และสถานะการเปิด-ปิดประตูตู้
- 📜 **Donation History & Receipt Generator**: ดูประวัติการบริจาค ค้นหา ย้อนหลัง และสร้างเอกสารใบเสร็จ/อนุโมทนาบัตรสำหรับลดหย่อนภาษี พร้อมแปลงยอดเงินเป็นตัวอักษรภาษาไทยอัตโนมัติ
- 🚨 **Security Alerts & Audit Logging**: ระบบแจ้งเตือนภัยความปลอดภัยทันทีเมื่อพบการสั่นสะเทือนผิดปกติ การงัดแงะ หรืออุปกรณ์หลุดการเชื่อมต่อ พร้อมบันทึก Logs กิจกรรมของผู้ใช้งานในระบบ
- 🔐 **Role-Based Access Control (RBAC)**: ระบบจัดการผู้ดูแลแบ่งตามระดับสิทธิ์ (SuperAdmin และ Staff) ป้องกันการเข้าถึงส่วนสำคัญและต้องการอนุมัติจาก SuperAdmin
- 💬 **LINE Messaging API & Rich Menu**: แจ้งเตือนยอดบริจาคและเตือนภัยผ่าน LINE Flex Messages พร้อมการสลับสิทธิ์ปุ่มเมนูด่วน (Rich Menu) อัตโนมัติสำหรับ SuperAdmin

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

### Frontend
- **Framework & Libraries**: [React 19](https://react.dev/), [Vite 8](https://vitejs.dev/)
- **Styling**: Vanilla CSS3 (Custom Glassmorphism Design, Responsive CSS Grid & Flexbox)
- **Data Visualization & Icons**: [Recharts](https://recharts.org/) (กราฟสถิติ), [Lucide React](https://lucide.dev/) (ชุดไอคอน UI)
- **UI Enhancements**: `canvas-confetti` (อนิเมชันเอฟเฟกต์)

### Backend & Cloud Infrastructure
- **Database**: [Firebase Cloud Firestore](https://firebase.google.com/docs/firestore) (NoSQL Real-time Data Syncing)
- **Serverless Backend**: [Firebase Cloud Functions v2](https://firebase.google.com/docs/functions) (Node.js runtime)
- **Integration**: LINE Messaging API (Flex Messages, Webhooks, Dynamic Rich Menu Binding)

---

## 📂 โครงสร้างโปรเจกต์ (Project Structure)

```
Smart Safe box/
├── public/                 # Static assets
├── src/                    # Frontend React Application Source Code
│   ├── assets/             # Images and graphic assets
│   ├── components/         # UI Component modules
│   ├── utils/              # Helper utilities (e.g. Bahttext conversion)
│   ├── App.css             # Main styling system & layout rules
│   ├── App.jsx             # Main Router & State Management
│   ├── firebase.js         # Firebase Client SDK Configuration
│   ├── index.css           # Global typography & resets
│   └── main.jsx            # React Entry point
├── functions/              # Serverless Backend (Firebase Cloud Functions)
│   ├── index.js            # Cloud Functions (Webhook, Triggers, Notifications)
│   ├── create_richmenu.js # LINE Rich Menu setup script
│   ├── list_richmenus.js   # LINE Rich Menu inspection script
│   └── trigger_switch.js   # Test triggers script
├── firebase.json           # Firebase Hosting & Functions config
├── vite.config.js          # Vite build config
└── package.json            # Frontend dependencies & scripts
```

---

## 💻 หน้าที่ของคอมโพเนนต์และสคริปต์ (Components & Functions Overview)

### 🎨 Frontend Components (`src/`)

| คอมโพเนนต์ / ไฟล์ | รายละเอียดหน้าที่การทำงาน |
| :--- | :--- |
| **[App.jsx](file:///c:/Portfolio/Smart%20Safe%20box/src/App.jsx)** | ศูนย์กลางการสลับหน้า (Navigation Tab), URL Parameter Syncing และการสืบค้นสิทธิ์ผู้ใช้จาก Firestore |
| **[Header.jsx](file:///c:/Portfolio/Smart%20Safe%20box/src/components/Header.jsx)** | แสดงส่วนหัวของเว็บ แสดงการทักทายผู้ใช้ เมนูนำทาง และสถานะสิทธิ์ในปัจจุบัน |
| **[Dashboard.jsx](file:///c:/Portfolio/Smart%20Safe%20box/src/components/Dashboard.jsx)** | สรุปยอดบริจาครวม กราฟแนวโน้ม (Daily/Weekly/Monthly), ความคืบหน้าเป้าหมาย และรายการบริจาคล่าสุด |
| **[Status.jsx](file:///c:/Portfolio/Smart%20Safe%20box/src/components/Status.jsx)** | ตรวจสอบสถานะการทำงานฮาร์ดแวร์ IoT สัญญาณ Wi-Fi สถานะเหรียญ และสวิตช์ความปลอดภัย |
| **[History.jsx](file:///c:/Portfolio/Smart%20Safe%20box/src/components/History.jsx)** | แสดงตารางประวัติบริจาค ค้นหา/กรองตามวันที่ และเปิดโมดัลออกเอกสารสิทธิประโยชน์ภาษี |
| **[TaxDocumentModal.jsx](file:///c:/Portfolio/Smart%20Safe%20box/src/components/TaxDocumentModal.jsx)** | โมดัลสำหรับแสดงตัวอย่างและสั่งพิมพ์ใบเสร็จรับเงิน/เอกสารลดหย่อนภาษี |
| **[Alerts.jsx](file:///c:/Portfolio/Smart%20Safe%20box/src/components/Alerts.jsx)** | หน้าจัดการประวัติการแจ้งเตือนความผิดปกติ การงัดแงะ หรือการสั่นสะเทือน |
| **[Logs.jsx](file:///c:/Portfolio/Smart%20Safe%20box/src/components/Logs.jsx)** | บันทึกประวัติกิจกรรมในระบบ (Audit Trail Log) เช่น การเข้าสู่ระบบ การปรับเปลี่ยนการตั้งค่า |
| **[Admins.jsx](file:///c:/Portfolio/Smart%20Safe%20box/src/components/Admins.jsx)** | หน้าจัดการผู้ใช้งานระบบ การกำหนดบทบาท (SuperAdmin / Staff) และอนุมัติผู้ใช้งานใหม่ |
| **[thaiBaht.js](file:///c:/Portfolio/Smart%20Safe%20box/src/utils/thaiBaht.js)** | ยูทิลิตีแปลงจำนวนเงินตัวเลขให้เป็นตัวอักษรภาษาไทย (บาทถ้วน) สำหรับออกเอกสารภาษี |

---

### ⚙️ Serverless Backend & Scripts (`functions/`)

| สคริปต์ / Trigger | รายละเอียดหน้าที่การทำงาน |
| :--- | :--- |
| **[index.js](file:///c:/Portfolio/Smart%20Safe%20box/functions/index.js)** | รวม Cloud Functions หลัก: <br>• `lineWebhook`: รับ Event จาก LINE และสลับ Rich Menu ตามบทบาท <br>• `notifyUserApproval`: แจ้งเตือนผ่าน LINE เมื่อผู้ใช้ได้รับการอนุมัติสิทธิ์ <br>• `updateTotalDonation`: คำนวณสรุปยอดบริจาครวมอัตโนมัติ <br>• `notifySecurityAlert`: ส่ง LINE Flex Message เตือนภัยความปลอดภัยทันที <br>• `notifyDailyHardwareCheck`: แจ้งเตือนสรุปสถานะอุปกรณ์รายวัน |
| **[create_richmenu.js](file:///c:/Portfolio/Smart%20Safe%20box/functions/create_richmenu.js)** | สคริปต์สเกลาร์สำหรับสร้างและอัปโหลดรูปภาพ LINE Rich Menu สำหรับ SuperAdmin |
| **[list_richmenus.js](file:///c:/Portfolio/Smart%20Safe%20box/functions/list_richmenus.js)** | สคริปต์ตรวจสอบรายการ Rich Menu ID ทั้งหมดในระบบ LINE Official Account |
| **[trigger_switch.js](file:///c:/Portfolio/Smart%20Safe%20box/functions/trigger_switch.js)** | สคริปต์ทดสอบการส่งสัญญาณหรือจำลอง Event สวิตช์ฮาร์ดแวร์ |

---

## 🚀 การติดตั้งและเปิดใช้งาน (Installation & Setup)

### 1. Requirements
- Node.js (v18 ขึ้นไป)
- Firebase CLI (`npm install -g firebase-tools`)

### 2. Frontend Installation
```bash
# ติดตั้ง dependencies ฝั่ง Frontend
npm install

# รัน Development Server
npm run dev
```

### 3. Backend (Firebase Functions) Setup
```bash
# เข้าไปยังโฟลเดอร์ functions และติดตั้ง dependencies
cd functions
npm install

# ตั้งค่า Environment Variables ใน functions/.env
LINE_CHANNEL_ACCESS_TOKEN="YOUR_LINE_CHANNEL_ACCESS_TOKEN"
LINE_CHANNEL_SECRET="YOUR_LINE_CHANNEL_SECRET"
SUPER_ADMIN_RICH_MENU_ID="YOUR_SUPER_ADMIN_RICH_MENU_ID"
```

### 4. Deploying to Firebase
```bash
# ล็อกอินเข้าใช้งาน Firebase
firebase login

# Deploy ทั้งหมด (Hosting, Firestore Rules, Functions)
firebase deploy

# หรือ Deploy เฉพาะ Cloud Functions
firebase deploy --only functions
```

---

## 📝 License & Author

พัฒนาโดยทีมงานระบบตู้บริจาคเงินอัจฉริยะ (Smart Safe Box Team)  
สงวนลิขสิทธิ์ © 2026 Smart Safe Box Project
