import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { History as HistoryIcon, CircleDollarSign } from 'lucide-react';

export default function History() {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  };

  // Format date
  const formatDate = (date) => {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  useEffect(() => {
    const q = query(collection(db, 'Donation'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const donationList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        donationList.push({
          id: docSnap.id,
          amount: data.amount || 0,
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date()
        });
      });
      setDonations(donationList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching donation logs:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <section className="page-section">
      <div className="card glass-panel" style={{ padding: '2rem' }}>
        <div className="card-header">
          <h2>
            <HistoryIcon className="text-indigo" size={22} />
            ประวัติการบริจาค (เรียงตามล่าสุด)
          </h2>
        </div>

        <div className="table-responsive">
          <table className="styled-table">
            <thead>
              <tr>
                <th>วันที่และเวลา</th>
                <th style={{ textAlign: 'right' }}>จำนวนเงิน (บาท)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="2" style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
                    <i className="fa-solid fa-spinner fa-spin fa-lg" style={{ marginRight: '8px' }}></i>
                    กำลังโหลดประวัติการบริจาค...
                  </td>
                </tr>
              ) : donations.length === 0 ? (
                <tr>
                  <td colSpan="2" style={{ textAlign: 'center', padding: '4rem' }}>
                    <div className="empty-state">
                      <CircleDollarSign className="empty-state-icon" style={{ opacity: 0.4 }} size={48} />
                      <p style={{ fontWeight: 600 }}>ยังไม่มีประวัติการบริจาคในระบบ</p>
                    </div>
                  </td>
                </tr>
              ) : (
                donations.map((donation) => (
                  <tr key={donation.id}>
                    <td>{formatDate(donation.timestamp)}</td>
                    <td className="amount-cell" style={{ textAlign: 'right' }}>
                      ฿{formatCurrency(donation.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
