// Parser for Safari's Cookies.binarycookies and the Netscape cookies.txt writer.
// Pure functions over bytes: reading and writing files is done in main.swift.

/// Seconds between 1970-01-01 and 2001-01-01: Safari stores dates from 2001
let macEpochOffset = 978_307_200.0

struct Cookie {
    let domain: String
    let name: String
    let path: String
    let value: String
    let secure: Bool
    /// Unix time
    let expires: Int
}

/// Bounds-checked reads: every function returns nil instead of reading past the end
struct Bytes {
    let data: [UInt8]

    func u32BigEndian(_ at: Int) -> Int? {
        guard at >= 0, at + 4 <= data.count else { return nil }
        return Int(data[at]) << 24 | Int(data[at + 1]) << 16 | Int(data[at + 2]) << 8 | Int(data[at + 3])
    }

    func u32LittleEndian(_ at: Int) -> Int? {
        guard at >= 0, at + 4 <= data.count else { return nil }
        return Int(data[at]) | Int(data[at + 1]) << 8 | Int(data[at + 2]) << 16 | Int(data[at + 3]) << 24
    }

    func doubleLittleEndian(_ at: Int) -> Double? {
        guard at >= 0, at + 8 <= data.count else { return nil }
        var bits: UInt64 = 0
        for index in 0..<8 {
            bits |= UInt64(data[at + index]) << (8 * index)
        }
        return Double(bitPattern: bits)
    }

    /// A zero-terminated string inside [at, limit). Only printable ASCII is accepted:
    /// a tab, a line break or anything else would break the tab-separated cookies.txt.
    func asciiString(_ at: Int, limit: Int) -> String? {
        guard at >= 0, at < limit, limit <= data.count else { return nil }
        var end = at
        while end < limit, data[end] != 0 {
            guard data[end] >= 0x20, data[end] <= 0x7E else { return nil }
            end += 1
        }
        guard end < limit else { return nil }
        return String(decoding: data[at..<end], as: UTF8.self)
    }
}

/// The same layout yt-dlp reads. File: "cook", the page count and the page sizes
/// (big-endian), then the pages. Page: 00 00 01 00, the cookie count and the cookie
/// offsets (little-endian). Cookie: size, flags, offsets of four strings, expiry date.
/// Returns nil if the file does not look like this at all; skips single broken cookies.
func parseSafariCookies(_ bytes: Bytes) -> [Cookie]? {
    let data = bytes.data
    guard data.count >= 8, Array(data[0..<4]) == Array("cook".utf8),
          let pageCount = bytes.u32BigEndian(4), pageCount <= data.count / 4
    else { return nil }

    var cookies: [Cookie] = []
    var pageStart = 8 + pageCount * 4
    for page in 0..<pageCount {
        guard let pageSize = bytes.u32BigEndian(8 + page * 4) else { return nil }
        let pageEnd = pageStart + pageSize
        guard pageSize >= 8, pageEnd <= data.count,
              bytes.u32BigEndian(pageStart) == 0x0000_0100,
              let count = bytes.u32LittleEndian(pageStart + 4), 8 + count * 4 <= pageSize
        else { return nil }
        for index in 0..<count {
            guard let offset = bytes.u32LittleEndian(pageStart + 8 + index * 4) else { return nil }
            if let cookie = parseRecord(bytes, at: pageStart + offset, pageEnd: pageEnd) {
                cookies.append(cookie)
            }
        }
        pageStart = pageEnd
    }
    return cookies
}

/// Record: size (0), flags (8, bit 1 = secure), offsets of domain, name, path and value
/// from the record start (16, 20, 24, 28), expiry as seconds since 2001 (40), strings (56+)
private func parseRecord(_ bytes: Bytes, at start: Int, pageEnd: Int) -> Cookie? {
    guard let size = bytes.u32LittleEndian(start), size >= 56, start + size <= pageEnd,
          let flags = bytes.u32LittleEndian(start + 8),
          let domainOffset = bytes.u32LittleEndian(start + 16),
          let nameOffset = bytes.u32LittleEndian(start + 20),
          let pathOffset = bytes.u32LittleEndian(start + 24),
          let valueOffset = bytes.u32LittleEndian(start + 28),
          let expiry = bytes.doubleLittleEndian(start + 40), expiry.isFinite, expiry.magnitude < 1e11
    else { return nil }
    let end = start + size
    guard let domain = bytes.asciiString(start + domainOffset, limit: end),
          let name = bytes.asciiString(start + nameOffset, limit: end),
          let path = bytes.asciiString(start + pathOffset, limit: end),
          let value = bytes.asciiString(start + valueOffset, limit: end),
          !domain.isEmpty, !name.isEmpty
    else { return nil }
    return Cookie(domain: domain, name: name, path: path.isEmpty ? "/" : path, value: value,
                  secure: flags & 1 != 0, expires: Int(expiry + macEpochOffset))
}

/// youtube.com and its subdomains (www, m, music), nothing else
func isYouTubeDomain(_ domain: String) -> Bool {
    let host = (domain.hasPrefix(".") ? String(domain.dropFirst()) : domain).lowercased()
    return host == "youtube.com" || host.hasSuffix(".youtube.com")
}

/// Cookies that exist only in a signed-in session (yt-dlp signs requests with the APISID ones)
let youTubeLoginCookieNames: Set<String> = [
    "SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID", "SID", "__Secure-1PSID", "__Secure-3PSID", "LOGIN_INFO",
]

/// The unexpired youtube.com cookies, or nil if they hold no signed-in session
func signedInYouTubeCookies(_ cookies: [Cookie], now: Int) -> [Cookie]? {
    let youTube = cookies.filter { isYouTubeDomain($0.domain) && $0.expires > now }
    return youTube.contains(where: { youTubeLoginCookieNames.contains($0.name) }) ? youTube : nil
}

/// cookies.txt in the Netscape format that yt-dlp reads with --cookies
func netscapeCookiesFile(_ cookies: [Cookie]) -> String {
    let lines = cookies.map { cookie in
        [
            cookie.domain,
            cookie.domain.hasPrefix(".") ? "TRUE" : "FALSE",
            cookie.path,
            cookie.secure ? "TRUE" : "FALSE",
            String(cookie.expires),
            cookie.name,
            cookie.value,
        ].joined(separator: "\t")
    }
    return (["# Netscape HTTP Cookie File", "# YouTube cookies from Safari, written by udav Safari Cookies"] + lines)
        .joined(separator: "\n") + "\n"
}
