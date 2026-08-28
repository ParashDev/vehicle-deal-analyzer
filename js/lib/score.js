// The deal score, quick-compare edition: 1–10 with a visible, defensible
// breakdown. Graded only on what quick mode actually knows — the bottom-line
// quote vs sticker, the financing on the table, what's thrown in, and any
// above-sticker markup. An 8 is genuinely good; most buyers land 5–6.

;(function (CDA) {
  function clamp01(n) {
    return Math.max(0, Math.min(1, n))
  }

  // offer: a quick offer. best: its cheapest evaluated way at the current
  // horizon (from offerComputed) — supplies the APR actually in play.
  function scoreQuickDeal(offer, best, opts) {
    opts = opts || {}
    const benchmark = opts.aprBenchmark != null ? opts.aprBenchmark : 7

    // 1) Bottom line vs sticker (45%). The quote includes tax & fees, so
    //    ~100% of MSRP is TYPICAL, not bad; under ~95% is strong. Full marks
    //    at 95%, zero at 110%.
    const ratio = offer.msrp > 0 ? (offer.quickOtd || 0) / offer.msrp : 1.1
    const priceScore = clamp01((1.10 - ratio) / 0.15)

    // 2) Financing quality (25%) — the best way's APR vs the benchmark.
    const apr = best ? best.apr : 7
    let financeScore
    if (apr <= 0) financeScore = 1
    else if (apr <= benchmark) financeScore = 0.6 + 0.4 * (1 - apr / benchmark)
    else financeScore = clamp01(0.6 - ((apr - benchmark) / 3) * 0.6)

    // 3) Included value (20%) — $1,500 of thrown-in equipment = full marks.
    const included = (offer.accessories || [])
      .filter((a) => a.charged === 0 && a.retailValue > 0)
      .reduce((s, a) => s + a.retailValue, 0)
    const includedScore = clamp01(included / 1500)

    // 4) No markup above sticker (10%) — a quote above MSRP (after adding
    //    the rebate back) burns this down; $2,000 of markup zeroes it.
    const markup = offer.marketAdjustment || 0
    const markupScore = clamp01(1 - markup / 2000)

    const components = [
      { key: "price", label: "Bottom line vs sticker", weight: 0.45, score: priceScore,
        detail: "Quoted OTD is " + (ratio * 100).toFixed(1) + "% of MSRP. Tax & fees live inside the quote, so ~100% is typical — under 95% is a strong deal." },
      { key: "financing", label: "Financing quality", weight: 0.25, score: financeScore,
        detail: apr + "% APR on the best way to pay vs a " + benchmark + "% benchmark." },
      { key: "included", label: "Included value", weight: 0.20, score: includedScore,
        detail: included > 0 ? "$" + included.toFixed(0) + " of add-ons thrown in at no charge." : "Nothing thrown in for free." },
      { key: "markup", label: "No markup above sticker", weight: 0.10, score: markupScore,
        detail: markup > 0 ? "This quote sits $" + markup.toFixed(0) + " ABOVE sticker once the rebate is added back." : "Quote sits at or below sticker — no hidden markup." },
    ]

    const raw = components.reduce((sum, c) => sum + c.weight * c.score, 0)
    const score = Math.round(raw * 100) / 10

    const improvements = []
    if (ratio > 0.97 && offer.msrp > 0) improvements.push("Push the bottom line toward 95% of sticker (about $" + Math.round(offer.msrp * 0.95).toLocaleString() + " out the door).")
    if (apr > 0 && financeScore < 0.8) improvements.push("Beat " + apr + "% APR with a credit-union preapproval before you sign.")
    if (included < 300) improvements.push("Ask for extras thrown in — all-weather mats, cargo tray, first services.")
    if (markup > 0) improvements.push("Get the $" + markup.toFixed(0) + " above-sticker markup removed, or walk.")

    const band = score >= 8 ? "a genuinely good deal" : score >= 6.5 ? "a solid deal with room to push" : score >= 5 ? "about average — most buyers land here" : score >= 3.5 ? "below average — several fixable problems" : "a bad deal as written"

    return { score, band, components, improvements }
  }

  Object.assign(CDA, { scoreQuickDeal })
})(window.CDA = window.CDA || {})
