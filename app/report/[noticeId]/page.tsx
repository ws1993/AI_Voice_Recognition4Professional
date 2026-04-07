import { readNoticeReport } from "@/lib/store/repository";

export const runtime = "nodejs";

export default async function NoticeReportPage({ params }: { params: Promise<{ noticeId: string }> }) {
  const { noticeId } = await params;
  const report = await readNoticeReport(noticeId);

  if (!report) {
    return (
      <div className="container">
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>通知单不存在</h3>
          <p className="meta">编号：{noticeId}</p>
          <a className="btn-secondary btn" href="/">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            返回首页
          </a>
        </section>
      </div>
    );
  }

  const pdfHref = `/api/report/${report.noticeId}/pdf`;

  return (
    <div className="container">
      <section className="hero">
        <h1>通知单详情</h1>
        <p>{report.noticeId}</p>
      </section>
      <section className="panel">
        <p className="meta">企业：{report.enterpriseName}</p>
        {report.inspector ? <p className="meta">检查人：{report.inspector}</p> : null}
        {report.inspectedAt ? <p className="meta">检查日期：{report.inspectedAt}</p> : null}
        <p className="meta">生成时间：{new Date(report.createdAt).toLocaleString("zh-CN")}</p>
        {report.items.map((item, index) => (
          <div className="segment-item" key={`${item.violatedClauseCode}-${index}`}>
            <strong>
              {index + 1}. {item.problemDescription}
            </strong>
            <p className="meta">违反条款：{item.violatedClauseCode}</p>
            <p className="meta">条款内容：{item.violatedClauseText}</p>
            <p className="meta">整改建议：{item.rectificationSuggestion}</p>
            <p className="meta">依据标准：{item.standardBasis}</p>
          </div>
        ))}
        <div className="row">
          <a className="btn-primary btn" href={pdfHref} target="_blank" rel="noreferrer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            下载 PDF
          </a>
          <a className="btn-secondary btn" href="/">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            返回首页
          </a>
        </div>
      </section>
    </div>
  );
}
