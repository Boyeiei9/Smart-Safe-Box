import React, { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot, collection, query, orderBy, limit, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Wallet, CalendarRange, BarChart3, TrendingUp, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';
import TaxDocumentModal from './TaxDocumentModal';

export default function Dashboard() {
  const [totalAmount, setTotalAmount] = useState(0);
  const [dailyAmount, setDailyAmount] = useState(0);
  const [weeklyAmount, setWeeklyAmount] = useState(0);
  const [monthlyAmount, setMonthlyAmount] = useState(0);
  const [chartPeriod, setChartPeriod] = useState('daily');
  const [chartData, setChartData] = useState([]);

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

  return (
    <section className="page-section">

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
    </section>
  );
}

