const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { version } = require("./package.json");

const REPO = "circlesac/shh-env";

const PLATFORMS = {
  "darwin-x64": { artifact: "shh-env-darwin-x64", ext: ".tar.gz" },
  "darwin-arm64": { artifact: "shh-env-darwin-arm64", ext: ".tar.gz" },
  "linux-x64": { artifact: "shh-env-linux-x64", ext: ".tar.gz" },
  "linux-arm64": { artifact: "shh-env-linux-arm64", ext: ".tar.gz" },
  "win32-x64": { artifact: "shh-env-windows-x64", ext: ".zip" },
};

async function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        download(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
  });
}

async function main() {
  const platform = `${process.platform}-${process.arch}`;
  const info = PLATFORMS[platform];

  if (!info) {
    console.error(`Unsupported platform: ${platform}`);
    console.error(`Supported: ${Object.keys(PLATFORMS).join(", ")}`);
    process.exit(1);
  }

  const { artifact, ext } = info;
  const url = `https://github.com/${REPO}/releases/download/v${version}/${artifact}${ext}`;
  console.log(`Downloading ${artifact}...`);

  try {
    const data = await download(url);
    const nativeDir = path.join(__dirname, "bin", "native");

    if (!fs.existsSync(nativeDir)) {
      fs.mkdirSync(nativeDir, { recursive: true });
    }

    const tmpFile = path.join(nativeDir, `tmp${ext}`);
    fs.writeFileSync(tmpFile, data);

    if (ext === ".zip") {
      execSync(
        `powershell -Command "Expand-Archive -Force '${tmpFile}' '${nativeDir}'"`,
        { cwd: nativeDir }
      );
    } else {
      execSync(`tar xzf "${tmpFile}"`, { cwd: nativeDir });
    }
    fs.unlinkSync(tmpFile);

    if (process.platform !== "win32") {
      const binPath = path.join(nativeDir, "shh-env");
      fs.chmodSync(binPath, 0o755);
    }

    console.log(`Installed shh-env v${version}`);
  } catch (err) {
    console.error(`Failed to install: ${err.message}`);
    process.exit(1);
  }
}

module.exports = main();
