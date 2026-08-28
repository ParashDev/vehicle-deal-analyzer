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

    // 1) Vs your best offer (35%) — RELATIVE: total cost at your payoff date,
    //    with included extras counted, against the best quote you entered.
    //    $2,500 behind = zero. This is what makes scores differ between your
    //    offers instead of everyone acing an absolute band.
    // gapRatio = (my total cost / my sticker) − (best offer's same ratio):
    // identical to a dollar gap when the vehicles share an MSRP, and a fair
    // deal-quality comparison when they don't. ~7 points of sticker = zero.
    let relScore = 1
    let relDetail
    if (opts.relative) {
      const gapRatio = Math.max(0, opts.relative.gapRatio)
      relScore = clamp01(1 - gapRatio / 0.07)
      relDetail = opts.relative.detail
    } else {
      relDetail = "Only one offer entered — add another dealer's quote to grade them against each other."
    }

    // 2) Bottom line vs sticker (20%) — ABSOLUTE, judged only against this
    //    vehicle's own sticker, so no vehicle's price ever moves another's
    //    score. Band (smooth between anchors): ≤90% = 10, 95% = 9,
    //    100% = 6 (typical — tax & fees live inside the quote), 110%+ = 0.
    const ratio = offer.msrp > 0 ? (offer.quickOtd || 0) / offer.msrp : 1.1
    let priceScore
    if (ratio <= 0.90) priceScore = 1
    else if (ratio <= 0.95) priceScore = 0.9 + ((0.95 - ratio) / 0.05) * 0.1
    else if (ratio <= 1.00) priceScore = 0.6 + ((1.00 - ratio) / 0.05) * 0.3
    else priceScore = clamp01(0.6 * (1.10 - ratio) / 0.10)
    const priceDetail = "Quoted OTD is " + (ratio * 100).toFixed(1) + "% of this vehicle's own sticker. Band: 90% = 10, 95% = 9, 100% = 6 (typical — tax & fees live in the quote), 110%+ = 0. No other offer moves this number."

    // 2) Financing quality (25%) — the best way's APR vs the benchmark
    //    (median of the standard-rate ways across YOUR offers when there are
    //    peers; a 7% market default otherwise).
    const apr = best ? best.apr : 7
    let financeScore
    if (apr <= 0) financeScore = 1
    else if (apr <= benchmark) financeScore = 0.6 + 0.4 * (1 - apr / benchmark)
    else financeScore = clamp01(0.6 - ((apr - benchmark) / 3) * 0.6)

    // 3) Included value (10%) — graded against your offers: at the median of
    //    what your dealers include = 0.6, the most generous = 1.0, nothing
    //    while others include things = 0. Absolute $1,500 band only when
    //    there's a single offer.
    const included = (offer.accessories || [])
      .filter((a) => a.charged === 0 && a.retailValue > 0)
      .reduce((s, a) => s + a.retailValue, 0)
    let includedScore, includedDetail
    const ib = opts.includedBench
    if (ib && ib.max > 0) {
      includedScore = included >= ib.median
        ? 0.6 + 0.4 * clamp01((included - ib.median) / Math.max(ib.max - ib.median, 1))
        : 0.6 * clamp01(included / Math.max(ib.median, 1))
      includedDetail = "$" + included.toFixed(0) + " included vs the $" + Math.round(ib.median).toLocaleString() + " median across your offers (most generous: $" + Math.round(ib.max).toLocaleString() + ")."
    } else if (ib) {
      includedScore = 1
      includedDetail = "No offer includes extras — even field."
    } else {
      includedScore = clamp01(included / 1500)
      includedDetail = included > 0 ? "$" + included.toFixed(0) + " of add-ons thrown in at no charge." : "Nothing thrown in for free."
    }

    // 4) Not priced above sticker (10%) — derived, no input needed: the
    //    pre-rebate bottom line (quote + rebate) vs MSRP. Tax & fees live in
    //    the quote, so up to ~110% of sticker is NORMAL — only beyond that
    //    does it read as dealer markup. Full marks ≤110%, zero at 120%.
    const rebateTotal = (offer.rebates || []).reduce((s, r) => s + (r.amount || 0), 0)
    const preRatio = offer.msrp > 0 ? ((offer.quickOtd || 0) + rebateTotal) / offer.msrp : 1
    const markupScore = preRatio <= 1.10 ? 1 : clamp01(1 - (preRatio - 1.10) / 0.10)

    const components = [
      { key: "relative", label: "Vs your best offer", weight: 0.35, score: relScore, detail: relDetail },
      { key: "price", label: "Bottom line vs sticker", weight: 0.20, score: priceScore,
        detail: priceDetail },
      { key: "financing", label: "Financing quality", weight: 0.25, score: financeScore,
        detail: apr + "% APR on the best way to pay vs " + (opts.benchmarkLabel || ("a " + benchmark + "% benchmark")) + "." },
      { key: "included", label: "Included value", weight: 0.10, score: includedScore,
        detail: includedDetail },
      { key: "markup", label: "Not priced above sticker", weight: 0.10, score: markupScore,
        detail: "Pre-rebate bottom line is " + (preRatio * 100).toFixed(1) + "% of sticker. Up to ~110% is normal — tax & fees live in the quote. Beyond that is dealer-markup territory." },
    ]

    const raw = components.reduce((sum, c) => sum + c.weight * c.score, 0)
    const score = Math.round(raw * 100) / 10

    const improvements = []
    if (opts.relative && opts.relative.gapRatio > 0.006 && opts.relative.improve) improvements.push(opts.relative.improve)
    if (ratio > 0.97 && offer.msrp > 0) improvements.push("Push the bottom line toward 95% of sticker (about $" + Math.round(offer.msrp * 0.95).toLocaleString() + " out the door).")
    if (apr > 0 && financeScore < 0.8) improvements.push("Beat " + apr + "% APR with a credit-union preapproval before you sign.")
    if (included < 300) improvements.push("Ask for extras thrown in — all-weather mats, cargo tray, first services.")
    if (preRatio > 1.10 && offer.msrp > 0) improvements.push("The pre-rebate price is " + (preRatio * 100).toFixed(0) + "% of sticker — more than tax and fees explain. Ask what the markup is for, or walk.")

    const band = score >= 8 ? "a genuinely good deal" : score >= 6.5 ? "a solid deal with room to push" : score >= 5 ? "about average — most buyers land here" : score >= 3.5 ? "below average — several fixable problems" : "a bad deal as written"

    return { score, band, components, improvements }
  }

  Object.assign(CDA, { scoreQuickDeal })
})(window.CDA = window.CDA || {})
