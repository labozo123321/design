import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setCodec("h264");
// Animated grain is costly to encode: CRF 23 keeps it filmic at a sane file size
// (lower it for a heavier master, raise it for a smaller upload).
Config.setCrf(23);
Config.setPixelFormat("yuv420p");
// Standard limited-range BT.709, so blacks stay black on social platforms.
Config.setColorSpace("bt709");
Config.setOverwriteOutput(true);
