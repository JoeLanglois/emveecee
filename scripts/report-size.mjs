import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const file = process.argv[2];
if (!file) throw new Error("Usage: node scripts/report-size.mjs <file>");

const source = readFileSync(file);
const gzip = gzipSync(source, { level: 9 });
const kibibytes = bytes => `${(bytes / 1024).toFixed(2)} KiB`;

console.log(`${file}: ${source.length} B (${kibibytes(source.length)}) minified`);
console.log(`${file}: ${gzip.length} B (${kibibytes(gzip.length)}) minified+gzip`);
