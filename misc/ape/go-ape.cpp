#include <iostream>
#include <vector>
#include <filesystem>
#include <utility>
#include <string>
#include <cstdlib>
#include <stdexcept>
#include <sstream>
#include <cosmo.h>
#include <spawn.h>
#include <sys/wait.h>
#include <sys/types.h>
#include <signal.h>

__static_yoink("zipos");

int main(int argc, char *argv[]);
std::filesystem::path user_cache_dir(const std::string& appname, const std::string& appauthor, const std::string& version);
[[noreturn]] void my_exec(const std::filesystem::path& path, char *const argv[]);

int main(int argc, char *argv[]) {
  auto const cache_dir = user_cache_dir("go", "golang", VERSION);
  if (!std::filesystem::exists(cache_dir)) {
    std::filesystem::create_directories(cache_dir);
    try {
      std::filesystem::copy("/zip/go.common", cache_dir, std::filesystem::copy_options::recursive);
#if defined(__x86_64__)
      if (IsWindows()) {
        std::filesystem::copy("/zip/go.windows-amd64", cache_dir, std::filesystem::copy_options::recursive);
      } else if (IsXnu()) {
        std::filesystem::copy("/zip/go.darwin-amd64", cache_dir, std::filesystem::copy_options::recursive);
      } else if (IsLinux()) {
        std::filesystem::copy("/zip/go.linux-amd64", cache_dir, std::filesystem::copy_options::recursive);
      } else {
        throw std::runtime_error("unsupported os");
      }
#elif defined(__aarch64__)
      if (IsWindows()) {
        std::filesystem::copy("/zip/go.windows-arm64", cache_dir, std::filesystem::copy_options::recursive);
      } else if (IsXnu()) {
        std::filesystem::copy("/zip/go.darwin-arm64", cache_dir, std::filesystem::copy_options::recursive);
      } else if (IsLinux()) {
        std::filesystem::copy("/zip/go.linux-arm64", cache_dir, std::filesystem::copy_options::recursive);
      } else {
        throw std::runtime_error("unsupported os");
      }
#else
#error "unsupported arch"
#endif
    } catch (...) {
      std::filesystem::remove_all(cache_dir);
      throw;
    }
  }
  my_exec(cache_dir / (IsWindows() ? "bin/go.exe" : "bin/go"), argv);
}

std::filesystem::path user_cache_dir(const std::string& appname, const std::string& appauthor, const std::string& version) {
  if (IsWindows()) {
    auto const localappdata_c_str = std::getenv("LOCALAPPDATA");
    if (!localappdata_c_str) {
      throw std::runtime_error("LOCALAPPDATA not set");
    }
    auto const localappdata = std::filesystem::path(localappdata_c_str);
    return localappdata / appauthor / appname / "Cache" / version;
  } else if (IsXnu()) {
    auto const home_c_str = std::getenv("HOME");
    if (!home_c_str) {
      throw std::runtime_error("HOME not set");
    }
    auto const home = std::filesystem::path(home_c_str);
    return home / "Library/Caches" / appname / version;
  } else {
    std::filesystem::path xdg_cache_home;
    if (auto const xdg_cache_home_c_str = std::getenv("XDG_CACHE_HOME")) {
      xdg_cache_home = std::filesystem::path(xdg_cache_home_c_str);
    } else {
      auto const home_c_str = std::getenv("HOME");
      if (!home_c_str) {
        throw std::runtime_error("HOME not set");
      }
      auto const home = std::filesystem::path(home_c_str);
      xdg_cache_home = home / ".cache";
    }
    return xdg_cache_home / appname / version;
  }
}

[[noreturn]] void my_exec(const std::filesystem::path& path, char *const argv[]) {
  if (IsWindows()) {
    pid_t pid;
    auto const err = posix_spawn(&pid, path.c_str(), nullptr, nullptr, argv, nullptr);
    if (err) {
      std::ostringstream oss;
      oss << "posix_spawn() " << std::strerror(err);
      throw std::runtime_error(oss.str());
    }

    int status;
    while (waitpid(pid, &status, 0) != -1);
    // TODO: Does this handle everything properly?
    if (WIFEXITED(status)) {
      std::exit(WEXITSTATUS(status));
    } else {
      std::ostringstream oss;
      oss << "waitpid() " << status;
      throw std::runtime_error(oss.str());
    }
  } else {
    auto const err = execv(path.c_str(), argv);
    if (err) {
      std::ostringstream oss;
      oss << "execv() " << std::strerror(err);
      throw std::runtime_error(oss.str());
    }
    std::unreachable();
  }
}