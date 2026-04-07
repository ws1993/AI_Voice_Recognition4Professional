export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container">
      <section className="hero">
        <h1>后台管理</h1>
        <p>无登录模式，使用管理密钥调用后台 API</p>
      </section>
      <section className="panel">
        <div className="row">
          <a className="btn-secondary" href="/admin/settings">
            设置
          </a>
          <a className="btn-secondary" href="/admin/terms">
            术语库
          </a>
          <a className="btn-secondary" href="/admin/clauses">
            标准条目库
          </a>
          <a className="btn-secondary" href="/">
            返回首页
          </a>
        </div>
      </section>
      {children}
    </div>
  );
}
