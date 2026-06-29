# 🪙 ระบบตู้บริจาคเงินอัจฉริยะ (Smart Donation Box Dashboard)

ภาพรวมและสรุปโครงสร้างสถาปัตยกรรม เทคโนโลยี นวัตกรรม และหน้าที่ของแต่ละส่วนภายในโปรเจกต์ **ระบบตู้บริจาคเงินอัจฉริยะ**

---

## 🛠️ 1. ภาษาที่ใช้ในการพัฒนา (Languages Used)

* **HTML5**: กำหนดโครงสร้างหลักของหน้าเว็บแอปพลิเคชัน ([index.html](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/index.html))
* **CSS3 (Vanilla CSS)**: การตกแต่ง ออกแบบ Responsive Design จัดเลย์เอาต์ (Flexbox/Grid), Variables และ Animations ([App.css](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/src/App.css), [index.css](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/src/index.css))
* **JavaScript (ES6+) / JSX**: ภาษาหลักที่ใช้ในการเขียน logic โครงสร้างคอมโพเนนต์ React (`.jsx`) และ Serverless Functions / Node.js (`.js`)

---

## 🚀 2. นวัตกรรม เทคโนโลยี และไลบรารีที่ใช้ (Innovations & Technologies)

* **React 19**: Frontend Framework หลักสำหรับสร้าง User Interface แบบ Single Page Application (SPA) ที่ทำงานรวดเร็วและตอบสนองแบบ Component-based
* **Vite 8**: Next-generation Build Tool ที่ช่วยให้การพัฒนาเว็บ (Development) และการบิวด์ระบบ (Build Process) เป็นไปอย่างรวดเร็วด้วย HMR (Hot Module Replacement)
* **Firebase Ecosystem (Cloud Backend)**:
  * **Firebase Cloud Firestore**: ระบบฐานข้อมูล NoSQL แบบ Real-time ที่ช่วยให้ข้อมูลยอดเงิน สถานะตู้ และการแจ้งเตือน อัปเดตไปยังหน้าจอแดชบอร์ดทันทีโดยไม่ต้องกด Refresh หน้าเว็บ (`onSnapshot`)
  * **Firebase Cloud Functions (Node.js)**: ระบบ Serverless Backend สำหรับรับส่งข้อมูล Webhook, คำนวณตรรกะฝั่งเซิร์ฟเวอร์ และเชื่อมต่อการทำงานกับภายนอก
* **LINE Messaging API & LINE Rich Menu Integration**: นวัตกรรมการเชื่อมต่อระบบแจ้งเตือนและเมนูการควบคุมตู้บริจาคผ่านแอปพลิเคชัน LINE (จัดกลุ่มสิทธิ์ SuperAdmin / Staff)
* **Recharts**: ไลบรารีสำหรับสร้างกราฟแสดงสถิตียอดเงินบริจาคแบบ Interactive ซัพพอร์ตการดูข้อมูลแบบ daily/weekly/monthly
* **Lucide React & FontAwesome**: ชุดไอคอนกราฟิกสมัยใหม่ เพิ่มความสวยงามและใช้งานง่ายสำหรับ UX/UI
* **Canvas Confetti**: อนิเมชันแสดงความยินดีเพื่อเพิ่มเอฟเฟกต์การมีส่วนร่วมในแอปพลิเคชัน

---

## 📂 3. สรุปโครงสร้างและหน้าที่ของแต่ละส่วน (Project Structure & Component Roles)

```
web test/
├── public/                 # ไฟล์ทรัพยากรคงที่ (Static Assets)
├── src/                    # ซอร์สโค้ดหลักของระบบ Frontend (React)
│   ├── assets/             # ไฟล์สื่อและกราฟิกของ React
│   ├── components/         # คอมโพเนนต์หน้าจอย่อย
│   ├── App.jsx             # คอมโพเนนต์หลัก จัดการ Routing, Navigation & State
│   ├── App.css             # ไฟล์สไตล์หลักของแอปพลิเคชัน
│   ├── main.jsx            # Entry point ของ React
│   └── firebase.js         # ไฟล์เชื่อมต่อ Firebase SDK
├── functions/              # ซอร์สโค้ดระบบ Backend / Serverless (Firebase Functions)
├── index.html              # Entry point หลักของระบบ Vite
├── vite.config.js          # ไฟล์ตั้งค่าการบิวด์ของ Vite
└── package.json            # ไฟล์จัดการ Dependency และ Scripts
```

### 💻 3.1 ระบบ Frontend (`src/components/`)

| ไฟล์คอมโพเนนต์ | หน้าที่และรายละเอียดการทำงาน |
| :--- | :--- |
| **[Header.jsx](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/src/components/Header.jsx)** | แสดงส่วนหัวของระบบ ทักทายผู้ใช้งาน และแสดงข้อมูลสรุปเบื้องต้น |
| **[Dashboard.jsx](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/src/components/Dashboard.jsx)** | หน้าสรุปรายงานยอดเงินบริจาค (ยอดรวม, รายวัน, รายสัปดาห์, รายเดือน) พร้อมกราฟสถิติแบบเรียลไทม์ |
| **[Status.jsx](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/src/components/Status.jsx)** | หน้าตรวจสอบสถานะฮาร์ดแวร์ตู้บริจาคแบบ Live Sync (สัญญาณ WiFi, เครื่องรับเหรียญ, เซนเซอร์แรงสั่นสะเทือน) |
| **[History.jsx](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/src/components/History.jsx)** | หน้าบันทึกและแสดงประวัติการบริจาคเงินแต่ละรายการอย่างละเอียด |
| **[Alerts.jsx](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/src/components/Alerts.jsx)** | หน้าประวัติการแจ้งเตือนความผิดปกติของระบบ (เช่น แรงสั่นสะเทือนผิดปกติ, อุปกรณ์ขัดข้อง) |
| **[Logs.jsx](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/src/components/Logs.jsx)** | หน้าบันทึกประวัติการใช้งานตู้และการทำกิจกรรมต่าง ๆ ภายในระบบ |
| **[Admins.jsx](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/src/components/Admins.jsx)** | หน้าจัดการรายชื่อผู้ดูแลระบบและกำหนดสิทธิ์ผู้ใช้งาน (เข้าถึงได้เฉพาะสิทธิ์ SuperAdmin) |

---

### ⚙️ 3.2 ระบบ Backend & Automation (`functions/`)

| ไฟล์สคริปต์ | หน้าที่และรายละเอียดการทำงาน |
| :--- | :--- |
| **[index.js](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/functions/index.js)** | ศูนย์กลาง Firebase Cloud Functions จัดการ Webhook ตรวจสอบความถูกต้อง ส่งการแจ้งเตือนไปที่ LINE |
| **[create_richmenu.js](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/functions/create_richmenu.js)** | สคริปต์สำหรับสร้างและตั้งค่าปุ่มเมนูด่วน (Rich Menu) สำหรับ LINE Official Account |
| **[list_richmenus.js](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/functions/list_richmenus.js)** | สคริปต์ดึงและตรวจสอบรายการ Rich Menu ทั้งหมดที่มีอยู่ในระบบ LINE |
| **[trigger_switch.js](file:///c:/%E0%B8%A7%E0%B8%B1%E0%B8%94%E0%B9%82%E0%B8%84%E0%B8%81tiger/web%20test/functions/trigger_switch.js)** | สคริปต์สำหรับทดสอบ หรือสั่งสลับสวิตช์การทำงานของระบบ |
