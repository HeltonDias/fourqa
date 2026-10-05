const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "frontend", "public", "icons", "reteste.png");

function findRetestePng(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      const nested = findRetestePng(full);
      if (nested) return nested;
    } else if (/reteste\.png$/i.test(name)) {
      return full;
    }
  }
  return null;
}

const src =
  findRetestePng(path.join(root, "fonte", "util")) ??
  path.join(root, "fonte", "util", "loop.png");

if (!fs.existsSync(src)) {
  console.error("reteste.png não encontrado em fonte/util/");
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(JSON.stringify({ from: src, to: dest }));
