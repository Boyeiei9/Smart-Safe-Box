import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

export default function Header() {
  const [boxStatus, setBoxStatus] = useState({
    statusDot: 'red',
    statusText: 'สถานะ: ตู้ออฟไลน์',
    errorCount: 1
  });
  const [lastHeartbeatData, setLastHeartbeatData] = useState(null);

  const evaluateStatus = (data) => {
    if (!data || !data.lastSeen) {
      setBoxStatus({
        statusDot: 'red',
        statusText: 'สถานะ: ตู้ออฟไลน์',
        errorCount: 1
      });
      return;
    }

    const lastSeenDate = data.lastSeen.toDate ? data.lastSeen.toDate() : new Date(data.lastSeen);
    const diffMs = Date.now() - lastSeenDate.getTime();
    const isOnline = diffMs < 10 * 60 * 1000; // 10 นาที

    if (!isOnline) {
      setBoxStatus({
        statusDot: 'red',
        statusText: 'สถานะ: ตู้ออฟไลน์',
        errorCount: 1
      });
      return;
    }

    let errorCount = 0;
    const wifiStatus = data.wifi || 'offline';
    const coinStatus = data.coin || 'offline';
    const vibStatus = data.vib || 'offline';

    if (wifiStatus !== 'online') errorCount++;
    if (coinStatus !== 'online') errorCount++;
    if (vibStatus !== 'online') errorCount++;

    setBoxStatus({
      statusDot: errorCount === 0 ? 'green' : 'red',
      statusText: errorCount === 0 ? 'สถานะ: ปกติทั้งหมด' : `สถานะ: พบปัญหา ${errorCount} จุด`,
      errorCount: errorCount
    });
  };

  useEffect(() => {
    const docRef = doc(db, 'HardwareHeartbeat', 'box1');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLastHeartbeatData(data);
        evaluateStatus(data);
      } else {
        setLastHeartbeatData(null);
        evaluateStatus(null);
      }
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

  // เช็ค timeout ทุก 1 นาที
  useEffect(() => {
    const timer = setInterval(() => {
      if (lastHeartbeatData) {
        evaluateStatus(lastHeartbeatData);
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [lastHeartbeatData]);

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
