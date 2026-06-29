import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Wifi, Coins, AlertOctagon, CheckCircle2, ShieldAlert, Calendar } from 'lucide-react';

export default function Status() {
  const [sensors, setSensors] = useState({
    wifi: 'online',
    coin: 'online',
    vib: 'online'
  });

  const [dailyChecks, setDailyChecks] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(true);

  useEffect(() => {
    const docRef = doc(db, 'Donation_Box', 'box1');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSensors({
          wifi: data.wifi || 'online',
          coin: data.coin || 'online',
          vib: data.vib || 'online'
        });
      }
    }, (error) => {
      console.error('Error fetching sensors data:', error);
    });

    return () => unsubscribe();
  }, []);

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
          checkTime: data.checkTime ? data.checkTime.toDate() : new Date()
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
      isOk: sensors.wifi === 'online',
      textOk: 'ปกติ',
      textBad: 'ขาดการเชื่อมต่อ',
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
      isOk: sensors.coin === 'online',
      textOk: 'ปกติ',
      textBad: 'ขัดข้อง / อุปกรณ์ขัดข้อง',
      iconOkColor: 'bg-emerald-100 text-emerald-600',
      iconBadColor: 'bg-rose-100 text-rose-600',
      tagOk: 'success',
      tagBad: 'danger'
    },
    {
      id: 'vib',
      title: 'เซ็นเซอร์สั่นสะเทือน',
      subtitle: 'MPU6050 Vibration',
      icon: <AlertOctagon />,
      isOk: sensors.vib === 'online',
      textOk: 'ปกติ',
      textBad: 'พบแรงสั่นสะเทือนผิดปกติ',
      iconOkColor: 'bg-emerald-100 text-emerald-600',
      iconBadColor: 'bg-rose-100 text-rose-600',
      tagOk: 'success',
      tagBad: 'danger'
    }
  ];

  return (
    <section className="page-section">
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

      {/* Daily Hardware Check Section */}
      <div className="card glass-panel" style={{ padding: '2rem' }}>
        <div className="card-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>ผลการตรวจสุขภาพระบบรายวัน (19:00 น.)</h2>
        </div>

        {dailyLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
            <i className="fa-solid fa-spinner fa-spin fa-lg" style={{ marginRight: '8px' }}></i>
            กำลังโหลดข้อมูลการตรวจสอบรายวัน...
          </div>
        ) : dailyChecks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
            <p>ไม่พบประวัติการตรวจสอบระบบรายวัน</p>
          </div>
        ) : (
          <div>
            {/* Latest daily check card */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem',
              borderRadius: '8px',
              backgroundColor: dailyChecks[0].statusSummary === 'SUCCESS' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
              border: dailyChecks[0].statusSummary === 'SUCCESS' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(244, 63, 94, 0.2)',
              marginBottom: '2rem'
            }}>
              <div>
                <h3 style={{ margin: 0, color: dailyChecks[0].statusSummary === 'SUCCESS' ? '#059669' : '#E11D48' }}>
                  สถานะการตรวจล่าสุด: {dailyChecks[0].statusSummary === 'SUCCESS' ? 'ปกติทั้งหมด (SUCCESS)' : 'พบข้อผิดพลาด/เซ็นเซอร์ขัดข้อง (WARNING)'}
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={14} />
                  ตรวจสอบล่าสุดเมื่อ: {new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short' }).format(dailyChecks[0].checkTime)}
                </p>
              </div>
              <span className={`sensor-badge ${dailyChecks[0].statusSummary === 'SUCCESS' ? 'success' : 'danger'}`} style={{ fontSize: '1rem', padding: '8px 16px', borderRadius: '6px' }}>
                {dailyChecks[0].statusSummary === 'SUCCESS' ? 'SUCCESS' : 'WARNING'}
              </span>
            </div>

            {/* History Table */}
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>ประวัติการตรวจสอบย้อนหลัง 7 วัน</h3>
            <div className="table-responsive">
              <table className="styled-table">
                <thead>
                  <tr>
                    <th>วันที่และเวลาตรวจสอบ</th>
                    <th>รหัสตู้</th>
                    <th>ผลลัพธ์</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyChecks.map((check) => (
                    <tr key={check.id}>
                      <td style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: 'none' }}>
                        <Calendar size={14} className="text-gray-500" />
                        {new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(check.checkTime)}
                      </td>
                      <td>{check.boxId}</td>
                      <td>
                        <span className={`badge ${check.statusSummary === 'SUCCESS' ? 'bg-emerald' : 'bg-rose'}`} style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontWeight: 600,
                          backgroundColor: check.statusSummary === 'SUCCESS' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                          color: check.statusSummary === 'SUCCESS' ? '#059669' : '#E11D48'
                        }}>
                          {check.statusSummary === 'SUCCESS' ? 'ปกติ (SUCCESS)' : 'พบปัญหา (WARNING)'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
