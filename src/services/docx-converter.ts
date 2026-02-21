/**
 * DOCX → HTML Converter — Server-only
 * Uses mammoth for body content + jszip for header/footer extraction
 */

import mammoth from "mammoth";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Main converter
// ---------------------------------------------------------------------------

export async function convertDocxToHtml(docxBuffer: Buffer): Promise<{
  html: string;
  warnings: string[];
}> {
  // 1. Convert body with mammoth (images to base64 inline)
  const result = await mammoth.convertToHtml(
    { buffer: docxBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.readAsBase64String();
        return {
          src: `data:${image.contentType};base64,${base64}`,
        };
      }),
    },
  );

  const bodyHtml = result.value;
  const warnings = result.messages
    .filter((m) => m.type === "warning")
    .map((m) => m.message);

  // 2. Extract headers and footers from DOCX ZIP
  let headerHtml = "";
  let footerHtml = "";

  try {
    const zip = await JSZip.loadAsync(docxBuffer);
    headerHtml = await extractPartHtml(zip, "header");
    footerHtml = await extractPartHtml(zip, "footer");
  } catch (err) {
    warnings.push(
      `Falha ao extrair cabeçalho/rodapé: ${err instanceof Error ? err.message : "erro desconhecido"}`,
    );
  }

  // 3. Assemble final HTML
  const parts: string[] = [];

  if (headerHtml.trim()) {
    parts.push(
      `<div class="doc-header" style="border-bottom: 1px solid #ddd; padding-bottom: 12px; margin-bottom: 16px;">${headerHtml}</div>`,
    );
  }

  parts.push(bodyHtml);

  if (footerHtml.trim()) {
    parts.push(
      `<div class="doc-footer" style="border-top: 1px solid #ddd; padding-top: 12px; margin-top: 16px;">${footerHtml}</div>`,
    );
  }

  return { html: parts.join("\n"), warnings };
}

// ---------------------------------------------------------------------------
// Header/Footer XML extraction
// ---------------------------------------------------------------------------

async function extractPartHtml(
  zip: JSZip,
  partType: "header" | "footer",
): Promise<string> {
  // Find all header/footer XML files
  const pattern = new RegExp(`^word/${partType}\\d+\\.xml$`);
  const partFiles = Object.keys(zip.files).filter((f) => pattern.test(f));

  if (!partFiles.length) return "";

  // Use the first one (typically the default header/footer)
  const partFile = partFiles[0];
  const xml = await zip.file(partFile)!.async("text");

  // Load relationships for this part (to resolve image references)
  const relsPath = partFile.replace(
    `word/${partType}`,
    `word/_rels/${partType}`,
  ) + ".rels";
  const imageMap = await buildImageMap(zip, relsPath);

  // Parse the XML and build HTML
  return parseDocxXmlToHtml(xml, imageMap);
}

async function buildImageMap(
  zip: JSZip,
  relsPath: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const relsFile = zip.file(relsPath);
  if (!relsFile) return map;

  const relsXml = await relsFile.async("text");

  // Extract Relationship elements: <Relationship Id="rId1" Target="media/image1.png" Type="...image"/>
  const relPattern =
    /Relationship\s[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*Type="[^"]*image[^"]*"/g;
  const relPatternAlt =
    /Relationship\s[^>]*Type="[^"]*image[^"]*"[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;

  for (const pattern of [relPattern, relPatternAlt]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(relsXml)) !== null) {
      const rId = match[1];
      const target = match[2];
      // Target is relative to word/ dir
      const imagePath = target.startsWith("/")
        ? target.slice(1)
        : `word/${target}`;

      const imageFile = zip.file(imagePath);
      if (imageFile) {
        const imageData = await imageFile.async("base64");
        const ext = target.split(".").pop()?.toLowerCase() ?? "png";
        const mimeType =
          ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "gif"
              ? "image/gif"
              : ext === "svg"
                ? "image/svg+xml"
                : "image/png";
        map.set(rId, `data:${mimeType};base64,${imageData}`);
      }
    }
  }

  return map;
}

function parseDocxXmlToHtml(
  xml: string,
  imageMap: Map<string, string>,
): string {
  const htmlParts: string[] = [];

  // Extract paragraphs: <w:p ...>...</w:p>
  const paragraphPattern = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let pMatch: RegExpExecArray | null;

  while ((pMatch = paragraphPattern.exec(xml)) !== null) {
    const pXml = pMatch[0];
    const runs: string[] = [];

    // Extract text runs: <w:r>...<w:t ...>text</w:t>...</w:r>
    const runPattern = /<w:r[\s>][\s\S]*?<\/w:r>/g;
    let rMatch: RegExpExecArray | null;
    while ((rMatch = runPattern.exec(pXml)) !== null) {
      const rXml = rMatch[0];
      const textMatch = rXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
      if (textMatch) {
        let text = textMatch[1];
        // Check for bold
        if (/<w:b[\s/>]/.test(rXml) && !/<w:b\s+w:val="false"/.test(rXml)) {
          text = `<strong>${text}</strong>`;
        }
        // Check for italic
        if (/<w:i[\s/>]/.test(rXml) && !/<w:i\s+w:val="false"/.test(rXml)) {
          text = `<em>${text}</em>`;
        }
        runs.push(text);
      }
    }

    // Extract images: <a:blip r:embed="rId1"/>
    const blipPattern = /r:embed="([^"]+)"/g;
    let blipMatch: RegExpExecArray | null;
    while ((blipMatch = blipPattern.exec(pXml)) !== null) {
      const rId = blipMatch[1];
      const dataUri = imageMap.get(rId);
      if (dataUri) {
        runs.push(
          `<img src="${dataUri}" style="max-width: 100%; height: auto;" />`,
        );
      }
    }

    if (runs.length > 0) {
      htmlParts.push(`<p>${runs.join("")}</p>`);
    }
  }

  return htmlParts.join("\n");
}
