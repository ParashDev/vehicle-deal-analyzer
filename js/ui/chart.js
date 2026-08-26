// The crossover chart — the signature element. Hand-rolled SVG: one line per
// financing scenario, total cost on y, payoff month on x, breakeven circled,
// dashed vertical at the user's horizon. Lower is better.

;(function (CDA) {
  const { fmt0, esc } = CDA
  const LINE_COLORS = ["#16191d", "#1f4fd8", "#9a5b00", "#0a7d43"]

  function niceStep(rough) {
    const mag = Math.pow(10, Math.floor(Math.log10(rough)))
    const norm = rough / mag
    const step = norm >= 5 ? 5 : norm >= 2.5 ? 2.5 : norm >= 2 ? 2 : 1
    return step * mag
  }

  function crossoverChart(curves, horizonMonth, breakeven) {
    if (!curves.length || !curves[0].points.length) return ""

    const W = 760, H = 380
    const M = { top: 24, right: 18, bottom: 40, left: 64 }
    const iw = W - M.left - M.right
    const ih = H - M.top - M.bottom

    const allPoints = curves.flatMap((c) => c.points)
    const maxMonth = Math.max.apply(null, allPoints.map((p) => p.month))
    let minCost = Math.min.apply(null, allPoints.map((p) => p.totalCost))
    let maxCost = Math.max.apply(null, allPoints.map((p) => p.totalCost))
    const pad = Math.max((maxCost - minCost) * 0.08, 250)
    minCost -= pad; maxCost += pad

    const x = (m) => M.left + ((m - 1) / Math.max(1, maxMonth - 1)) * iw
    const y = (c) => M.top + (1 - (c - minCost) / (maxCost - minCost)) * ih

    const yTicks = []
    const step = niceStep((maxCost - minCost) / 4)
    for (let v = Math.ceil(minCost / step) * step; v <= maxCost; v += step) yTicks.push(v)
    const xStep = maxMonth > 48 ? 12 : 6
    const xTicks = []
    for (let m = xStep; m <= maxMonth; m += xStep) xTicks.push(m)

    let svg = '<svg class="chart-svg block h-auto w-full" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Total cost by payoff month for each financing scenario">'

    for (const v of yTicks) {
      svg += '<line class="axis" x1="' + M.left + '" y1="' + y(v) + '" x2="' + (W - M.right) + '" y2="' + y(v) + '" stroke-width="1"/>'
      svg += '<text class="tick-label" x="' + (M.left - 8) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + fmt0(v) + "</text>"
    }
    for (const m of xTicks) {
      svg += '<line class="axis" x1="' + x(m) + '" y1="' + M.top + '" x2="' + x(m) + '" y2="' + (H - M.bottom) + '" stroke-width="1"/>'
      svg += '<text class="tick-label" x="' + x(m) + '" y="' + (H - M.bottom + 16) + '" text-anchor="middle">' + m + "</text>"
    }
    svg += '<text class="tick-label" x="' + (M.left + iw / 2) + '" y="' + (H - 4) + '" text-anchor="middle">PAYOFF MONTH</text>'

    const hx = x(Math.min(horizonMonth, maxMonth))
    svg += '<line x1="' + hx + '" y1="' + M.top + '" x2="' + hx + '" y2="' + (H - M.bottom) + '" stroke="#16191d" stroke-width="1.5" stroke-dasharray="5 4"/>'
    svg += '<text x="' + hx + '" y="' + (M.top - 8) + '" text-anchor="middle" font-size="10" fill="#16191d" font-weight="600">YOU · ' + horizonMonth + " MO</text>"

    curves.forEach((curve, i) => {
      const color = LINE_COLORS[i % LINE_COLORS.length]
      const d = curve.points
        .map((p, j) => (j === 0 ? "M" : "L") + x(p.month).toFixed(1) + "," + y(p.totalCost).toFixed(1))
        .join("")
      svg += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round"/>'
      const last = curve.points[curve.points.length - 1]
      svg += '<circle cx="' + x(last.month) + '" cy="' + y(last.totalCost) + '" r="3" fill="' + color + '"/>'
    })

    if (breakeven != null && curves.length >= 2) {
      const a = curves[0].points.find((p) => p.month === breakeven)
      if (a) {
        const cx = x(breakeven), cy = y(a.totalCost)
        svg += '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="none" stroke="#c22f21" stroke-width="2"/>'
        svg += '<text x="' + cx + '" y="' + (cy - 12) + '" text-anchor="middle" font-size="10" fill="#c22f21" font-weight="600">BREAKEVEN · MO ' + breakeven + "</text>"
      }
    }

    svg += "</svg>"

    let legend = '<div class="mt-3 flex flex-wrap gap-x-6 gap-y-1">'
    curves.forEach((curve, i) => {
      const color = LINE_COLORS[i % LINE_COLORS.length]
      legend += '<span class="inline-flex items-center gap-2 font-mono text-[0.6875rem] tracking-wide">' +
        '<span class="inline-block h-[3px] w-6" style="background:' + color + '"></span>' + esc(curve.label) + "</span>"
    })
    legend += "</div>"

    return svg + legend
  }

  Object.assign(CDA, { crossoverChart })
})(window.CDA = window.CDA || {})
