import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const fileInput = document.getElementById("file");
const btn = document.getElementById("convert");
const logEl = document.getElementById("log");
const bar = document.getElementById("bar");
const result = document.getElementById("result");
const player = document.getElementById("player");
const download = document.getElementById("download");

// NEW
const drop = document.getElementById("drop");         // container da dropzone
const qualitySel = document.getElementById("quality"); // select de qualidade

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

function isProbablyOpus(file) {
    const name = (file?.name || "").toLowerCase();
    const type = (file?.type || "").toLowerCase();

    const nameOk = name.endsWith(".opus") || name.endsWith(".ogg");
    const typeOk = type.includes("ogg") || type.includes("opus") || type.includes("audio");
    return nameOk || typeOk;
}

function setSelected(file) {
    selectedFile = file ?? null;
    btn.disabled = !selectedFile;

    resetUI();

    // limpa preview anterior (pra não vazar memória)
    if (lastObjectUrl) {
        URL.revokeObjectURL(lastObjectUrl);
        lastObjectUrl = null;
    }
    player.removeAttribute("src");

    if (!selectedFile) return;

    log(`Selected: ${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`);

    if (!isProbablyOpus(selectedFile)) {
        log("⚠️ This file may not be a WhatsApp voice note (.opus/.ogg). It may still work, but OPUS is recommended.");
    }
}

fileInput.addEventListener("change", (e) => {
    const f = e.target.files?.[0] ?? null;
    setSelected(f);
});

// Drag & Drop (NEW)
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

btn.addEventListener("click", async () => {
    if (!selectedFile) return;

    btn.disabled = true;
    resetUI();

    try {
        const f = await ensureFFmpeg();

        // pega preset de qualidade (NEW)
        const q = qualitySel?.value ?? "4"; // 6 fast, 4 balanced, 2 high

        const inputExt = (selectedFile.name.split(".").pop() || "opus").toLowerCase();
        const inputName = `input.${inputExt === "ogg" ? "ogg" : "opus"}`;
        const outputName = "output.mp3";

        log("Reading file...");
        await f.writeFile(inputName, await fetchFile(selectedFile));

        log(`Converting to MP3 (quality ${q})...`);
        await f.exec([
            "-i", inputName,
            "-vn",
            "-acodec", "libmp3lame",
            "-q:a", String(q),
            outputName
        ]);

        log("Preparing download...");
        const data = await f.readFile(outputName);
        const mp3Blob = new Blob([data.buffer], { type: "audio/mpeg" });

        const url = URL.createObjectURL(mp3Blob);
        lastObjectUrl = url;

        player.src = url;
        download.href = url;
        download.download = (selectedFile.name.replace(/\.[^/.]+$/, "") || "voice-note") + ".mp3";

        result.classList.remove("hidden");
        bar.style.width = "100%";
        log("Done ✅");
    } catch (err) {
        console.error(err);
        log("Error ❌ " + (err?.message ?? String(err)));

        // dica simples de troubleshooting
        log("Tip: If it fails, try a smaller file, close other tabs, and retry.");
    } finally {
        btn.disabled = !selectedFile;
    }
});
