import { fs, vol } from "memfs";
import bindAll from "lodash.bindall";

vol.fromJSON({
  "/message.txt": "Hello from fake fs!",
});
console.log("vol", vol.toJSON());

bindAll(fs);
const writeSyncOld = fs.writeSync;
const writeOld = fs.write;
const decoder = new TextDecoder();
let outputBuffer = "";
export function _flushOutputBuffer() {
  if (outputBuffer.length > 0) {
    console.log(outputBuffer);
    outputBuffer = "";
  }
}
fs.writeSync = (fd, buffer, offset, length, position) => {
  if ((fd !== 1 && fd !== 2) || position != null) {
    return writeSyncOld(fd, buffer, offset, length, position);
  }
  const bytes = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset + (offset ?? 0),
    buffer.byteLength - (offset ?? 0)
  );
  outputBuffer += decoder.decode(bytes);
  const newlineIndex = outputBuffer.lastIndexOf("\n");
  if (newlineIndex !== -1) {
    const text = outputBuffer.slice(0, newlineIndex);
    outputBuffer = outputBuffer.slice(newlineIndex + 1);
    console.log(text);
  }
  return bytes.length;
};
fs.write = (fd, buffer, offset, length, position, callback) => {
  if ((fd !== 1 && fd !== 2) || position != null) {
    return writeOld(fd, buffer, offset, length, position, callback);
  }
  let x;
  try {
    x = fs.writeSync(fd, buffer, offset, length, position);
  } catch (e) {
    callback(e);
  }
  callback(null, x);
};
export const {
  appendFile,
  appendFileSync,
  access,
  accessSync,
  chown,
  chownSync,
  chmod,
  chmodSync,
  close,
  closeSync,
  copyFile,
  copyFileSync,
  cp,
  cpSync,
  createReadStream,
  createWriteStream,
  exists,
  existsSync,
  fchown,
  fchownSync,
  fchmod,
  fchmodSync,
  fdatasync,
  fdatasyncSync,
  fstat,
  fstatSync,
  fsync,
  fsyncSync,
  ftruncate,
  ftruncateSync,
  futimes,
  futimesSync,
  lchown,
  lchownSync,
  lchmod,
  lchmodSync,
  link,
  linkSync,
  lstat,
  lstatSync,
  lutimes,
  lutimesSync,
  mkdir,
  mkdirSync,
  mkdtemp,
  mkdtempSync,
  open,
  openSync,
  openAsBlob,
  readdir,
  readdirSync,
  read,
  readSync,
  readv,
  readvSync,
  readFile,
  readFileSync,
  readlink,
  readlinkSync,
  realpath,
  realpathSync,
  rename,
  renameSync,
  rm,
  rmSync,
  rmdir,
  rmdirSync,
  stat,
  statfs,
  statSync,
  statfsSync,
  symlink,
  symlinkSync,
  truncate,
  truncateSync,
  unwatchFile,
  unlink,
  unlinkSync,
  utimes,
  utimesSync,
  watch,
  watchFile,
  writeFile,
  writeFileSync,
  write,
  writeSync,
  writev,
  writevSync,
  Dirent,
  Stats,
  ReadStream,
  WriteStream,
  FileReadStream,
  FileWriteStream,
  _toUnixTimestamp,
  Dir,
  opendir,
  opendirSync,
  F_OK,
  R_OK,
  W_OK,
  X_OK,
  constants,
  promises,
} = fs;
export default fs;
