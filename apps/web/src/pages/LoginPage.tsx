import { Archive, ArrowRight, LockKeyhole } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { Field, Notice } from '../components/ui';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  if (user) return <Navigate to="/" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '登录失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="logo light">
          <span className="logo-mark">IB</span>
          <span>ItemBack</span>
        </div>
        <div className="story-copy">
          <p className="eyebrow">为长期拥有而记录</p>
          <h1>
            每件物品，
            <br />
            都有一段去处。
          </h1>
          <p>保存它的价值、位置、时间与相关资料。几年后再回看，仍然清楚、完整、可信。</p>
        </div>
        <div className="story-foot">
          <Archive size={17} />
          <span>私密的个人物品档案</span>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <span className="login-icon">
            <LockKeyhole />
          </span>
          <p className="eyebrow">欢迎回来</p>
          <h2>打开你的档案</h2>
          <p className="form-intro">使用在环境变量中初始化的管理员账号登录。</p>
          {error && <Notice>{error}</Notice>}
          <Field label="邮箱">
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@itemback.local"
            />
          </Field>
          <Field label="密码">
            <input
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
            />
          </Field>
          <button className="button primary wide" disabled={busy}>
            {busy ? (
              '正在验证…'
            ) : (
              <>
                进入 ItemBack <ArrowRight size={17} />
              </>
            )}
          </button>
          <p className="security-note">会话保存在安全的 HttpOnly Cookie 中，浏览器脚本无法读取。</p>
        </form>
      </section>
    </main>
  );
}
