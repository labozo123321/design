import { Config } from "@remotion/cli/config";

// Grain and fine glitch detail survive compression better with a low CRF.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setCodec("h264");
Config.setCrf(16);
Config.setPixelFormat("yuv420p");
Config.setOverwriteOutput(true);
