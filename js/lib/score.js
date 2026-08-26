// The deal score: 1–10 with a visible, defensible breakdown. Weights:
// dealer discount 35%, junk 25%, doc fee 10%, financing 15%, included 15%.
// An 8 is genuinely good; most buyers land 5–6.

;(function (CDA) {
  const { getStateRule, junkDollars, discountMetrics, round2 } = CDA

  const SEGMENT_BANDS = {
    mainstream: { label: "Mainstream car / truck / SUV", fullMarksAt: 0.10 },
    popular: { label: "In-demand model, tight supply", fullMarksAt: 0.05 },
    allocation: { label: "Allocation-constrained / hot launch", fullMarksAt: 0.02 },
  }

  function clamp01(n) {
    return Math.max(0, Math.min(1, n))
  }

  function scoreDeal(offer, flags, waterfall, options) {
    options = options || {}
    const segment = SEGMENT_BANDS[options.segment || "mainstream"]
    const metrics = discountMetrics(waterfall, offer.accessories)

    // 1) Dealer discount (35%) — netted against market adjustment: a
    //    "discount" the dealer claws back with ADM isn't a concession.
    const effectiveDealerDiscount = Math.max(0, waterfall.dealerDiscount - waterfall.marketAdjustment)
    const effectiveDiscountPct = waterfall.msrp > 0 ? effectiveDealerDiscount / waterfall.msrp : 0
    const discountScore = clamp01(effectiveDiscountPct / segment.fullMarksAt)

    // 2) Junk (25%) — $2,000 of junk zeroes the component.
    const junk = junkDollars(flags, offer.taxJurisdiction.stateCode)
    const junkScore = clamp01(1 - junk / 2000)

    // 3) Doc fee vs state norm (10%)
    const docFee = offer.fees.find((f) => f.category === "doc")
    let docScore = 1
    const rule = getStateRule(offer.taxJurisdiction.stateCode)
    if (docFee && rule) {
      if (rule.docFeeCap != null && docFee.amount > rule.docFeeCap) docScore = 0
      else if (docFee.amount <= rule.docFeeTypical) docScore = 1
      else docScore = clamp01(1 - (docFee.amount - rule.docFeeTypical) / rule.docFeeTypical)
    }

    // 4) Financing quality (15%) — APR vs the user's benchmark.
    const benchmark = options.aprBenchmark != null ? options.aprBenchmark : 7
    const apr = options.scenarioApr != null ? options.scenarioApr : offer.financing.apr
    let financeScore
    if (apr <= 0) financeScore = 1
    else if (apr <= benchmark) financeScore = 0.6 + 0.4 * (1 - apr / benchmark)
    else financeScore = clamp01(0.6 - ((apr - benchmark) / 3) * 0.6)

    // 5) Included value (15%) — $1,500 of free accessories = full marks.
    const includedScore = clamp01(metrics.includedValue / 1500)

    const components = [
      { key: "discount", label: "Dealer discount", weight: 0.35, score: discountScore,
        detail: waterfall.marketAdjustment > 0
          ? "$" + metrics.dealerDiscount.toFixed(0) + " discount minus $" + waterfall.marketAdjustment.toFixed(0) + " market adjustment = $" + effectiveDealerDiscount.toFixed(0) + " real concession (" + (effectiveDiscountPct * 100).toFixed(2) + "% of MSRP). Full marks at " + (segment.fullMarksAt * 100).toFixed(0) + "% for: " + segment.label + "."
          : (effectiveDiscountPct * 100).toFixed(2) + "% of MSRP is the dealer's own money ($" + metrics.dealerDiscount.toFixed(0) + "). Full marks at " + (segment.fullMarksAt * 100).toFixed(0) + "% for: " + segment.label + "." },
      { key: "junk", label: "Junk fees & add-ons", weight: 0.25, score: junkScore,
        detail: junk > 0 ? "$" + junk.toFixed(0) + " of flagged charges drags this down." : "No junk charges found — clean worksheet." },
      { key: "doc", label: "Doc fee", weight: 0.10, score: docScore,
        detail: docFee ? "$" + docFee.amount.toFixed(0) + " vs " + (rule ? rule.name + " typical ~$" + rule.docFeeTypical : "state norm") + (rule && rule.docFeeCap != null ? ", cap $" + rule.docFeeCap : "") + "." : "No doc fee entered." },
      { key: "financing", label: "Financing quality", weight: 0.15, score: financeScore,
        detail: apr + "% APR vs your " + benchmark + "% benchmark." },
      { key: "included", label: "Included value", weight: 0.15, score: includedScore,
        detail: metrics.includedValue > 0 ? "$" + metrics.includedValue.toFixed(0) + " of accessories included at no charge." : "Nothing thrown in for free." },
    ]

    const raw = components.reduce((sum, c) => sum + c.weight * c.score, 0)
    const score = Math.round(raw * 100) / 10

    const improvements = []
    if (discountScore < 0.9) improvements.push("Push the dealer discount toward " + (segment.fullMarksAt * 100).toFixed(0) + "% of MSRP (about $" + round2(segment.fullMarksAt * waterfall.msrp).toFixed(0) + ").")
    if (junk > 0) improvements.push("Remove the $" + junk.toFixed(0) + " in flagged add-ons and markup.")
    if (docScore < 1 && docFee && rule) improvements.push(rule.docFeeCap != null && docFee.amount > rule.docFeeCap ? "Get the doc fee back under the $" + rule.docFeeCap + " legal cap." : "Offset the above-typical doc fee with an equal price reduction.")
    if (financeScore < 0.8 && apr > 0) improvements.push("Beat " + apr + "% APR with a credit-union preapproval before you sign.")
    if (includedScore < 0.5) improvements.push("Ask for accessories (all-weather mats, cargo tray) thrown in at no charge.")

    const band = score >= 8 ? "a genuinely good deal" : score >= 6.5 ? "a solid deal with room to push" : score >= 5 ? "about average — most buyers land here" : score >= 3.5 ? "below average — several fixable problems" : "a bad deal as written"

    return {
      score,
      band,
      components,
      rationale: "This scores " + score.toFixed(1) + "/10 — " + band + ". " +
        components.map((c) => c.label + ": " + (c.score * 10).toFixed(1) + "/10 (" + Math.round(c.weight * 100) + "% weight).").join(" "),
      improvements,
    }
  }

  Object.assign(CDA, { SEGMENT_BANDS, scoreDeal })
})(window.CDA = window.CDA || {})
