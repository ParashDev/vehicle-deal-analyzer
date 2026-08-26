// Taxable-amount computation. The thing most payment calculators get wrong:
// in most states the MANUFACTURER rebate does not reduce the taxable price,
// while a DEALER discount always does. Trade-in credit and its caps are the
// other big state split.

;(function (CDA) {
  const { getStateRule } = CDA

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100
  }

  function computeTax(input) {
    const rule = getStateRule(input.stateCode)
    const rateFromTable = rule ? rule.baseRate : 0
    const rateUsed = input.rateOverride != null ? input.rateOverride : rateFromTable

    let base = input.taxableSubtotal

    const rebateReducedBase = !!rule && !rule.rebateIsTaxable
    if (rebateReducedBase) base -= input.rebateTotal

    let tradeInCreditApplied = 0
    if (rule && rule.tradeInReducesTaxableAmount && input.tradeInValue > 0) {
      tradeInCreditApplied = input.tradeInValue
      if (rule.tradeInCreditCap != null) {
        tradeInCreditApplied = Math.min(tradeInCreditApplied, rule.tradeInCreditCap)
      }
      base -= tradeInCreditApplied
    }

    base = Math.max(0, base)

    const salesTax = round2(base * rateUsed)
    const extraTaxTotal = round2(
      (input.extraTaxes || []).reduce((sum, t) => sum + base * t.rate, 0)
    )

    return {
      rateUsed,
      rateFromTable,
      taxableBase: round2(base),
      rebateReducedBase,
      tradeInCreditApplied,
      salesTax,
      extraTaxTotal,
      totalTax: round2(salesTax + extraTaxTotal),
      specialCase: !!rule && rule.specialCase,
      notes: rule ? rule.notes : "Unknown state — enter your combined rate manually.",
    }
  }

  // A dealer taxing post-rebate in a pre-rebate state is IN THE BUYER'S FAVOR
  // and must not be "corrected" — we say so instead.
  function verifyDealerTax(computedTax, dealerTax, threshold = 50) {
    const delta = round2(dealerTax - computedTax)
    if (Math.abs(delta) <= threshold) {
      return { status: "match", delta, message: "The dealer's tax matches our estimate within $" + threshold + "." }
    }
    if (delta > 0) {
      return {
        status: "dealer-higher",
        delta,
        message: "The dealer's tax is $" + Math.abs(delta).toFixed(2) + " HIGHER than our estimate. Ask them to walk you through the tax calculation line by line — this can hide a taxed add-on or an inflated rate.",
      }
    }
    return {
      status: "dealer-lower",
      delta,
      message: "The dealer's tax is $" + Math.abs(delta).toFixed(2) + " LOWER than our estimate — possibly taxing after the rebate, or a lower local rate. That runs in your favor. Pin the dealer's number; don't correct it away.",
    }
  }

  Object.assign(CDA, { computeTax, verifyDealerTax, round2 })
})(window.CDA = window.CDA || {})
