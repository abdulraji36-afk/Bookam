import { Config } from "@remotion/cli/config";
import fs from "node:fs";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setCodec("h264");
Config.setCrf(18);

// Cloud sandboxes ship a headless shell; locally Remotion downloads its own.
const preinstalled =
  "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
if (fs.existsSync(preinstalled)) {
  Config.setBrowserExecutable(preinstalled);
}
