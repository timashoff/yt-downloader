// udav Safari Cookies
//
// Copies the YouTube cookies (youtube.com and its subdomains only) from Safari into
// udav's folder, so that udav can download when YouTube asks to sign in.
//
// macOS lets only apps with Full Disk Access read Safari cookies. This app gets that
// access instead of the terminal, and is built so that other programs cannot misuse it:
// - no arguments and fixed paths; the home folder comes from the user database, not from
//   $HOME (open --env can set any variable): nobody can point it at other files;
// - it writes only into udav's folder and only if that is a real folder, not a link;
// - it starts no other programs, so its access goes nowhere else;
// - udav signs it with the hardened runtime: DYLD_* variables cannot inject code.
// A changed binary no longer matches its signature, and macOS stops granting it access.
//
// Result, in ~/Library/Application Support/udav:
//   safari-youtube-cookies.txt  YouTube cookies, mode 600 (udav deletes it after the download)
//   safari-cookies.status       "ok <count>" or an error code: open -W returns no exit code

import Darwin

let outputName = "safari-youtube-cookies.txt"
let statusName = "safari-cookies.status"
let maxFileSize = 64 << 20

func homeDirectory() -> String? {
    guard let entry = getpwuid(getuid()), let directory = entry.pointee.pw_dir else { return nil }
    let path = String(cString: directory)
    return path.hasPrefix("/") ? path : nil
}

enum ReadResult {
    case data([UInt8])
    case failed(Int32)
}

/// Reads the whole file; never follows a symbolic link
func readFile(_ path: String) -> ReadResult {
    let descriptor = open(path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
    guard descriptor >= 0 else { return .failed(errno) }
    defer { close(descriptor) }
    var data: [UInt8] = []
    var chunk = [UInt8](repeating: 0, count: 1 << 16)
    while true {
        let count = chunk.withUnsafeMutableBytes { read(descriptor, $0.baseAddress, $0.count) }
        if count < 0 {
            if errno == EINTR { continue }
            return .failed(errno)
        }
        if count == 0 { return .data(data) }
        data.append(contentsOf: chunk[0..<count])
        if data.count > maxFileSize { return .failed(EFBIG) }
    }
}

/// True if path is a real directory (not a link) owned by this user
func isOwnDirectory(_ path: String) -> Bool {
    var info = stat()
    return lstat(path, &info) == 0 && (info.st_mode & S_IFMT) == S_IFDIR && info.st_uid == getuid()
}

/// Writes a new file with mode 600 next to the target, then renames it over the target
func writeFile(directory: String, name: String, text: String) -> Bool {
    guard isOwnDirectory(directory) else { return false }
    let temporary = "\(directory)/.\(name).\(getpid()).tmp"
    let descriptor = open(temporary, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600)
    guard descriptor >= 0 else { return false }
    var rest = Array(text.utf8)[...]
    while !rest.isEmpty {
        let count = rest.withUnsafeBytes { write(descriptor, $0.baseAddress, $0.count) }
        if count < 0 {
            if errno == EINTR { continue }
            close(descriptor)
            unlink(temporary)
            return false
        }
        rest = rest.dropFirst(count)
    }
    guard close(descriptor) == 0, rename(temporary, "\(directory)/\(name)") == 0 else {
        unlink(temporary)
        return false
    }
    return true
}

guard let home = homeDirectory() else { exit(2) }
let udavDirectory = home + "/Library/Application Support/udav"
let safariCookies = home + "/Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies"

func finish(_ status: String) -> Never {
    _ = writeFile(directory: udavDirectory, name: statusName, text: status + "\n")
    exit(status.hasPrefix("ok ") ? 0 : 1)
}

// A result left from an earlier run must never look fresh
if isOwnDirectory(udavDirectory) {
    unlink("\(udavDirectory)/\(outputName)")
}

let data: [UInt8]
switch readFile(safariCookies) {
case .data(let bytes):
    data = bytes
case .failed(let code) where code == EPERM || code == EACCES:
    finish("no-access")
case .failed(let code) where code == ENOENT:
    finish("no-cookies-file")
case .failed(let code):
    finish("read-failed \(code)")
}

guard let cookies = parseSafariCookies(Bytes(data: data)) else { finish("bad-format") }
guard let youTube = signedInYouTubeCookies(cookies, now: Int(time(nil))) else { finish("no-youtube-login") }
guard writeFile(directory: udavDirectory, name: outputName, text: netscapeCookiesFile(youTube)) else {
    finish("write-failed")
}
finish("ok \(youTube.count)")
