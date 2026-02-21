/**
 * PDF Generator — Server-only
 * Uses puppeteer-core + system Chromium/Chrome
 * Docker: apk add --no-cache chromium → /usr/bin/chromium-browser
 * Windows: detecta Chrome automaticamente
 */

import puppeteer from "puppeteer-core";
import fs from "node:fs";

function findChromePath(): string {
  // Env override
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  // Linux / Docker
  if (process.platform !== "win32") return "/usr/bin/chromium-browser";

  // Windows — procura Chrome nos caminhos padrão
  const candidates = [
    process.env["PROGRAMFILES(X86)"] &&
      `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env.PROGRAMFILES &&
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env.LOCALAPPDATA &&
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // Fallback — deixa o puppeteer tentar
  return "chrome";
}

const CHROMIUM_PATH = findChromePath();

/**
 * Wrap body HTML with a full HTML page including legal document typography
 */
function wrapHtmlForPdf(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.7;
      color: #1a1a1a;
    }
    h1 { font-size: 16pt; font-weight: 700; margin-bottom: 16px; text-align: center; }
    h2 { font-size: 14pt; font-weight: 600; margin-bottom: 12px; margin-top: 20px; }
    h3 { font-size: 12pt; font-weight: 600; margin-bottom: 8px; margin-top: 16px; }
    p { margin-bottom: 12px; text-align: justify; }
    ul, ol { margin-bottom: 12px; padding-left: 24px; }
    li { margin-bottom: 4px; }
    strong { font-weight: 600; }
    u { text-decoration: underline; }
    em { font-style: italic; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 11pt; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    .signature-block {
      margin-top: 48px;
      display: flex;
      justify-content: space-between;
      gap: 40px;
    }
    .signature-line {
      flex: 1;
      text-align: center;
      padding-top: 8px;
      border-top: 1px solid #333;
      font-size: 10pt;
      color: #444;
    }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

// A4 at 96dpi (pixels)
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

function launchBrowser() {
  return puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
    headless: true,
  });
}

/**
 * Generate a PDF buffer from HTML content
 */
export async function generatePdf(htmlContent: string): Promise<Buffer> {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    const fullHtml = wrapHtmlForPdf(htmlContent);
    await page.setContent(fullHtml, { waitUntil: "networkidle0" });

    const pdfUint8 = await page.pdf({
      format: "A4",
      margin: { top: "25mm", bottom: "25mm", left: "20mm", right: "20mm" },
      printBackground: true,
    });

    return Buffer.from(pdfUint8);
  } finally {
    await browser.close();
  }
}

/**
 * Generate a PDF buffer + PNG previews (up to 3 pages) from HTML content.
 * Reuses a single browser session for both screenshots and PDF generation.
 */
export async function generatePdfWithPreviews(
  htmlContent: string,
  maxPreviews = 3,
): Promise<{ pdf: Buffer; previews: Buffer[] }> {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    const fullHtml = wrapHtmlForPdf(htmlContent);

    // 1. Render HTML and capture page screenshots at A4 viewport
    await page.setViewport({ width: A4_WIDTH, height: A4_HEIGHT });
    await page.setContent(fullHtml, { waitUntil: "networkidle0" });

    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const pageCount = Math.min(
      Math.ceil(bodyHeight / A4_HEIGHT),
      maxPreviews,
    );

    const previews: Buffer[] = [];
    for (let i = 0; i < pageCount; i++) {
      const screenshot = await page.screenshot({
        type: "png",
        clip: {
          x: 0,
          y: i * A4_HEIGHT,
          width: A4_WIDTH,
          height: Math.min(A4_HEIGHT, bodyHeight - i * A4_HEIGHT),
        },
      });
      previews.push(Buffer.from(screenshot));
    }

    // 2. Generate PDF from the same page
    const pdfUint8 = await page.pdf({
      format: "A4",
      margin: { top: "25mm", bottom: "25mm", left: "20mm", right: "20mm" },
      printBackground: true,
    });

    return { pdf: Buffer.from(pdfUint8), previews };
  } finally {
    await browser.close();
  }
}
