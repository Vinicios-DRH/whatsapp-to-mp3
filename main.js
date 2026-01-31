import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const fileInput = document.getElementById("file");
const btn = document.getElementById("convert");
const logEl = document.getElementById("log");
const bar = document.getElementById("bar");
const result = document.getElementById("result");
const player = document.getElementById("player");
const download = document.getElementById("download");

// Dropzone + qualidade
const drop = document.getElementById("drop");
const qualitySel = document.getElementById("quality");

let selectedFile = null;
let ffmpeg = null;
let lastObjectUrl = null;

function log(msg) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
}

function resetUI() {
    result.classList.add("hidden");
    logEl.textContent = "";
    bar.style.width = "0%";
}

function isProbablyWhatsAppVoice(file) {
    const name = (file?.name || "").toLowerCase();
    const type = (file?.type || "").toLowerCase();

    const nameOk = name.endsWith(".opus") || name.endsWith(".ogg") || name.endsWith(".m4a");
    const typeOk =
        type.includes("ogg") ||
        type.includes("opus") ||
        type.includes("mp4") || // iOS .m4a geralmente vem como audio/mp4
        type.includes("aac") ||
        type.includes("audio");

    return nameOk || typeOk;
}

function inferInputExt(file) {
    const name = (file?.name || "").toLowerCase();
    const type = (file?.type || "").toLowerCase();

    let ext = (name.split(".").pop() || "").trim();

    // Se não tem extensão, tenta inferir por mime
    if (!ext || ext === name) {
        if (type.includes("ogg")) ext = "ogg";
        else if (type.includes("opus")) ext = "opus";
        else if (type.includes("mp4")) ext = "m4a";
        else if (type.includes("aac")) ext = "aac";
        else ext = "audio";
    }

    // Normaliza algumas variações
    if (ext === "oga") ext = "ogg";
    if (ext === "mp4") ext = "m4a"; // alguns iPhones podem exportar assim

    // Whitelist de extensões seguras pro filename
    const allowed = new Set(["opus", "ogg", "m4a", "aac", "wav", "mp3", "audio"]);
    if (!allowed.has(ext)) ext = "audio";

    return ext;
}

function setSelected(file) {
    selectedFile = file ?? null;
    btn.disabled = !selectedFile;

    resetUI();

    // limpa preview anterior
    if (lastObjectUrl) {
        URL.revokeObjectURL(lastObjectUrl);
        lastObjectUrl = null;
    }
    player.removeAttribute("src");

    if (!selectedFile) return;

    const prettyType = selectedFile.type ? ` | ${selectedFile.type}` : "";
    log(`Selected: ${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB${prettyType})`);

    if (!isProbablyWhatsAppVoice(selectedFile)) {
        log("⚠️ This file may not be a WhatsApp voice note (.opus/.ogg/.m4a). It may still work, but OPUS/OGG/M4A are most common.");
    } else {
        // dica específica pra iPhone
        const n = (selectedFile.name || "").toLowerCase();
        if (n.endsWith(".m4a") || (selectedFile.type || "").toLowerCase().includes("mp4")) {
            log("iPhone detected: WhatsApp exports voice notes as .m4a when saved to Files. Converting normally ✅");
        }
    }
}

fileInput.addEventListener("change", (e) => {
    const f = e.target.files?.[0] ?? null;
    setSelected(f);
});

// Drag & Drop
if (drop) {
    ["dragenter", "dragover"].forEach((evt) => {
        drop.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            drop.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach((evt) => {
        drop.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            drop.classList.remove("dragover");
        });
    });

    drop.addEventListener("drop", (e) => {
        const f = e.dataTransfer?.files?.[0] ?? null;
        if (f) {
            fileInput.value = ""; // mantém input “limpo”
            setSelected(f);
        }
    });
}

async function ensureFFmpeg() {
    if (ffmpeg) return ffmpeg;

    ffmpeg = new FFmpeg();

    ffmpeg.on("progress", ({ progress }) => {
        const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
        bar.style.width = pct + "%";
    });

    log("Loading converter engine (first time may take ~10-30s)...");
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    log("Converter loaded ✅");
    return ffmpeg;
}

function safeBaseName(filename) {
    const base = (filename || "voice-note").replace(/\.[^/.]+$/, "");
    return base.replace(/[^\w\- ]+/g, "").trim() || "voice-note";
}

btn.addEventListener("click", async () => {
    if (!selectedFile) return;

    btn.disabled = true;
    resetUI();

    try {
        const f = await ensureFFmpeg();

        const q = qualitySel?.value ?? "4"; // 6 fast, 4 balanced, 2 high

        const inputExt = inferInputExt(selectedFile);
        const inputName = `input.${inputExt}`;
        const outputName = "output.mp3";

        log("Reading file...");
        await f.writeFile(inputName, await fetchFile(selectedFile));

        log(`Converting to MP3 (quality ${q})...`);

        // Conversão simples e robusta (opus/ogg/m4a -> mp3)
        await f.exec([
            "-i",
            inputName,
            "-vn",
            "-acodec",
            "libmp3lame",
            "-q:a",
            String(q),
            outputName,
        ]);

        log("Preparing download...");
        const data = await f.readFile(outputName);
        const mp3Blob = new Blob([data.buffer], { type: "audio/mpeg" });

        const url = URL.createObjectURL(mp3Blob);
        lastObjectUrl = url;

        player.src = url;
        download.href = url;
        download.download = safeBaseName(selectedFile.name) + ".mp3";

        result.classList.remove("hidden");
        bar.style.width = "100%";
        log("Done ✅");
    } catch (err) {
        console.error(err);
        log("Error ❌ " + (err?.message ?? String(err)));
        log("Tip: If it fails, try a smaller file, close other tabs, and retry.");
    } finally {
        btn.disabled = !selectedFile;
    }
});
