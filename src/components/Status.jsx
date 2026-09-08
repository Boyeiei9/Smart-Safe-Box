import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Wifi, Coins, AlertOctagon, CheckCircle2, ShieldAlert, Calendar, WifiOff, Clock } from 'lucide-react';

export default function Status() {
  const [sensors, setSensors] = useState({
    wifi: 'unknown',
    coin: 'unknown',
    vib: 'unknown'
  });
  const [lastSeen, setLastSeen] = useState(null);
  const [isBoxOnline, setIsBoxOnline] = useState(false);

  const [dailyChecks, setDailyChecks] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(true);

  // Subscribe to HardwareHeartbeat (สถานะเซ็นเซอร์จริงจาก Arduino)
  useEffect(() => {
    const docRef = doc(db, 'HardwareHeartbeat', 'box1');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSensors({
          wifi: data.wifi || 'offline',
          coin: data.coin || 'offline',
          vib: data.vib || 'offline'
        });

        // เช็คว่าตู้ออนไลน์หรือไม่ (lastSeen ไม่เกิน 10 นาที)
        if (data.lastSeen) {
          const lastSeenDate = data.lastSeen.toDate();
          setLastSeen(lastSeenDate);
          const diffMs = Date.now() - lastSeenDate.getTime();
          setIsBoxOnline(diffMs < 10 * 60 * 1000); // 10 นาที
        }
      } else {
        // ไม่เคยมี heartbeat เลย
        setIsBoxOnline(false);
        setSensors({ wifi: 'offline', coin: 'offline', vib: 'offline' });
      }
    }, (error) => {
      console.error('Error fetching heartbeat data:', error);
    });

    return () => unsubscribe();
  }, []);

  // อัปเดตสถานะ online/offline ทุก 1 นาที
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastSeen) {
        const diffMs = Date.now() - lastSeen.getTime();
        setIsBoxOnline(diffMs < 10 * 60 * 1000);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [lastSeen]);

  useEffect(() => {
    const q = query(collection(db, 'DailyHardwareCheck'), orderBy('checkTime', 'desc'), limit(7));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          boxId: data.boxId || 'N/A',
          statusSummary: data.statusSummary || 'UNKNOWN',
          checkTime: data.checkTime ? data.checkTime.toDate() : new Date(),
          failedSystems: data.failedSystems || []
        });
      });
      setDailyChecks(list);
      setDailyLoading(false);
    }, (error) => {
      console.error('Error fetching daily hardware checks:', error);
      setDailyLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const sensorList = [
    {
      id: 'wifi',
      title: 'การเชื่อมต่ออินเทอร์เน็ต',
      subtitle: 'WiFi / Firebase',
      icon: <Wifi />,
      isOk: sensors.wifi === 'online' && isBoxOnline,
      textOk: 'ปกติ',
      textBad: !isBoxOnline ? 'ตู้ไม่ตอบสนอง' : 'ขาดการเชื่อมต่อ',
      iconOkColor: 'bg-emerald-100 text-emerald-600',
      iconBadColor: 'bg-rose-100 text-rose-600',
      tagOk: 'success',
      tagBad: 'danger'
    },
    {
      id: 'coin',
      title: 'เซ็นเซอร์นับเหรียญ/ธนบัตร',
      subtitle: 'Coin / Bill Acceptor',
      icon: <Coins />,
      isOk: sensors.coin === 'online' && isBoxOnline,
      textOk: 'ปกติ',
      textBad: !isBoxOnline ? 'ไม่ทราบสถานะ' : 'ขัดข้อง / อุปกรณ์ขัดข้อง',
      iconOkColor: 'bg-emerald-100 text-emerald-600',
      iconBadColor: 'bg-rose-100 text-rose-600',
      tagOk: 'success',
      tagBad: 'danger'
    },
    {
      id: 'vib',
      title: 'เซ็นเซอร์สั่นสะเทือน',
      subtitle: 'Vibration Sensor',
      icon: <AlertOctagon />,
      isOk: sensors.vib === 'online' && isBoxOnline,
      textOk: 'ปกติ',
      textBad: !isBoxOnline ? 'ไม่ทราบสถานะ' : 'พบแรงสั่นสะเทือนผิดปกติ',
      iconOkColor: 'bg-emerald-100 text-emerald-600',
      iconBadColor: 'bg-rose-100 text-rose-600',
      tagOk: 'success',
      tagBad: 'danger'
    }
  ];

  return (
    <section className="page-section">
      {/* Connection Status Banner */}
      <div className="card glass-panel" style={{
        padding: '1.25rem 2rem',
        marginBottom: '1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: isBoxOnline ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
        border: isBoxOnline ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(244, 63, 94, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isBoxOnline ? (
            <Wifi size={22} style={{ color: '#059669' }} />
          ) : (
            <WifiOff size={22} style={{ color: '#E11D48' }} />
          )}
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', color: isBoxOnline ? '#059669' : '#E11D48' }}>
              {isBoxOnline ? '🟢 ตู้บริจาคออนไลน์' : '🔴 ตู้บริจาคออฟไลน์'}
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} />
              {lastSeen 
                ? `อัปเดตล่าสุด: ${new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'medium' }).format(lastSeen)}`
                : 'ยังไม่เคยได้รับสัญญาณจากตู้'}
            </p>
          </div>
        </div>
        <span className={`sensor-badge ${isBoxOnline ? 'success' : 'danger'}`} style={{ fontSize: '0.9rem', padding: '6px 14px' }}>
          {isBoxOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      <div className="card glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <div className="card-header" style={{ marginBottom: '2rem' }}>
          <h2>สถานะเซ็นเซอร์ตู้บริจาค</h2>
        </div>

        <div className="sensor-grid">
          {sensorList.map((sensor) => (
            <div key={sensor.id} className="card sensor-card glass-panel">
              <div className="sensor-header">
                <div className={`sensor-icon-wrapper ${sensor.isOk ? 'bg-indigo-100 text-indigo-600' : sensor.iconBadColor}`} style={{
                  backgroundColor: sensor.isOk ? 'rgba(99, 102, 241, 0.1)' : undefined,
                  color: sensor.isOk ? 'var(--primary)' : undefined
                }}>
                  {sensor.icon}
                </div>
                <div className="sensor-details">
                  <h3>{sensor.title}</h3>
                  <p>{sensor.subtitle}</p>
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px dashed var(--gray-200)' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--gray-500)', fontWeight: 600 }}>สถานะ:</span>
                <span className={`sensor-badge ${sensor.isOk ? 'success' : 'danger'}`}>
                  {sensor.isOk ? (
                    <CheckCircle2 size={16} style={{ marginRight: '4px' }} />
                  ) : (
                    <ShieldAlert size={16} style={{ marginRight: '4px' }} />
                  )}
                  {sensor.isOk ? sensor.textOk : sensor.textBad}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Hardware Check Section - History Table */}
      <div className="card glass-panel" style={{ padding: '2rem' }}>
        <div className="card-header" style={{ marginBottom: '1.5rem' }}>
          <h2>ผลการตรวจสุขภาพระบบรายวัน</h2>
        </div>

        {dailyLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
            กำลังโหลดข้อมูล...
          </div>
        ) : dailyChecks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
            <p>ยังไม่มีประวัติการตรวจสอบระบบ (ระบบจะเริ่มบันทึกอัตโนมัติทุกวัน 19:30 น.)</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="styled-table">
              <thead>
                <tr>
                  <th>วันที่ตรวจ</th>
                  <th>สถานะตู้</th>
                  <th>ระบบที่ขัดข้อง</th>
                </tr>
              </thead>
              <tbody>
                {dailyChecks.map((check) => (
                  <tr key={check.id}>
                    <td style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                      {new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short' }).format(check.checkTime)}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        backgroundColor: check.statusSummary === 'SUCCESS' ? 'rgba(16, 185, 129, 0.12)' : check.statusSummary === 'OFFLINE' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                        color: check.statusSummary === 'SUCCESS' ? '#059669' : check.statusSummary === 'OFFLINE' ? '#D97706' : '#E11D48'
                      }}>
                        {check.statusSummary === 'SUCCESS' ? (
                          <><CheckCircle2 size={14} /> พร้อมใช้งาน</>
                        ) : check.statusSummary === 'OFFLINE' ? (
                          <><ShieldAlert size={14} /> ตู้ไม่ตอบสนอง</>
                        ) : (
                          <><ShieldAlert size={14} /> มีอุปกรณ์ขัดข้อง</>
                        )}
                      </span>
                    </td>
                    <td style={{ color: 'var(--gray-600)' }}>
                      {check.statusSummary === 'SUCCESS' ? (
                        <span style={{ color: 'var(--gray-400)' }}>-</span>
                      ) : check.failedSystems && check.failedSystems.length > 0 ? (
                        check.failedSystems.join(', ')
                      ) : (
                        <span style={{ color: 'var(--gray-400)' }}>ไม่มีข้อมูลเซ็นเซอร์</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
