const fs = require("node:fs");
const path = require("node:path");
const { Arch } = require("builder-util");

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const arch = Arch[context.arch];
  const resourcesDir =
    platform === "darwin"
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources"
        )
      : path.join(context.appOutDir, "resources");
  const binDir = path.join(resourcesDir, "bin");
  const targetDirectory = `${platform}-${arch}`;

  if (!fs.existsSync(binDir)) {
    return;
  }

  for (const entry of fs.readdirSync(binDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === targetDirectory) {
      continue;
    }

    fs.rmSync(path.join(binDir, entry.name), {
      recursive: true,
      force: true
    });
  }
};
