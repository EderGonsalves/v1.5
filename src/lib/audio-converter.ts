import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

/**
 * Resolve o caminho do FFmpeg:
 * 1. ffmpeg-static (binário do npm, se existir no disco)
 * 2. ffmpeg do sistema (PATH)
 */
function getFfmpegPath(): string {
  // Tentar ffmpeg-static apenas se o binário realmente existir no disco
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const staticPath = require("ffmpeg-static") as string;
    if (staticPath && existsSync(staticPath)) return staticPath;
  } catch {
    // ffmpeg-static não instalado — ignorar
  }

  // Fallback: ffmpeg instalado no sistema
  try {
    execFileSync("ffmpeg", ["-version"], { timeout: 5_000, stdio: "ignore" });
    return "ffmpeg";
  } catch {
    throw new Error(
      "FFmpeg não encontrado. Instale com: apt install ffmpeg (Linux) ou adicione ffmpeg-static ao projeto.",
    );
  }
}

let resolvedFfmpegPath: string | null = null;

function ffmpeg(): string {
  if (!resolvedFfmpegPath) {
    resolvedFfmpegPath = getFfmpegPath();
  }
  return resolvedFfmpegPath;
}

/**
 * Converte qualquer áudio para OGG/OPUS — formato nativo do WhatsApp.
 * Se o arquivo já for OGG, retorna sem conversão.
 */
export async function convertAudioToOggOpus(
  inputBuffer: Buffer,
  originalMime: string,
  originalFilename: string,
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const baseMime = originalMime.split(";")[0].trim();

  if (baseMime === "audio/ogg") {
    return {
      buffer: inputBuffer,
      mimeType: "audio/ogg",
      filename: originalFilename,
    };
  }

  const id = randomUUID();
  const inputPath = join(tmpdir(), `audio-in-${id}.tmp`);
  const outputPath = join(tmpdir(), `audio-out-${id}.ogg`);

  try {
    await writeFile(inputPath, inputBuffer);

    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpeg(),
        [
          "-i", inputPath,
          "-map_metadata", "-1",
          "-c:a", "libopus",
          "-b:a", "48k",
          "-ar", "48000",
          "-ac", "1",
          "-f", "ogg",
          "-y",
          outputPath,
        ],
        { timeout: 30_000 },
        (error, _stdout, stderr) => {
          if (error) {
            reject(
              new Error(
                `FFmpeg conversion failed: ${error.message}\n${stderr}`,
              ),
            );
          } else {
            resolve();
          }
        },
      );
    });

    const converted = await readFile(outputPath);
    const filename = originalFilename.replace(/\.[^.]+$/, ".ogg");

    return { buffer: converted, mimeType: "audio/ogg", filename };
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
