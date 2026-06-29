import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { UserCheck, ShieldAlert, Sparkles, UserX, ToggleLeft, ToggleRight, Check, Send, Coins, FileText, Lock, RefreshCw, BarChart2, Eye, CircleSlash } from 'lucide-react';

export default function Admins() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'Users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const adminList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.role === 'SuperAdmin') return; // ซ่อน SuperAdmin ไม่ให้ขึ้นในการ์ดจัดการสิทธิ์
        adminList.push({
          id: docSnap.id,
          name: data.name || 'Unknown User',
          permissions: data.permissions || {},
          role: data.role || 'General',
          lineId: data.lineId || 'N/A',
          phone: data.phone || '-',
          isApproved: data.isApproved === true
        });
      });
      setAdmins(adminList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching admins:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getAdminRole = (admin) => {
    const p = admin.permissions || {};
    const isExecutive = 
      p.checkBalance === true && 
      p.viewDonationHistory === true && 
      p.viewSummaryReport === true && 
      p.viewSystemLogs === true && 
      p.viewBoxStatus === true && 
      p.resetBalance === true && 
      p.controlLock === true;
    
    const isDeputy = 
      p.checkBalance === true && 
      p.viewDonationHistory === true && 
      p.viewSummaryReport === true && 
      p.viewSystemLogs === true && 
      p.viewBoxStatus === true && 
      p.resetBalance === false && 
      p.controlLock === false;
      
    const isGeneral = 
      p.checkBalance === false && 
      p.viewDonationHistory === false && 
      p.viewSummaryReport === false && 
      p.viewSystemLogs === false && 
      p.viewBoxStatus === false && 
      p.resetBalance === false && 
      p.controlLock === false;

    if (isExecutive) return 'Executive';
    if (isDeputy) return 'Deputy';
    if (isGeneral) return 'General';
    return 'Custom';
  };

  const approveUser = async (userId, name) => {
    try {
      await updateDoc(doc(db, 'Users', userId), {
        isApproved: true,
        role: 'General',
        permissions: {
          checkBalance: false,
          viewDonationHistory: false,
          viewSummaryReport: false,
          viewSystemLogs: false,
          viewBoxStatus: false,
          resetBalance: false,
          controlLock: false
        },
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'SystemLogs'), {
        action: `อนุมัติผู้ดูแลระบบ: ${name} (สิทธิ์เริ่มต้น: บุคคลทั่วไป)`,
        user: 'Admin',
        type: 'admin',
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error('Error approving user:', e);
      alert('เกิดข้อผิดพลาดในการอนุมัติ: ' + e.message);
    }
  };

  const handleRoleChange = async (userId, name, newRole) => {
    let targetPermissions = {};
    if (newRole === 'Executive') {
      targetPermissions = {
        checkBalance: true,
        viewDonationHistory: true,
        viewSummaryReport: true,
        viewSystemLogs: true,
        viewBoxStatus: true,
        resetBalance: true,
        controlLock: true
      };
    } else if (newRole === 'Deputy') {
      targetPermissions = {
        checkBalance: true,
        viewDonationHistory: true,
        viewSummaryReport: true,
        viewSystemLogs: true,
        viewBoxStatus: true,
        resetBalance: false,
        controlLock: false
      };
    } else if (newRole === 'General') {
      targetPermissions = {
        checkBalance: false,
        viewDonationHistory: false,
        viewSummaryReport: false,
        viewSystemLogs: false,
        viewBoxStatus: false,
        resetBalance: false,
        controlLock: false
      };
    } else {
      return;
    }

    try {
      await updateDoc(doc(db, 'Users', userId), {
        role: newRole,
        permissions: targetPermissions,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'SystemLogs'), {
        action: `เปลี่ยนตำแหน่ง (${name}) เป็น: ${
          newRole === 'Executive' ? 'ผู้บริหาร' : newRole === 'Deputy' ? 'รองผู้บริหาร' : 'บุคคลทั่วไป'
        }`,
        user: 'Admin',
        type: 'admin',
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error('Error changing role:', e);
      alert('เกิดข้อผิดพลาดในการเปลี่ยนตำแหน่ง: ' + e.message);
    }
  };

  const togglePermission = async (userId, name, pKey, pLabel, currentValue) => {
    try {
      const updateData = {};
      updateData[`permissions.${pKey}`] = !currentValue;
      updateData['role'] = 'Custom';

      await updateDoc(doc(db, 'Users', userId), updateData);

      await addDoc(collection(db, 'SystemLogs'), {
        action: `แก้ไขสิทธิ์ (${name}): ${pLabel} เป็น ${!currentValue ? 'เปิด' : 'ปิด'}`,
        user: 'Admin',
        type: 'admin',
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error('Error toggling permission:', e);
    }
  };

  const finishAndNotify = async (userId, name) => {
    try {
      await updateDoc(doc(db, 'Users', userId), {
        notifyUser: true,
        notifiedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'SystemLogs'), {
        action: `แอดมินกดส่งแจ้งเตือน: ${name}`,
        user: 'Admin',
        type: 'admin',
        timestamp: serverTimestamp()
      });

      alert(`สั่งส่งแจ้งเตือนหาคุณ ${name} แล้ว! โปรดรอตรวจสอบทาง LINE`);
    } catch (e) {
      console.error('Error sending notification:', e);
      alert('เกิดข้อผิดพลาดในการบันทึกเพื่อแจ้งเตือน: ' + e.message);
    }
  };

  const deleteAdmin = async (userId, name) => {
    if (!confirm(`คุณแน่ใจหรือไม่ที่จะลบผู้ดูแล "${name}" ออกจากระบบ?`)) return;

    try {
      await deleteDoc(doc(db, 'Users', userId));

      await addDoc(collection(db, 'SystemLogs'), {
        action: `ลบผู้ดูแลระบบ: ${name}`,
        user: 'Admin',
        note: 'ลบรายชื่อผู้ดูแลผ่านทางระบบ Dashboard',
        type: 'admin',
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error('Error deleting admin:', e);
      alert('ไม่สามารถลบข้อมูลได้: ' + e.message);
    }
  };

  const permissionKeys = [
    { key: 'checkBalance', label: 'เช็คยอดเงิน', icon: <Coins size={16} /> },
    { key: 'viewDonationHistory', label: 'ดูประวัติบริจาค', icon: <Eye size={16} /> },
    { key: 'viewSummaryReport', label: 'ดูรายงานสรุป', icon: <BarChart2 size={16} /> },
    { key: 'viewSystemLogs', label: 'ดูประวัติใช้งานตู้', icon: <FileText size={16} /> },
    { key: 'viewBoxStatus', label: 'ดูสถานะตู้', icon: <Eye size={16} /> },
    { key: 'resetBalance', label: 'รีเซ็ตยอดเงิน', icon: <RefreshCw size={16} /> },
    { key: 'controlLock', label: 'ควบคุมล็อกตู้', icon: <Lock size={16} /> }
  ];

  return (
    <section className="page-section">
      <div className="card glass-panel" style={{ padding: '2rem' }}>
        <div className="card-header">
          <div>
            <h2>
              <UserCheck className="text-indigo" size={22} />
              จัดการสิทธิ์ผู้ดูแลระบบ
            </h2>
            <p className="text-sm" style={{ marginTop: '4px' }}>อนุมัติและจัดการระดับสิทธิ์สั่งการผ่านบอท LINE ของสตาฟฟ์</p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--gray-500)' }}>
            <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ marginBottom: '1rem' }}></i>
            <p>กำลังโหลดรายชื่อผู้ได้รับสิทธิ์...</p>
          </div>
        ) : admins.length === 0 ? (
          <div className="empty-state">
            <CircleSlash className="empty-state-icon" size={48} style={{ opacity: 0.4 }} />
            <p style={{ fontWeight: 600, color: 'var(--gray-500)' }}>ยังไม่มีข้อมูลผู้ใช้งานที่ลงทะเบียนในระบบ</p>
          </div>
        ) : (
          <div className="admin-grid">
            {admins.map((admin) => (
              <div 
                key={admin.id} 
                className={`card admin-card glass-panel ${admin.isApproved ? 'border-approved' : 'border-pulse-rose'}`}
              >
                {/* Delete button */}
                <button 
                  className="btn-close" 
                  onClick={() => deleteAdmin(admin.id, admin.name)}
                  title="ลบรายชื่อผู้ดูแล"
                >
                  <UserX size={18} />
                </button>

                {/* Avatar */}
                <div className="admin-avatar">
                  <i className="fa-solid fa-user-tie" />
                </div>

                {/* Status Badge */}
                {admin.isApproved ? (
                  <div className="status-approved">
                    <Check size={12} /> อนุมัติสิทธิ์แล้ว
                  </div>
                ) : (
                  <div className="status-unapproved">
                    <ShieldAlert size={12} /> ยังไม่ได้รับการอนุมัติ
                  </div>
                )}

                {/* Name */}
                <div className="admin-name">{admin.name}</div>

                {/* Info info */}
                <div className="admin-info">
                  <div className="info-item">
                    <span className="info-label">LINE ID</span>
                    <span className="info-value">
                      {admin.lineId !== 'N/A' 
                        ? `${admin.lineId.substring(0, 4)}...${admin.lineId.slice(-4)}` 
                        : 'N/A'
                      }
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">เบอร์โทรศัพท์</span>
                    <span className="info-value">{admin.phone}</span>
                  </div>
                </div>

                {/* Card Actions */}
                {!admin.isApproved ? (
                  <button 
                    className="btn btn-primary" 
                    style={{ width: '100%', marginTop: 'auto' }}
                    onClick={() => approveUser(admin.id, admin.name)}
                  >
                    <UserCheck size={16} />
                    อนุมัติสิทธิ์การใช้งาน
                  </button>
                ) : (
                  <div className="permission-list" style={{ width: '100%', marginTop: 'auto' }}>
                    {/* Role Dropdown Selector */}
                    <div style={{ marginBottom: '1.25rem' }}>
                      <label 
                        className="info-label" 
                        style={{ 
                          display: 'block', 
                          marginBottom: '6px', 
                          fontSize: '0.85rem', 
                          fontWeight: '600', 
                          color: 'var(--gray-500)' 
                        }}
                      >
                        ระดับตำแหน่ง (Role)
                      </label>
                      <select 
                        className="styled-select" 
                        style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.9rem' }}
                        value={getAdminRole(admin)}
                        onChange={(e) => handleRoleChange(admin.id, admin.name, e.target.value)}
                      >
                        <option value="Executive">ผู้บริหาร (เจ้าอาวาส)</option>
                        <option value="Deputy">รองผู้บริหาร</option>
                        <option value="General">บุคคลทั่วไป</option>
                        <option value="Custom" disabled>กำหนดเอง</option>
                      </select>
                    </div>

                    <div className="permission-title">สิทธิ์การสั่งการ (Permissions)</div>
                    {permissionKeys.map((p) => {
                      const isEnabled = admin.permissions[p.key] === true;
                      return (
                        <div key={p.key} className="permission-item">
                          <div className="permission-label-box">
                            {p.icon}
                            <span>{p.label}</span>
                          </div>
                          <label className="toggle-switch">
                            <input 
                              type="checkbox" 
                              checked={isEnabled} 
                              onChange={() => togglePermission(admin.id, admin.name, p.key, p.label, isEnabled)}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                        </div>
                      );
                    })}
                    <button 
                      className="btn-notify-finish"
                      onClick={() => finishAndNotify(admin.id, admin.name)}
                    >
                      <Send size={14} />
                      บันทึกสิทธิ์และแจ้งเตือน
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
