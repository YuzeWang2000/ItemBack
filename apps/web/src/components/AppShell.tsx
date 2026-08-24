import { Archive, Boxes, LayoutDashboard, LayoutGrid, LogOut, Menu, Search, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const links = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/items', label: '所有物品', icon: LayoutGrid, end: true },
  { to: '/browse', label: '空间与物品', icon: Boxes },
  { to: '/search', label: '搜索', icon: Search },
];

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    await logout();
    navigate('/login');
  };
  return (
    <div className="app-shell">
      <header className="mobile-header">
        <button className="icon-button" onClick={() => setOpen(true)} aria-label="打开导航">
          <Menu />
        </button>
        <Logo />
        <span className="mobile-spacer" />
      </header>
      {open && (
        <button className="nav-scrim" onClick={() => setOpen(false)} aria-label="关闭导航" />
      )}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-top">
          <Logo />
          <button
            className="icon-button close-nav"
            onClick={() => setOpen(false)}
            aria-label="关闭导航"
          >
            <X />
          </button>
        </div>
        <p className="archive-label">
          <Archive size={14} /> 个人物品档案 · v0.1
        </p>
        <nav aria-label="主导航">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div>
            <span className="avatar">{user?.email.slice(0, 1).toUpperCase()}</span>
            <div>
              <small>已登录</small>
              <p>{user?.email}</p>
            </div>
          </div>
          <button className="icon-button" onClick={signOut} aria-label="退出登录">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">IB</span>
      <span>ItemBack</span>
    </div>
  );
}
