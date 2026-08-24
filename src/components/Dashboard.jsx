import React, { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot, collection, query, orderBy, limit, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Wallet, CalendarRange, BarChart3, TrendingUp, RefreshCw, RotateCcw, Calendar, History, CheckCircle2, AlertTriangle, FileText, CalendarDays, Filter } from 'lucide-react';
import confetti from 'canvas-confetti';
import TaxDocumentModal from './TaxDocumentModal';

export default function Dashboard() {
  const [totalAmount, setTotalAmount] = useState(0);
  const [dailyAmount, setDailyAmount] = useState(0);
  const [weeklyAmount, setWeeklyAmount] = useState(0);
  const [monthlyAmount, setMonthlyAmount] = useState(0);
  const [chartPeriod, setChartPeriod] = useState('daily');
  const [chartData, setChartData] = useState([]);
  const [resetHistory, setResetHistory] = useState([]);
  const [resetPeriod, setResetPeriod] = useState('per_reset'); // 'per_reset' | 'monthly' | 'yearly'
  const [resetLoading, setResetLoading] = useState(true);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Tax Modal State
  const [taxDocData, setTaxDocData] = useState(null);
  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  };

  // Format date & time
  const formatDateTime = (date) => {
    if (!date) return '-';
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

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

    return Object.values(groups).sort((a, b) => b.periodKey.localeCompare(a.periodKey));
  }, [resetHistory]);

  // Subscribe to Total Amount
  useEffect(() => {
    const docRef = doc(db, 'donation', 'total');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setTotalAmount(docSnap.data().amount || 0);
      }
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to Reset History
  useEffect(() => {
    const q = query(collection(db, 'ResetHistory'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        historyList.push({
          id: docSnap.id,
          amount: data.amount || 0,
          resetBy: data.resetBy || 'ผู้ดูแลระบบ',
          note: data.note || 'รีเซ็ตยอดเงินในตู้',
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date()
        });
      });
      setResetHistory(historyList);
      setResetLoading(false);
    }, (error) => {
      console.error('Error fetching reset history:', error);
      setResetLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch Donations & Calculate stats
  useEffect(() => {
    const q = query(collection(db, 'Donation'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setDailyAmount(0);
        setWeeklyAmount(0);
        setMonthlyAmount(0);
        setChartData([]);
        return;
      }

      let sumDaily = 0;
      let sumWeekly = 0;
      let sumMonthly = 0;

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const donations = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const amount = data.amount || 0;
        const tsDate = data.timestamp ? data.timestamp.toDate() : new Date();

        donations.push({ date: tsDate, amount });

        // Calculate summaries
        if (tsDate >= startOfToday) {
          sumDaily += amount;
        }
        if (tsDate >= startOfWeek) {
          sumWeekly += amount;
        }
        if (tsDate >= startOfMonth) {
          sumMonthly += amount;
        }
      });

      setDailyAmount(sumDaily);
      setWeeklyAmount(sumWeekly);
      setMonthlyAmount(sumMonthly);

      // Generate Chart Data
      generateChartData(donations, chartPeriod);
    });

    return () => unsubscribe();
  }, [chartPeriod]);

  // Generate chart data based on selected period
  const generateChartData = (donations, period) => {
    const now = new Date();
    const dataValues = [];

    if (period === 'daily') {
      // Last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

        const sum = donations
          .filter(item => item.date >= startOfDay && item.date < endOfDay)
          .reduce((sum, item) => sum + item.amount, 0);

        let label = '';
        if (i === 0) label = 'วันนี้';
        else if (i === 1) label = 'เมื่อวาน';
        else label = d.toLocaleDateString('th-TH', { weekday: 'short' });

        dataValues.push({ name: label, amount: sum });
      }
    } else if (period === 'weekly') {
      // Last 4 weeks
      for (let i = 3; i >= 0; i--) {
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - (i * 7));
        const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 7);

        const sum = donations
          .filter(item => item.date >= startOfWeek && item.date < endOfWeek)
          .reduce((sum, item) => sum + item.amount, 0);

        let label = i === 0 ? 'สัปดาห์นี้' : (i === 1 ? 'สัปดาห์ที่แล้ว' : `ย้อนหลัง ${i} สัปดาห์`);
        dataValues.push({ name: label, amount: sum });
      }
    } else {
      // Last 6 months
      const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      for (let i = 5; i >= 0; i--) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const startOfMonth = new Date(m.getFullYear(), m.getMonth(), 1);
        const endOfMonth = new Date(m.getFullYear(), m.getMonth() + 1, 1);

        const sum = donations
          .filter(item => item.date >= startOfMonth && item.date < endOfMonth)
          .reduce((sum, item) => sum + item.amount, 0);

        dataValues.push({ name: thaiMonths[m.getMonth()], amount: sum });
      }
    }

    setChartData(dataValues);
  };

  // Perform Reset Balance
  const handleConfirmReset = async () => {
    setIsResetting(true);
    try {
      const currentResetAmount = totalAmount;

      // 1. Reset total amount in Firestore
      await setDoc(doc(db, 'donation', 'total'), {
        amount: 0,
        lastResetAt: serverTimestamp()
      }, { merge: true });

      // 2. Record to ResetHistory collection
      await addDoc(collection(db, 'ResetHistory'), {
        amount: currentResetAmount,
        resetBy: 'ผู้ดูแลระบบ (Web Dashboard)',
        note: 'รีเซ็ตยอดเงินผ่าน Web Dashboard',
        timestamp: serverTimestamp()
      });

      // 3. Record to SystemLogs
      await addDoc(collection(db, 'SystemLogs'), {
        action: 'รีเซ็ตยอดเงินในตู้ผ่าน Web Dashboard',
        user: 'ผู้ดูแลระบบ',
        note: `สรุปยอดเงินจากการรีเซ็ต: ฿${formatCurrency(currentResetAmount)} บาท`,
        type: 'admin',
        timestamp: serverTimestamp()
      });

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      setShowResetModal(false);
    } catch (err) {
      console.error('Error resetting balance:', err);
      alert('เกิดข้อผิดพลาดในการรีเซ็ตยอดเงิน: ' + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  // Open Tax document modal from Dashboard
  const openTaxDocument = (type, data) => {
    if (type === 'single') {
      setTaxDocData({
        type: 'single',
        templeName: 'วัดโคกเสือ',
        docNo: `TAX-${data.timestamp ? new Date(data.timestamp).getTime().toString().slice(-6) : Date.now().toString().slice(-6)}`,
        timestamp: data.timestamp,
        periodLabel: `รอบรีเซ็ตเมื่อ ${formatDateTime(data.timestamp)}`,
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

  return (
    <section className="page-section">

      {/* Top Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.25rem',
        gap: '1rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gray-600)' }}>
            ระบบตู้บริจาคเงินอัจฉริยะ วัดโคกเสือ
          </span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-cards">
        <div className="card stat-card gradient-primary glass-panel">
          <div className="stat-icon"><Wallet /></div>
          <div className="stat-details">
            <p className="stat-title">ยอดเงินบริจาคในตู้ปัจจุบัน</p>
            <h3 className="stat-value">{formatCurrency(totalAmount)} <span>บาท</span></h3>
          </div>
        </div>
        <div className="card stat-card glass-panel">
          <div className="stat-icon text-indigo" style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)' }}><TrendingUp /></div>
          <div className="stat-details">
            <p className="stat-title">ยอดบริจาครายวัน</p>
            <h3 className="stat-value text-dark" style={{ color: 'var(--dark)' }}>{formatCurrency(dailyAmount)} <span className="text-sm">บาท</span></h3>
          </div>
        </div>
        <div className="card stat-card glass-panel">
          <div className="stat-icon text-amber" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--amber)' }}><CalendarRange /></div>
          <div className="stat-details">
            <p className="stat-title">ยอดบริจาครายสัปดาห์</p>
            <h3 className="stat-value text-dark" style={{ color: 'var(--dark)' }}>{formatCurrency(weeklyAmount)} <span className="text-sm">บาท</span></h3>
          </div>
        </div>
      </div>

      {/* Chart Card */}
      <div className="card glass-panel mt-4" style={{ padding: '1.75rem' }}>
        <div className="card-header">
          <h2>
            <BarChart3 className="text-indigo" size={22} />
            สถิติกราฟยอดบริจาค
          </h2>
          <div className="card-actions">
            <select 
              className="styled-select" 
              value={chartPeriod}
              onChange={(e) => setChartPeriod(e.target.value)}
            >
              <option value="daily">รายวัน 7 วันล่าสุด</option>
              <option value="weekly">รายสัปดาห์</option>
              <option value="monthly">รายเดือน</option>
            </select>
          </div>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} interval={0} />
              <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} width={45} tickFormatter={(value) => `${value} ฿`} />
              <Tooltip 
                cursor={{ fill: 'rgba(99, 102, 241, 0.04)' }}
                contentStyle={{ background: '#0F172A', color: 'white', borderRadius: '8px', border: 'none' }}
                formatter={(value) => [`${value.toLocaleString()} บาท`, 'ยอดบริจาค']}
              />
              <Bar dataKey="amount" fill="#6366F1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            maxWidth: '460px',
            width: '100%',
            padding: '2rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#EF4444',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem'
              }}>
                <AlertTriangle size={28} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--dark)' }}>
                ยืนยันการรีเซ็ตยอดเงินในตู้
              </h3>
              <p style={{ marginTop: '8px', fontSize: '0.925rem', color: 'var(--gray-500)', lineHeight: '1.5' }}>
                ท่านกำลังจะรีเซ็ตยอดเงินและถอนเงินออกจากตู้
              </p>
            </div>

            <div style={{
              background: '#F8FAFC',
              border: '1px dashed #CBD5E1',
              borderRadius: '10px',
              padding: '1rem 1.25rem',
              textAlign: 'center',
              marginBottom: '1.5rem'
            }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--gray-500)', display: 'block', marginBottom: '4px' }}>
                ยอดเงินที่จะสรุปและถอนออกรอบนี้
              </span>
              <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#059669' }}>
                ฿{formatCurrency(totalAmount)}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--gray-500)', display: 'block', marginTop: '4px' }}>
                วันที่เวลาถอน: {formatDateTime(new Date())}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: 'white',
                  color: 'var(--gray-700)',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={isResetting}
                style={{
                  flex: 1.2,
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#EF4444',
                  color: 'white',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {isResetting ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    ยืนยันรีเซ็ตเป็น ฿0
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Tax Document Modal */}
      <TaxDocumentModal
        isOpen={isTaxModalOpen}
        onClose={() => setIsTaxModalOpen(false)}
        documentData={taxDocData}
      />

    </section>
  );
}

