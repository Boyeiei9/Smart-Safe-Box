import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { FileText, UserCheck, Calendar } from 'lucide-react';

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  // Format date
  const formatDate = (date) => {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  useEffect(() => {
    const q = query(collection(db, 'SystemLogs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        logList.push({
          id: docSnap.id,
          action: data.action || 'การดำเนินการที่ไม่รู้จัก',
          user: data.user || 'Admin',
          note: data.note || '-',
          type: data.type || '',
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date()
        });
      });
      setLogs(logList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching system logs:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getLogType = (log) => {
    if (log.type) return log.type;
    // Fallback: If user is 'แอดมินระบบ' or 'Admin', it's admin. Otherwise it's user.
    if (log.user === 'แอดมินระบบ' || log.user === 'Admin') return 'admin';
    return 'user';
  };

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    return getLogType(log) === filter;
  });

  return (
    <section className="page-section">
      <div className="card glass-panel" style={{ padding: '2rem' }}>
        <div className="card-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2>
              <FileText className="text-indigo" size={22} />
              ประวัติการใช้งาน / จัดการตู้บริจาค
            </h2>
            <div className="filter-group" style={{ marginTop: '1rem' }}>
              <button 
                className={`btn-filter ${filter === 'all' ? 'active' : ''}`} 
                onClick={() => setFilter('all')}
              >
                ทั้งหมด
              </button>
              <button 
                className={`btn-filter ${filter === 'admin' ? 'active' : ''}`}
                onClick={() => setFilter('admin')}
              >
                การจัดการระบบ (Admin)
              </button>
              <button 
                className={`btn-filter ${filter === 'user' ? 'active' : ''}`}
                onClick={() => setFilter('user')}
              >
                การควบคุมตู้ (ผู้ใช้ทั่วไป)
              </button>
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="styled-table">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>การกระทำ (Action)</th>
                <th>ผู้ดำเนินการ</th>
                <th>หมายเหตุ / รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
                    <i className="fa-solid fa-spinner fa-spin fa-lg" style={{ marginRight: '8px' }}></i>
                    กำลังโหลดประวัติการใช้งาน...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '4rem' }}>
                    <div className="empty-state">
                      <UserCheck className="empty-state-icon" size={48} style={{ opacity: 0.4 }} />
                      <p style={{ fontWeight: 600, color: 'var(--gray-500)' }}>ไม่พบประวัติการใช้งานในหมวดหมู่นี้</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isResetAction = log.action && log.action.includes('รีเซ็ต');
                  return (
                    <tr key={log.id}>
                      <td style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: 'none' }}>
                        <Calendar size={14} className="text-gray-500" />
                        {formatDate(log.timestamp)}
                      </td>
                      <td style={{ fontWeight: 700, color: isResetAction ? '#059669' : 'var(--primary)' }}>
                        {isResetAction && <i className="fa-solid fa-rotate-left" style={{ marginRight: '6px' }} />}
                        {log.action}
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <i className="fa-solid fa-user-circle text-gray-400" />
                          {log.user}
                        </span>
                      </td>
                      <td style={{ color: isResetAction ? '#047857' : 'var(--gray-500)', fontWeight: isResetAction ? 600 : 400 }}>
                        {log.note}
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
