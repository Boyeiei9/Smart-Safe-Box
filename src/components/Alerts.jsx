import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { AlertTriangle, ShieldCheck, ShieldAlert, Calendar } from 'lucide-react';

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  // Format date
  const formatDate = (date) => {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  const normalizeCategory = (data) => {
    const type = (data.type || '').toLowerCase();
    const msg = (data.message || '').toLowerCase();
    const cat = (data.category || '').toLowerCase();

    // การสั่นสะเทือน, กระทบกระเทือน, งัดแงะ ให้อยู่ในหมวด "ความปลอดภัย" เสมอ
    if (
      cat === 'security' ||
      cat === 'ความปลอดภัย' ||
      type.includes('สั่น') ||
      type.includes('กระทบ') ||
      type.includes('กระแทก') ||
      type.includes('งัดแงะ') ||
      type.includes('ขโมย') ||
      msg.includes('สั่น') ||
      msg.includes('กระทบ') ||
      msg.includes('กระแทก') ||
      msg.includes('งัดแงะ')
    ) {
      return 'security';
    }
    return 'system';
  };

  const getSeverityInfo = (severity) => {
    const sev = (severity || '').toString().toLowerCase().trim();

    if (
      sev === 'very_high' ||
      sev === 'very high' ||
      sev === 'critical' ||
      sev === 'สูงมาก' ||
      sev.includes('สูงมาก') ||
      sev.includes('วิกฤต')
    ) {
      // 🔴 แดงโปร่ง (สูงมาก - วิกฤต)
      return {
        text: 'สูงมาก',
        style: {
          backgroundColor: '#FEF2F2',
          color: '#DC2626',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          padding: '0.35rem 0.85rem',
          borderRadius: '999px',
          fontWeight: 600,
          fontSize: '0.85rem',
          display: 'inline-flex',
          alignItems: 'center'
        }
      };
    } else if (sev === 'high' || sev === 'สูง') {
      // 🟠 ส้มโปร่ง (สูง)
      return {
        text: 'สูง',
        style: {
          backgroundColor: '#FFF7ED',
          color: '#EA580C',
          border: '1px solid rgba(234, 88, 12, 0.35)',
          padding: '0.35rem 0.85rem',
          borderRadius: '999px',
          fontWeight: 600,
          fontSize: '0.85rem',
          display: 'inline-flex',
          alignItems: 'center'
        }
      };
    } else if (sev === 'medium' || sev === 'ปานกลาง') {
      // 🟢 เขียวโปร่ง (ปานกลาง)
      return {
        text: 'ปานกลาง',
        style: {
          backgroundColor: '#ECFDF5',
          color: '#059669',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          padding: '0.35rem 0.85rem',
          borderRadius: '999px',
          fontWeight: 600,
          fontSize: '0.85rem',
          display: 'inline-flex',
          alignItems: 'center'
        }
      };
    } else {
      // 🟢 เขียวโปร่ง (ต่ำ)
      return {
        text: 'ต่ำ',
        style: {
          backgroundColor: '#ECFDF5',
          color: '#059669',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          padding: '0.35rem 0.85rem',
          borderRadius: '999px',
          fontWeight: 600,
          fontSize: '0.85rem',
          display: 'inline-flex',
          alignItems: 'center'
        }
      };
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'Alerts'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const alertList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        alertList.push({
          id: docSnap.id,
          category: normalizeCategory(data),
          type: data.type || 'ผิดปกติ',
          message: data.message || '',
          severity: data.severity || 'Medium',
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date()
        });
      });
      setAlerts(alertList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching alerts:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredAlerts = alerts.filter((alert) => {
    if (filter === 'all') return true;
    return alert.category === filter;
  });

  return (
    <section className="page-section">
      <div className="card glass-panel" style={{ padding: '2rem' }}>
        <div className="card-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2>
              <AlertTriangle className="text-rose pulse-triangle" size={22} />
              ประวัติการแจ้งเตือนเหตุผิดปกติ
            </h2>
            <div className="filter-group" style={{ marginTop: '1rem' }}>
              <button 
                className={`btn-filter ${filter === 'all' ? 'active' : ''}`} 
                onClick={() => setFilter('all')}
              >
                ทั้งหมด
              </button>
              <button 
                className={`btn-filter ${filter === 'security' ? 'active' : ''}`}
                data-category="security"
                onClick={() => setFilter('security')}
              >
                ความปลอดภัย
              </button>
              <button 
                className={`btn-filter ${filter === 'system' ? 'active' : ''}`}
                data-category="system"
                onClick={() => setFilter('system')}
              >
                ระบบและพลังงาน
              </button>
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="styled-table">
            <thead>
              <tr>
                <th style={{ whiteSpace: 'nowrap', width: '160px' }}>เวลา</th>
                <th style={{ whiteSpace: 'nowrap', width: '150px' }}>ประเภท</th>
                <th style={{ whiteSpace: 'nowrap', width: '140px' }}>หมวดหมู่</th>
                <th>รายละเอียด</th>
                <th style={{ whiteSpace: 'nowrap', width: '110px', textAlign: 'center' }}>ความรุนแรง</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
                    <i className="fa-solid fa-spinner fa-spin fa-lg" style={{ marginRight: '8px' }}></i>
                    กำลังโหลดประวัติการแจ้งเตือน...
                  </td>
                </tr>
              ) : filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '4rem' }}>
                    <div className="empty-state">
                      <ShieldCheck className="empty-state-icon" size={48} style={{ color: 'var(--secondary)', opacity: 0.6 }} />
                      <p style={{ fontWeight: 600, color: 'var(--gray-500)' }}>ไม่พบประวัติการแจ้งเตือนเหตุผิดปกติ</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((alert) => {
                  const sevInfo = getSeverityInfo(alert.severity);

                  return (
                    <tr key={alert.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={14} className="text-gray-500" />
                          <span>{formatDate(alert.timestamp)}</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{alert.type}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className={`badge ${alert.category === 'security' ? 'badge-security' : 'badge-system'}`}>
                          {alert.category === 'security' ? 'ความปลอดภัย' : 'ระบบและพลังงาน'}
                        </span>
                      </td>
                      <td style={{ minWidth: '220px', lineHeight: 1.5 }}>{alert.message}</td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                        <span style={sevInfo.style}>
                          {sevInfo.text}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
