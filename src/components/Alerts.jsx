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

  useEffect(() => {
    const q = query(collection(db, 'Alerts'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const alertList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        alertList.push({
          id: docSnap.id,
          category: data.category || 'security',
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
                <th>เวลา</th>
                <th>ประเภท</th>
                <th>หมวดหมู่</th>
                <th>รายละเอียด</th>
                <th>ความรุนแรง</th>
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
                  let sevClass = '';
                  let sevText = '';
                  if (alert.severity === 'High') {
                    sevClass = 'bg-rose text-white';
                    sevText = 'สูงมาก (วิกฤต)';
                  } else if (alert.severity === 'Medium') {
                    sevClass = 'bg-orange text-white';
                    sevText = 'ปานกลาง';
                  } else {
                    sevClass = 'bg-blue text-white';
                    sevText = 'ต่ำ (แจ้งทราบ)';
                  }

                  return (
                    <tr key={alert.id}>
                      <td style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: 'none' }}>
                        <Calendar size={14} className="text-gray-500" />
                        {formatDate(alert.timestamp)}
                      </td>
                      <td style={{ fontWeight: 600 }}>{alert.type}</td>
                      <td>
                        <span className={`badge ${alert.category === 'security' ? 'badge-security' : 'badge-system'}`}>
                          {alert.category === 'security' ? 'ความปลอดภัย' : 'ระบบและพลังงาน'}
                        </span>
                      </td>
                      <td>{alert.message}</td>
                      <td>
                        <span className={`badge ${sevClass}`} style={{ padding: '4px 8px', borderRadius: '4px' }}>
                          {sevText}
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
