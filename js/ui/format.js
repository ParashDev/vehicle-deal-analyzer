// Messy-paste-tolerant parsing ("$34,005.00", "5.99%", "1,234") and tabular
// currency formatting.

;(function (CDA) {
  function parseMoney(raw) {
    if (typeof raw === "number") return isFinite(raw) ? raw : 0
    const cleaned = String(raw).replace(/[^0-9.\-]/g, "")
    const n = parseFloat(cleaned)
    return isFinite(n) ? n : 0
  }

  // "7.5", "7.5%", or "0.075" all mean 7.5%. Returns a RATE (0.075).
  function parsePercent(raw) {
    if (typeof raw === "number") return raw > 1 ? raw / 100 : raw
    const cleaned = String(raw).replace(/[^0-9.\-]/g, "")
    const n = parseFloat(cleaned)
    if (!isFinite(n)) return 0
    return n > 1 ? n / 100 : n
  }

  // "5.99%" → 5.99 (annual percent, engine convention).
  function parseApr(raw) {
    const cleaned = String(raw).replace(/[^0-9.\-]/g, "")
    const n = parseFloat(cleaned)
    return isFinite(n) ? n : 0
  }

  function parseInt10(raw) {
    const n = parseInt(String(raw).replace(/[^0-9\-]/g, ""), 10)
    return isFinite(n) ? n : 0
  }

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
  const money0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

  function fmt(n) { return money.format(n) }
  function fmt0(n) { return money0.format(n) }
  function fmtPct(rate) { return (rate * 100).toFixed((rate * 100) % 1 === 0 ? 0 : 2) + "%" }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c))
  }

  let idCounter = 0
  function uid(prefix) {
    idCounter++
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" + idCounter
  }

  Object.assign(CDA, { parseMoney, parsePercent, parseApr, parseInt10, fmt, fmt0, fmtPct, esc, uid })
})(window.CDA = window.CDA || {})
