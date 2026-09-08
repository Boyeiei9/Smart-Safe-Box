import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { History as HistoryIcon, CircleDollarSign, RotateCcw, Calendar, UserCheck, FileText, CalendarDays, Filter } from 'lucide-react';
import TaxDocumentModal from './TaxDocumentModal';

export default function History() {
  const [viewMode, setViewMode] = useState('donations'); // 'donations' | 'resets'
  const [resetPeriod, setResetPeriod] = useState('per_reset'); // 'per_reset' | 'monthly' | 'yearly'
  const [donations, setDonations] = useState([]);
  const [resetHistory, setResetHistory] = useState([]);
  const [loadingDonations, setLoadingDonations] = useState(true);
  const [loadingResets, setLoadingResets] = useState(true);

  // Modal State for Tax Paper Document
  const [taxDocData, setTaxDocData] = useState(null);
  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  };

  // Format date
  const formatDate = (date) => {
    if (!date) return '-';
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  // Subscribe to Donations
  useEffect(() => {
    const q = query(collection(db, 'DonationLogs'), orderBy('timestamp', 'desc'), limit(100));
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
      setLoadingDonations(false);
    }, (error) => {
      console.error('Error fetching donation logs:', error);
      setLoadingDonations(false);
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to Reset History
  useEffect(() => {
    const q = query(collection(db, 'ResetHistory'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const resetList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        resetList.push({
          id: docSnap.id,
          amount: data.amount || 0,
          resetBy: data.resetBy || 'ผู้ดูแลระบบ',
          note: data.note || 'รีเซ็ตยอดเงินในตู้',
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date()
        });
      });
      setResetHistory(resetList);
      setLoadingResets(false);
    }, (error) => {
      console.error('Error fetching reset logs:', error);
      setLoadingResets(false);
    });

    return () => unsubscribe();
  }, []);

  // Group resets by month
  const monthlyResets = useMemo(() => {
    const groups = {};
    resetHistory.forEach((item) => {
      const d = item.timestamp ? new Date(item.timestamp) : new Date();
      const monthYearKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthName = d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

      if (!groups[monthYearKey]) {
        groups[monthYearKey] = {
          periodKey: monthYearKey,
          periodLabel: `ประจำเดือน ${monthName}`,
          amount: 0,
          count: 0,
          items: [],
          resetBy: item.resetBy,
          timestamp: d
        };
      }
      groups[monthYearKey].amount += item.amount;
      groups[monthYearKey].count += 1;
      groups[monthYearKey].items.push(item);
    });

    // Sort items inside each month chronologically (earliest first)
    Object.values(groups).forEach(g => {
      g.items.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return ta - tb;
      });
    });

    return Object.values(groups).sort((a, b) => b.periodKey.localeCompare(a.periodKey));
  }, [resetHistory]);

  // Group resets by year
  const yearlyResets = useMemo(() => {
    const groups = {};
    resetHistory.forEach((item) => {
      const d = item.timestamp ? new Date(item.timestamp) : new Date();
      const yearKey = `${d.getFullYear()}`;
      const yearBuddhist = d.getFullYear() + 543;

      if (!groups[yearKey]) {
        groups[yearKey] = {
          periodKey: yearKey,
          periodLabel: `ประจำปี พ.ศ. ${yearBuddhist}`,
          amount: 0,
          count: 0,
          items: [],
          resetBy: item.resetBy,
          timestamp: d
        };
      }
      groups[yearKey].amount += item.amount;
      groups[yearKey].count += 1;
      groups[yearKey].items.push(item);
    });

    // Sort items inside each year chronologically (January to December - earliest month first)
    Object.values(groups).forEach(g => {
      g.items.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return ta - tb;
      });
    });

    return Object.values(groups).sort((a, b) => b.periodKey.localeCompare(a.periodKey));
  }, [resetHistory]);

  // Handle open document modal
  const openTaxDocument = (type, data) => {
    if (type === 'single') {
      setTaxDocData({
        type: 'single',
        templeName: 'วัดโคกเสือ',
        docNo: `TAX-${data.timestamp ? new Date(data.timestamp).getTime().toString().slice(-6) : Date.now().toString().slice(-6)}`,
        timestamp: data.timestamp,
        periodLabel: `รอบรีเซ็ตเมื่อ ${formatDate(data.timestamp)}`,
        amount: data.amount,
        resetBy: data.resetBy,
        note: data.note,
        items: [data]
      });
    } else if (type === 'monthly') {
      setTaxDocData({
        type: 'monthly',
        templeName: 'วัดโคกเสือ',
        docNo: `TAX-M-${data.periodKey.replace('-', '')}`,
        timestamp: data.timestamp,
        periodLabel: data.periodLabel,
        amount: data.amount,
        resetBy: data.resetBy || 'ผู้ดูแลระบบ',
        note: `สรุปการรีเซ็ตประจำเดือน (รวม ${data.count} รอบ)`,
        items: data.items
      });
    } else if (type === 'yearly') {
      setTaxDocData({
        type: 'yearly',
        templeName: 'วัดโคกเสือ',
        docNo: `TAX-Y-${data.periodKey}`,
        timestamp: data.timestamp,
        periodLabel: data.periodLabel,
        amount: data.amount,
        resetBy: data.resetBy || 'ผู้ดูแลระบบ',
        note: `สรุปการรีเซ็ตประจำปี (รวม ${data.count} รอบ)`,
        items: data.items
      });
    }
    setIsTaxModalOpen(true);
  };

  // Auto open document if requested via URL parameter (e.g. from LINE Bot link)
  useEffect(() => {
    if (loadingResets || resetHistory.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const docType = params.get('docType');
    const docNoParam = params.get('docNo');
    const openDoc = params.get('openDoc');

    if (docType || openDoc || docNoParam) {
      if (docType === 'monthly' && monthlyResets.length > 0) {
        const found = monthlyResets.find(m => `TAX-M-${m.periodKey.replace('-', '')}` === docNoParam) || monthlyResets[0];
        openTaxDocument('monthly', found);
      } else if (docType === 'yearly' && yearlyResets.length > 0) {
        const found = yearlyResets.find(y => `TAX-Y-${y.periodKey}` === docNoParam) || yearlyResets[0];
        openTaxDocument('yearly', found);
      } else if (resetHistory.length > 0) {
        const found = resetHistory.find(item => {
          const expectedNo = `TAX-${item.timestamp ? new Date(item.timestamp).getTime().toString().slice(-6) : ''}`;
          return expectedNo === docNoParam;
        }) || resetHistory[0];
        openTaxDocument('single', found);
      }
    }
  }, [loadingResets, resetHistory, monthlyResets, yearlyResets]);

  return (
    <section className="page-section">
      <div className="card glass-panel" style={{ padding: '2rem' }}>
        <div className="card-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <h2>
              <HistoryIcon className="text-indigo" size={22} />
              {viewMode === 'donations' 
                ? 'ประวัติการบริจาค (เรียงตามล่าสุด)' 
                : resetPeriod === 'monthly'
                  ? 'สรุปยอดเงินจากการรีเซ็ตย้อนหลัง - รายเดือน'
                  : resetPeriod === 'yearly'
                    ? 'สรุปยอดเงินจากการรีเซ็ตย้อนหลัง - รายปี'
                    : 'สรุปยอดเงินจากการรีเซ็ตย้อนหลัง - รายครั้ง'
              }
            </h2>
            <p className="text-sm" style={{ marginTop: '4px', color: 'var(--gray-500)' }}>
              {viewMode === 'donations' 
                ? 'ประวัติการหยอดเงินบริจาคเข้าตู้แยกตามรายการ' 
                : 'สรุปยอดเงินและวันเวลาที่ทำการไขตู้รีเซ็ตยอด พร้อมดาวน์โหลดเป็นเอกสารยื่นภาษีทางการเงิน'
              }
            </p>
          </div>

          {/* Main View Filter Switcher */}
          <div className="filter-group" style={{ margin: 0 }}>
            <button 
              className={`btn-filter ${viewMode === 'donations' ? 'active' : ''}`}
              onClick={() => setViewMode('donations')}
            >
              <CircleDollarSign size={16} style={{ marginRight: '6px' }} />
              ประวัติบริจาครายรายการ
            </button>
            <button 
              className={`btn-filter ${viewMode === 'resets' ? 'active' : ''}`}
              onClick={() => setViewMode('resets')}
            >
              <RotateCcw size={16} style={{ marginRight: '6px' }} />
              สรุปยอดเงินจากการรีเซ็ต ({resetHistory.length})
            </button>
          </div>

          {/* Sub Filter Switcher for Resets (Per-reset, Monthly, Yearly) */}
          {viewMode === 'resets' && (
            <div className="sub-filter-container" style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--gray-600)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Filter size={14} className="text-indigo" />
                เลือกรอบสรุปยอด:
              </span>
              <div className="sub-filter-group">
                <button
                  className={`btn-sub-filter ${resetPeriod === 'per_reset' ? 'active' : ''}`}
                  onClick={() => setResetPeriod('per_reset')}
                >
                  <RotateCcw size={14} /> รายครั้ง ({resetHistory.length})
                </button>
                <button
                  className={`btn-sub-filter ${resetPeriod === 'monthly' ? 'active' : ''}`}
                  onClick={() => setResetPeriod('monthly')}
                >
                  <CalendarDays size={14} /> รายเดือน ({monthlyResets.length})
                </button>
                <button
                  className={`btn-sub-filter ${resetPeriod === 'yearly' ? 'active' : ''}`}
                  onClick={() => setResetPeriod('yearly')}
                >
                  <Calendar size={14} /> รายปี ({yearlyResets.length})
                </button>
              </div>
            </div>
          )}
        </div>

        {viewMode === 'donations' ? (
          <div className="table-responsive">
            <table className="styled-table">
              <thead>
                <tr>
                  <th>วันที่และเวลา</th>
                  <th style={{ textAlign: 'right' }}>จำนวนเงิน (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {loadingDonations ? (
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
                      <td style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: 'none' }}>
                        <Calendar size={15} className="text-gray-500" />
                        {formatDate(donation.timestamp)}
                      </td>
                      <td className="amount-cell" style={{ textAlign: 'right' }}>
                        ฿{formatCurrency(donation.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="styled-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr>
                  {resetPeriod === 'per_reset' && <th style={{ width: '35%', textAlign: 'left' }}>วันและเวลาที่รีเซ็ต</th>}
                  {resetPeriod === 'monthly' && <th style={{ width: '35%', textAlign: 'left' }}>ประจำเดือน / ปี</th>}
                  {resetPeriod === 'yearly' && <th style={{ width: '35%', textAlign: 'left' }}>ประจำปี พ.ศ.</th>}

                  <th style={{ width: '23%', textAlign: 'right' }}>ยอดเงินสรุปได้ (บาท)</th>
                  <th style={{ width: '20%', textAlign: 'center' }}>ผู้ทำรายการ</th>
                  <th style={{ width: '22%', textAlign: 'center' }}>เอกสารยื่นภาษี / ใบเสร็จ</th>
                </tr>
              </thead>
              <tbody>
                {loadingResets ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
                      <i className="fa-solid fa-spinner fa-spin fa-lg" style={{ marginRight: '8px' }}></i>
                      กำลังโหลดประวัติสรุปการรีเซ็ต...
                    </td>
                  </tr>
                ) : resetHistory.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '4rem' }}>
                      <div className="empty-state">
                        <RotateCcw className="empty-state-icon" style={{ opacity: 0.4 }} size={48} />
                        <p style={{ fontWeight: 600 }}>ยังไม่มีประวัติสรุปการรีเซ็ตยอดเงินในระบบ</p>
                      </div>
                    </td>
                  </tr>
                ) : resetPeriod === 'per_reset' ? (
                  resetHistory.map((item) => (
                    <tr key={item.id}>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <Calendar size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                          <span style={{ fontWeight: 600 }}>{formatDate(item.timestamp)}</span>
                        </div>
                      </td>
                      <td className="amount-cell" style={{ textAlign: 'right', fontWeight: 700, color: '#059669', fontSize: '1.05rem' }}>
                        ฿{formatCurrency(item.amount)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--gray-700)' }}>
                          <UserCheck size={15} className="text-indigo" />
                          {item.resetBy}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-download-doc"
                          onClick={() => openTaxDocument('single', item)}
                          title="ดาวน์โหลด/พิมพ์เอกสารทางการเงินเพื่อยื่นภาษี"
                        >
                          <FileText size={15} />
                          เอกสารยื่นภาษี
                        </button>
                      </td>
                    </tr>
                  ))
                ) : resetPeriod === 'monthly' ? (
                  monthlyResets.map((mItem) => (
                    <tr key={mItem.periodKey}>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <CalendarDays size={16} className="text-indigo" style={{ flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, color: 'var(--dark)' }}>{mItem.periodLabel}</span>
                        </div>
                      </td>
                      <td className="amount-cell" style={{ textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '1.1rem' }}>
                        ฿{formatCurrency(mItem.amount)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--gray-700)' }}>
                          <UserCheck size={15} className="text-indigo" />
                          {mItem.resetBy}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-download-doc"
                          onClick={() => openTaxDocument('monthly', mItem)}
                          title="ดาวน์โหลด/พิมพ์เอกสารทางการเงินประจำเดือนเพื่อยื่นภาษี"
                        >
                          <FileText size={15} />
                          พิมพ์รายงานรายเดือน
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  yearlyResets.map((yItem) => (
                    <tr key={yItem.periodKey}>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <Calendar size={16} className="text-indigo" style={{ flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, color: 'var(--dark)' }}>{yItem.periodLabel}</span>
                        </div>
                      </td>
                      <td className="amount-cell" style={{ textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '1.1rem' }}>
                        ฿{formatCurrency(yItem.amount)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--gray-700)' }}>
                          <UserCheck size={15} className="text-indigo" />
                          {yItem.resetBy}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-download-doc"
                          onClick={() => openTaxDocument('yearly', yItem)}
                          title="ดาวน์โหลด/พิมพ์เอกสารทางการเงินประจำปีเพื่อยื่นภาษี"
                        >
                          <FileText size={15} />
                          พิมพ์รายงานรายปี
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tax Document Preview & Print Modal */}
      <TaxDocumentModal
        isOpen={isTaxModalOpen}
        onClose={() => setIsTaxModalOpen(false)}
        documentData={taxDocData}
      />
    </section>
  );
}
