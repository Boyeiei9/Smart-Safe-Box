import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

export default function Header() {
  const [boxStatus, setBoxStatus] = useState({
    statusDot: 'gray',
    statusText: 'กำลังเชื่อมต่อ...',
    errorCount: 0
  });

  useEffect(() => {
    const docRef = doc(db, 'Donation_Box', 'box1');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      let errorCount = 0;
      let data = {};
      if (docSnap.exists()) {
        data = docSnap.data();
      }

      const wifiStatus = data.wifi || 'online';
      const coinStatus = data.coin || 'online';
      const vibStatus = data.vib || 'online';

      if (wifiStatus !== 'online') errorCount++;
      if (coinStatus !== 'online') errorCount++;
      if (vibStatus !== 'online') errorCount++;

      setBoxStatus({
        statusDot: errorCount === 0 ? 'green' : 'red',
        statusText: errorCount === 0 ? 'สถานะ: ปกติทั้งหมด' : `สถานะ: พบปัญหา ${errorCount} จุด`,
        errorCount: errorCount
      });
    }, (error) => {
      console.error('Error fetching box status:', error);
      setBoxStatus({
        statusDot: 'red',
        statusText: 'ตัดการเชื่อมต่อฐานข้อมูล',
        errorCount: 1
      });
    });

    return () => unsubscribe();
  }, []);

  return (
    <header className="top-header">
      <div className="header-left">
        <h1>ระบบตู้บริจาคเงินอัจฉริยะ</h1>
        <p>ระบบตรวจสอบข้อมูลและการแจ้งเตือนแบบเรียลไทม์</p>
      </div>
      <div className="header-right">
        <div className="status-indicator">
          <div className={`status-dot ${boxStatus.statusDot}`} />
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {boxStatus.errorCount === 0 ? (
              <ShieldCheck size={16} className="text-indigo" style={{ verticalAlign: 'middle' }} />
            ) : (
              <ShieldAlert size={16} className="text-rose" style={{ verticalAlign: 'middle' }} />
            )}
            {boxStatus.statusText}
          </span>
        </div>
      </div>
    </header>
  );
}
