/**
 * สคริปต์ย้ายข้อมูล Firestore: เปลี่ยนชื่อ Collection
 * ใช้ Firebase Web SDK + Email/Password Auth (ไม่ต้อง Service Account)
 * 
 * ย้าย:
 *   1. Donation        → DonationLogs      (รายการบริจาคแต่ละครั้ง)
 *   2. donation/total   → DonationTotal/total (ยอดเงินรวม)
 *   3. ลบ Donation_Box (ย้ายไป BoxStatus แล้ว)
 * 
 * วิธีรัน: node migrate_collections.js
 * ลบของเก่า: node migrate_collections.js --cleanup
 */

const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, getDoc, setDoc, deleteDoc, writeBatch } = require("firebase/firestore");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");

const firebaseConfig = {
    projectId: "smart-donate-box",
    appId: "1:522734213970:web:7d2650a34dda339c61b88b",
    storageBucket: "smart-donate-box.firebasestorage.app",
    apiKey: "AIzaSyA7Ky42I-GR_ycUga2Gl75Cjjl56GlAnSY",
    authDomain: "smart-donate-box.firebaseapp.com",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function migrateCollection(oldName, newName) {
    console.log(`\n📦 กำลังย้าย "${oldName}" → "${newName}"...`);
    
    const snapshot = await getDocs(collection(db, oldName));
    
    if (snapshot.empty) {
        console.log(`   ⚠️  Collection "${oldName}" ว่างเปล่า ข้ามไป`);
        return 0;
    }

    let count = 0;
    const batchSize = 450;
    const allDocs = [];
    
    snapshot.forEach((docSnap) => {
        allDocs.push({ id: docSnap.id, data: docSnap.data() });
    });

    for (let i = 0; i < allDocs.length; i += batchSize) {
        const chunk = allDocs.slice(i, i + batchSize);
        const batch = writeBatch(db);
        
        chunk.forEach((item) => {
            const newDocRef = doc(db, newName, item.id);
            batch.set(newDocRef, item.data);
            count++;
        });

        await batch.commit();
        console.log(`   ✅ batch ${Math.floor(i / batchSize) + 1}: ย้ายแล้ว ${count} documents`);
    }

    console.log(`   ✅ ย้ายสำเร็จทั้งหมด ${count} documents`);
    return count;
}

async function migrateSingleDoc(oldCollection, docId, newCollection) {
    console.log(`\n📄 กำลังย้าย "${oldCollection}/${docId}" → "${newCollection}/${docId}"...`);
    
    const docSnap = await getDoc(doc(db, oldCollection, docId));
    
    if (!docSnap.exists()) {
        console.log(`   ⚠️  Document "${oldCollection}/${docId}" ไม่พบ ข้ามไป`);
        return false;
    }

    const data = docSnap.data();
    await setDoc(doc(db, newCollection, docId), data);
    console.log(`   ✅ ย้ายสำเร็จ`);
    console.log(`   📊 ข้อมูล:`, JSON.stringify(data, null, 2));
    return true;
}

async function deleteCollectionDocs(collectionName) {
    console.log(`\n🗑️  กำลังลบ "${collectionName}"...`);
    
    const snapshot = await getDocs(collection(db, collectionName));
    
    if (snapshot.empty) {
        console.log(`   ⚠️  Collection "${collectionName}" ว่างเปล่า ไม่ต้องลบ`);
        return;
    }

    const batch = writeBatch(db);
    let count = 0;
    snapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
        count++;
    });

    await batch.commit();
    console.log(`   ✅ ลบสำเร็จ ${count} documents`);
}

async function main() {
    console.log("🔐 กำลัง Login ด้วย device_box1@smartbox.com...");
    await signInWithEmailAndPassword(auth, "device_box1@smartbox.com", "password1234");
    console.log("✅ Login สำเร็จ!\n");

    console.log("🚀 เริ่มการย้ายข้อมูล Firestore...");
    console.log("==========================================");

    // 1. ย้าย Donation → DonationLogs
    const donationCount = await migrateCollection("Donation", "DonationLogs");

    // 2. ย้าย donation/total → DonationTotal/total
    const totalMigrated = await migrateSingleDoc("donation", "total", "DonationTotal");

    console.log("\n==========================================");
    console.log("📋 สรุปผลการย้ายข้อมูล:");
    console.log(`   • Donation → DonationLogs: ${donationCount} รายการ`);
    console.log(`   • donation/total → DonationTotal/total: ${totalMigrated ? "สำเร็จ" : "ข้ามไป"}`);

    // ถ้ามี argument --cleanup ให้ลบ collection เก่า
    if (process.argv.includes("--cleanup")) {
        console.log("\n🧹 โหมดลบข้อมูลเก่า...");
        await deleteCollectionDocs("Donation");
        await deleteCollectionDocs("donation");
        await deleteCollectionDocs("Donation_Box");
        console.log("\n✅ ลบ collection เก่าทั้งหมดเรียบร้อย!");
    } else {
        console.log("\n⚠️  ขั้นตอนถัดไป:");
        console.log("   1. ตรวจสอบข้อมูลใน collection ใหม่ผ่าน Firebase Console");
        console.log("   2. ถ้าข้อมูลถูกต้อง ให้รัน:");
        console.log("      node migrate_collections.js --cleanup");
    }
    
    console.log("==========================================\n");
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ เกิดข้อผิดพลาด:", err.message);
    process.exit(1);
});
