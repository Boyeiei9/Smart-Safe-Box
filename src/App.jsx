import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc } from 'firebase/firestore';
import { db } from './firebase';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Status from './components/Status';
import History from './components/History';
import Alerts from './components/Alerts';
import Logs from './components/Logs';
import Admins from './components/Admins';
import { LayoutDashboard, Box, History as HistoryIcon, Bell, Settings, UserCheck, Heart } from 'lucide-react';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [activeIssues, setActiveIssues] = useState(0);
  const [lastSeenAlertTime, setLastSeenAlertTime] = useState(() => {
    return Number(localStorage.getItem('lastSeenAlertTime')) || 0;
  });
  const [currentUserId, setCurrentUserId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const uId = params.get('userId');
    if (uId) {
      localStorage.setItem('lineUserId', uId);
      return uId;
    }
    return localStorage.getItem('lineUserId') || '';
  });
  const [currentUserRole, setCurrentUserRole] = useState('Staff');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uId = params.get('userId');
    if (uId) {
      localStorage.setItem('lineUserId', uId);
      setCurrentUserId(uId);
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setCurrentUserRole('Staff');
      return;
    }
    const userDocRef = doc(db, 'Users', currentUserId);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setCurrentUserRole(docSnap.data().role || 'Staff');
      } else {
        setCurrentUserRole('Staff');
      }
    }, (error) => {
      console.error('Error fetching current user:', error);
      setCurrentUserRole('Staff');
    });
    return () => unsubscribe();
  }, [currentUserId]);

  // Sync state with URL params and hash
  useEffect(() => {
    const handleUrlSync = () => {
      // 1. Check query parameter first
      const params = new URLSearchParams(window.location.search);
      let page = params.get('page');
      
      // 2. If no query parameter, check hash
      if (!page) {
        const hash = window.location.hash.substring(1); // Remove '#'
        if (hash) {
          // Map legacy hash to activeTab ID
          if (hash === 'donations') {
            page = 'history';
          } else {
            page = hash;
          }
        }
      }
      
      // 3. Fallback to dashboard
      if (!page) page = 'dashboard';
      
      setActiveTab(page);
    };

    handleUrlSync();
    
    // Listen for hash change and popstate
    window.addEventListener('hashchange', handleUrlSync);
    window.addEventListener('popstate', handleUrlSync);
    
    return () => {
      window.removeEventListener('hashchange', handleUrlSync);
      window.removeEventListener('popstate', handleUrlSync);
    };
  }, []);

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    
    // Update URL query parameters and clear hash
    const url = new URL(window.location);
    url.searchParams.set('page', tabId);
    url.hash = ''; // Clear legacy hash
    window.history.pushState(null, '', url);

    // If viewing alerts, clear the unread count
    if (tabId === 'alerts') {
      const now = Date.now();
      setLastSeenAlertTime(now);
      localStorage.setItem('lastSeenAlertTime', now);
    }
  };

  // Subscribe to Alert count (for Badge)
  useEffect(() => {
    const q = query(collection(db, 'Alerts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let unread = 0;
      snapshot.forEach((docSnap) => {
        const ts = docSnap.data().timestamp?.toMillis() || 0;
        if (ts > lastSeenAlertTime) {
          unread++;
        }
      });
      setUnreadAlerts(unread);
    });
    return () => unsubscribe();
  }, [lastSeenAlertTime]);

  // Subscribe to BoxStatus to check errors (for Status badge)
  useEffect(() => {
    const docRef = doc(db, 'Donation_Box', 'box1');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let issues = 0;
        const wifiStatus = data.wifi || 'online';
        const coinStatus = data.coin || 'online';
        const vibStatus = data.vib || 'online';
        
        if (wifiStatus !== 'online') issues++;
        if (coinStatus !== 'online') issues++;
        if (vibStatus !== 'online') issues++;
        setActiveIssues(issues);
      }
    });
    return () => unsubscribe();
  }, []);

  // Render correct tab panel
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'status':
        return <Status />;
      case 'history':
        return <History />;
      case 'alerts':
        return <Alerts />;
      case 'logs':
        return <Logs />;
      case 'admins':
        return currentUserRole === 'SuperAdmin' ? <Admins /> : <Dashboard />;
      default:
        return <Dashboard />;
    }
  };

  const allMenuItems = [
    { id: 'dashboard', label: 'รายงานยอดเงิน', line1: 'รายงาน', line2: 'ยอดเงิน', icon: <LayoutDashboard size={20} /> },
    { id: 'status', label: 'สถานะของตู้', line1: 'สถานะ', line2: 'ของตู้', icon: <Box size={20} />, badge: activeTab === 'status' ? 0 : activeIssues },
    { id: 'history', label: 'ประวัติการบริจาค', line1: 'ประวัติ', line2: 'บริจาค', icon: <HistoryIcon size={20} /> },
    { id: 'alerts', label: 'ประวัติแจ้งเตือน', line1: 'ประวัติ', line2: 'แจ้งเตือน', icon: <Bell size={20} />, badge: unreadAlerts },
    { id: 'logs', label: 'ประวัติใช้งานตู้', line1: 'ประวัติ', line2: 'การใช้งาน', icon: <Settings size={20} /> },
    { id: 'admins', label: 'ผู้ดูแลระบบ', line1: 'ผู้ดูแล', line2: 'ระบบ', icon: <UserCheck size={20} /> }
  ];

  const menuItems = allMenuItems.filter(item => {
    if (item.id === 'admins') {
      return currentUserRole === 'SuperAdmin';
    }
    return true;
  });

  return (
    <div className="dashboard-container">
      {/* Sidebar - Desktop Only */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-icon">
            <Heart fill="white" size={20} />
          </div>
          <h2>Smart Donate</h2>
        </div>
        <nav className="sidebar-nav">
          {menuItems.map((item) => (
            <div
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => switchTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge > 0 && (
                <span className="badge badge-pulse">
                  {item.badge}
                </span>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <Header />
        {renderContent()}
      </main>

      {/* Bottom Navigation - Mobile Only */}
      <nav className="mobile-bottom-nav">
        {menuItems.map((item) => (
          <div
            key={item.id}
            className={`mobile-nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => switchTab(item.id)}
          >
            {item.icon}
            <div className="mobile-nav-label">
              <div>{item.line1}</div>
              <div>{item.line2}</div>
            </div>
            {item.badge > 0 && (
              <span className="badge badge-pulse">
                {item.badge}
              </span>
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}

export default App;
