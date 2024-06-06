import { _flushOutputBuffer } from "./fs.js";

export const argv = ["js"];
export const argv0 = "js";
export const env = {};
export const getuid = () => -1;
export const getgid = () => -1;
export const geteuid = () => -1;
export const getegid = () => -1;
export const pid = -1;
export const ppid = -1;
export const getgroups = () => throw_(createENOSYS());
export const umask = () => throw_(createENOSYS());
export const cwd = () => "/app";
export const chdir = () => throw_(createENOSYS());
export function exit(code = undefined) {
  if (code != null) {
    exitCode = code;
  }
  _flushOutputBuffer();
  if (exitCode) {
    console.error(`exit code: ${exitCode}`);
  } else {
    console.log(`exit code: ${exitCode}`);
  }
  // close();
  // stop();
}
export let exitCode = 0;
export default {
  __proto__: null,
  argv,
  argv0,
  env,
  getuid,
  getgid,
  geteuid,
  getegid,
  pid,
  ppid,
  getgroups,
  umask,
  cwd,
  chdir,
  exit,
  get exitCode() {
    return exitCode;
  },
  set exitCode(v) {
    exitCode = v;
  },
};
