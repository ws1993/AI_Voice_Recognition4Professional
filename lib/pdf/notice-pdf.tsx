import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import type { NoticeItem } from "@/types/contracts";

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 11
  },
  title: {
    textAlign: "center",
    fontSize: 18,
    marginBottom: 18
  },
  section: {
    marginBottom: 12
  },
  line: {
    marginBottom: 4
  },
  tableHeader: {
    borderBottom: "1 solid #000",
    paddingBottom: 4,
    marginBottom: 6
  },
  itemBox: {
    borderBottom: "1 solid #ddd",
    paddingBottom: 6,
    marginBottom: 8
  },
  small: {
    fontSize: 10,
    color: "#444"
  }
});

function NoticeDoc(props: {
  noticeId: string;
  enterpriseName: string;
  createdAt: string;
  inspector?: string;
  inspectedAt?: string;
  items: NoticeItem[];
}) {
  const { noticeId, enterpriseName, createdAt, inspector, inspectedAt, items } = props;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>企业安全检查整改通知单</Text>
        <View style={styles.section}>
          <Text style={styles.line}>通知单编号：{noticeId}</Text>
          <Text style={styles.line}>被检查单位：{enterpriseName}</Text>
          <Text style={styles.line}>检查人：{inspector || "未填写"}</Text>
          <Text style={styles.line}>检查日期：{inspectedAt || new Date(createdAt).toLocaleDateString("zh-CN")}</Text>
          <Text style={styles.line}>生成时间：{new Date(createdAt).toLocaleString("zh-CN")}</Text>
        </View>

        <View style={[styles.section, styles.tableHeader]}>
          <Text>问题清单（问题描述 / 违反条款 / 整改建议 / 依据标准）</Text>
        </View>

        {items.map((item, idx) => (
          <View style={styles.itemBox} key={`${item.violatedClauseCode}-${idx}`}>
            <Text style={styles.line}>[{idx + 1}] 问题描述：{item.problemDescription}</Text>
            <Text style={styles.line}>违反条款：{item.violatedClauseCode}</Text>
            <Text style={styles.line}>条款内容：{item.violatedClauseText}</Text>
            <Text style={styles.line}>整改建议：{item.rectificationSuggestion}</Text>
            <Text style={styles.line}>依据标准：{item.standardBasis}</Text>
            <Text style={styles.small}>置信度：{item.confidence.toFixed(2)}</Text>
          </View>
        ))}

        <View style={styles.section}>
          <Text>请贵单位针对以上问题立即组织整改，并按规定完成闭环。</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderNoticePdfBuffer(input: {
  noticeId: string;
  enterpriseName: string;
  createdAt: string;
  inspector?: string;
  inspectedAt?: string;
  items: NoticeItem[];
}) {
  const doc = <NoticeDoc {...input} />;
  return renderToBuffer(doc);
}
