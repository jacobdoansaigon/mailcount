import dns from "node:dns";

/**
 * Node mặc định có thể chọn bản ghi AAAA trước — tới Microsoft từ Railway đôi khi IPv6 lỗi / treo.
 * Gọi một lần khi boot server (trước SMTP/IMAP).
 */
export function preferIpv4DnsOrder(): void {
  try {
    if (typeof dns.setDefaultResultOrder === "function") {
      dns.setDefaultResultOrder("ipv4first");
    }
  } catch {
    /* ignore */
  }
}
