import fs from "node:fs";
import path from "node:path";
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import type { NoticeItem } from "@/types/contracts";

type NoticePdfInput = {
  noticeId: string;
  enterpriseName: string;
  createdAt: string;
  inspector?: string;
  inspectedAt?: string;
  items: NoticeItem[];
};

const PDF_FONT_FAMILY = "NoticePdfSans";
let resolvedFontFamily: string | null | undefined;
let resolvedFontSource: string | null | undefined;

const REMOTE_CJK_FONT_URLS = [
  process.env.NOTICE_PDF_FONT_URL?.trim(),
  "https://cdn.jsdelivr.net/gh/adobe-fonts/source-han-sans@release/OTF/SimplifiedChinese/SourceHanSansSC-Regular.otf",
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf"
].filter((value): value is string => Boolean(value));

function normalizeFontPath(candidate: string) {
  return path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
}

function isHttpUrl(candidate: string) {
  return candidate.startsWith("http://") || candidate.startsWith("https://");
}

function resolveFontCandidates() {
  return [
    process.env.NOTICE_PDF_FONT_PATH?.trim(),
    ...REMOTE_CJK_FONT_URLS,
    path.join(process.cwd(), "public", "fonts", "NotoSansSC-Regular.ttf"),
    path.join(process.cwd(), "public", "fonts", "NotoSansSC-Regular.otf"),
    path.join(process.cwd(), "public", "fonts", "SourceHanSansSC-Regular.otf"),
    "C:\\Windows\\Fonts\\simhei.ttf",
    "C:\\Windows\\Fonts\\simfang.ttf",
    "C:\\Windows\\Fonts\\simsun.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Supplemental/Songti.ttc"
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => (isHttpUrl(value) ? value : normalizeFontPath(value)));
}

function ensurePdfFontFamily() {
  if (resolvedFontFamily !== undefined) {
    return resolvedFontFamily;
  }

  let lastError: unknown = null;
  for (const candidate of resolveFontCandidates()) {
    try {
      if (!isHttpUrl(candidate) && !fs.existsSync(candidate)) {
        continue;
      }

      Font.register({ family: PDF_FONT_FAMILY, src: candidate });
      resolvedFontFamily = PDF_FONT_FAMILY;
      resolvedFontSource = candidate;
      return resolvedFontFamily;
    } catch (error) {
      lastError = error;
    }
  }

  resolvedFontFamily = null;
  resolvedFontSource = null;
  const hint = "Configure NOTICE_PDF_FONT_PATH or add a CJK font under public/fonts.";
  if (lastError) {
    console.warn(`Failed to register a CJK PDF font. ${hint}`, lastError);
  } else {
    console.warn(`No CJK PDF font found. ${hint}`);
  }
  return resolvedFontFamily;
}

export function getNoticePdfFontDebugInfo() {
  ensurePdfFontFamily();
  return {
    fontFamily: resolvedFontFamily,
    fontSource: resolvedFontSource
  };
}

function createStyles(fontFamily?: string | null) {
  return StyleSheet.create({
    page: {
      padding: 28,
      fontSize: 11,
      ...(fontFamily ? { fontFamily } : {})
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
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function NoticeDoc(props: NoticePdfInput & { fontFamily?: string | null }) {
  const { noticeId, enterpriseName, createdAt, inspector, inspectedAt, items, fontFamily } = props;
  const styles = createStyles(fontFamily);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>企业安全检查整改通知单</Text>
        <View style={styles.section}>
          <Text style={styles.line}>通知单编号：{noticeId}</Text>
          <Text style={styles.line}>被检查单位：{enterpriseName}</Text>
          <Text style={styles.line}>检查人：{inspector || "未填写"}</Text>
          <Text style={styles.line}>检查日期：{inspectedAt || formatDate(createdAt)}</Text>
          <Text style={styles.line}>生成时间：{formatDateTime(createdAt)}</Text>
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

export async function renderNoticePdfBuffer(input: NoticePdfInput) {
  const doc = <NoticeDoc {...input} fontFamily={ensurePdfFontFamily()} />;
  return renderToBuffer(doc);
}
