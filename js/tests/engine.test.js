// Engine tests against the hand-verified Colorado fixture.
;(function (CDA) {
  const { test, assert } = CDA.TEST
  const { computeTax, verifyDealerTax, computeWaterfall, discountMetrics,
    amortize, scheduledPayment, ruleOf78Interest, precomputedPenalty,
    evaluateScenario, compareAll, breakevenMonth, verdict, validateScenarioRebates,
    STATE_TAX_RULES } = CDA
  const { coloradoOffer, mirrorOffer, PAYOFF_HORIZON, MIRROR_HORIZON } = CDA.FIXTURES

  // ── tax ─────────────────────────────────────────────────────
  test("OH taxes the PRE-rebate amount: basis 33,400 → tax 2,505.00", () => {
    const tax = computeTax({ taxableSubtotal: 33400, rebateTotal: 2000, tradeInValue: 0, tradeInPayoff: 0, stateCode: "OH", rateOverride: 0.075 })
    assert.equal(tax.taxableBase, 33400)
    assert.equal(tax.salesTax, 2505)
    assert.equal(tax.rebateReducedBase, false)
  })

  test("AZ does NOT tax rebates — base drops by the rebate", () => {
    const tax = computeTax({ taxableSubtotal: 33400, rebateTotal: 2000, tradeInValue: 0, tradeInPayoff: 0, stateCode: "AZ", rateOverride: 0.056 })
    assert.equal(tax.taxableBase, 31400)
    assert.equal(tax.rebateReducedBase, true)
  })

  test("CA gives NO trade-in credit; TX does", () => {
    const ca = computeTax({ taxableSubtotal: 30000, rebateTotal: 0, tradeInValue: 10000, tradeInPayoff: 0, stateCode: "CA", rateOverride: 0.0725 })
    assert.equal(ca.tradeInCreditApplied, 0)
    assert.equal(ca.taxableBase, 30000)
    const tx = computeTax({ taxableSubtotal: 30000, rebateTotal: 0, tradeInValue: 10000, tradeInPayoff: 0, stateCode: "TX", rateOverride: 0.0625 })
    assert.equal(tx.tradeInCreditApplied, 10000)
    assert.equal(tx.taxableBase, 20000)
  })

  test("MI caps the trade-in credit", () => {
    const mi = computeTax({ taxableSubtotal: 40000, rebateTotal: 0, tradeInValue: 15000, tradeInPayoff: 0, stateCode: "MI" })
    assert.equal(mi.tradeInCreditApplied, 11000)
  })

  test("state table covers all 50 states + DC", () => {
    assert.equal(STATE_TAX_RULES.length, 51)
  })

  test("dealer tax verification: lower-than-computed runs in the buyer's favor", () => {
    const check = verifyDealerTax(2505, 2355)
    assert.equal(check.status, "dealer-lower")
    assert.match(check.message, /favor/i)
    assert.equal(verifyDealerTax(2505, 2510).status, "match")
    assert.equal(verifyDealerTax(2505, 2700).status, "dealer-higher")
  })

  // ── waterfall ───────────────────────────────────────────────
  function coloradoWaterfall(rebateTotal) {
    return computeWaterfall({
      msrp: coloradoOffer.msrp, marketAdjustment: 0, factoryDiscount: 750, dealerDiscount: 3340,
      accessories: [], fees: coloradoOffer.fees, rebateTotal,
      tradeInValue: 0, tradeInPayoff: 0, stateCode: "OH", rateOverride: 0.075,
    })
  }

  test("Colorado waterfall reproduces the dealer worksheet line by line", () => {
    const w = coloradoWaterfall(2000)
    assert.equal(w.stickerBeforeDiscounts, 37240)
    assert.equal(w.sellingPrice, 33150)
    assert.equal(w.taxableSubtotal, 33400)
    assert.equal(w.cashPrice, 31400)
    assert.equal(w.taxUsed, 2505)
    assert.equal(w.nonTaxableFees, 100)
    assert.equal(w.outTheDoor, 34005)
  })

  test("discount metrics: dealer money = 9.15% off MSRP", () => {
    const m = discountMetrics(coloradoWaterfall(2000), [])
    assert.equal(m.dealerDiscount, 3340)
    assert.ok(Math.abs(m.dealerDiscountPct - 0.0915) < 0.0005)
  })

  // ── amortize ────────────────────────────────────────────────
  // The build spec's table says 430.87, but the closed-form annuity value is
  // 430.85520... → 430.86 under both round-half-up and round-up conventions.
  // The spec figure is a one-cent hand-verification slip; every "≈" assertion
  // still passes. We assert the mathematically correct cent.
  test("scheduled payment: 26,005 @ 5.99% / 72mo = 430.86", () => {
    assert.equal(scheduledPayment(26005, 5.99, 72), 430.86)
  })

  test("scheduled payment: 28,005 @ 0% / 60mo = 466.75", () => {
    assert.equal(scheduledPayment(28005, 0, 60), 466.75)
  })

  test("early payoff at month 30: interest ≈ 3,210 and balance ≈ 16,289", () => {
    const loan = amortize({ principal: 26005, annualRate: 5.99, termMonths: 72, payoffAtMonth: 30 })
    assert.ok(Math.abs(loan.totalInterest - 3210) < 25, "interest " + loan.totalInterest)
    assert.ok(Math.abs(loan.payoffBalance - 16289) < 25, "balance " + loan.payoffBalance)
  })

  test("0% loan at month 30: zero interest, balance 14,002.50", () => {
    const loan = amortize({ principal: 28005, annualRate: 0, termMonths: 60, payoffAtMonth: 30 })
    assert.equal(loan.totalInterest, 0)
    assert.equal(loan.payoffBalance, 14002.5)
    assert.equal(loan.totalPaid, 28005)
  })

  test("run to term: interest sums and balance clears", () => {
    const loan = amortize({ principal: 26005, annualRate: 5.99, termMonths: 72 })
    assert.equal(loan.monthsToPayoff, 72)
    assert.equal(loan.schedule[71].balance, 0)
    assert.ok(Math.abs(loan.totalPaid - (26005 + loan.totalInterest)) < 1)
  })

  test("Rule of 78s keeps more interest than simple on early payoff", () => {
    const penalty = precomputedPenalty({ principal: 26005, annualRate: 5.99, termMonths: 72, payoffAtMonth: 30 })
    assert.ok(penalty > 0, "penalty " + penalty)
    const r78 = ruleOf78Interest({ principal: 26005, annualRate: 5.99, termMonths: 72, payoffAtMonth: 72 })
    const simple = amortize({ principal: 26005, annualRate: 5.99, termMonths: 72 })
    assert.ok(Math.abs(r78.interestKept - simple.totalInterest) < 5, "full term keeps ~all scheduled interest either way")
  })

  // ── compare ─────────────────────────────────────────────────
  test("Scenario A (rebate): OTD 34,005 / financed 26,005 / TCO ≈ 37,215", () => {
    const res = evaluateScenario(coloradoOffer, coloradoOffer.scenarios[0], PAYOFF_HORIZON)
    assert.equal(res.waterfall.outTheDoor, 34005)
    assert.equal(res.amountFinanced, 26005)
    assert.equal(res.scheduledPayment, 430.86)
    assert.ok(Math.abs(res.totalCost - 37215) < 30, "TCO " + res.totalCost)
  })

  test("Scenario B (0% APR): OTD 36,005 / financed 28,005 / TCO exactly 36,005", () => {
    const res = evaluateScenario(coloradoOffer, coloradoOffer.scenarios[1], PAYOFF_HORIZON)
    assert.equal(res.waterfall.outTheDoor, 36005)
    assert.equal(res.amountFinanced, 28005)
    assert.equal(res.scheduledPayment, 466.75)
    assert.equal(res.interestPaid, 0)
    assert.equal(res.balanceAtHorizon, 14002.5)
    assert.equal(res.totalCost, 36005)
  })

  test("Verdict: 0% APR wins by ≈ $1,210 at 30 months", () => {
    const v = verdict(coloradoOffer, coloradoOffer.scenarios[0], coloradoOffer.scenarios[1], PAYOFF_HORIZON)
    assert.equal(v.winner.scenarioId, "scenario-zero-apr")
    assert.ok(Math.abs(v.gap - 1210) < 40, "gap " + v.gap)
    assert.equal(v.isCloseCall, false)
  })

  test("Breakeven lands at month 17 ± 1", () => {
    const m = breakevenMonth(coloradoOffer, coloradoOffer.scenarios[0], coloradoOffer.scenarios[1])
    assert.ok(m !== null && Math.abs(m - 17) <= 1, "breakeven " + m)
  })

  test("Mirror fixture: the $4,500 rebate WINS at a 24-month horizon", () => {
    const v = verdict(mirrorOffer, mirrorOffer.scenarios[0], mirrorOffer.scenarios[1], MIRROR_HORIZON)
    assert.equal(v.winner.scenarioId, "scenario-rebate")
  })

  test("compareAll ranks the full cross-product by total cost", () => {
    const results = compareAll([coloradoOffer], PAYOFF_HORIZON)
    assert.equal(results.length, 2)
    assert.equal(results[0].scenarioId, "scenario-zero-apr")
    assert.ok(results[0].totalCost <= results[1].totalCost)
  })

  test("captive-only rebates die outside captive financing; exclusives can't stack", () => {
    const rebates = [
      { id: "r1", label: "Captive Cash", amount: 1000, requiresCaptiveFinancing: true, mutuallyExclusiveWith: [], conditional: false },
      { id: "r2", label: "Bonus A", amount: 500, requiresCaptiveFinancing: false, mutuallyExclusiveWith: ["r3"], conditional: false },
      { id: "r3", label: "Bonus B", amount: 750, requiresCaptiveFinancing: false, mutuallyExclusiveWith: ["r2"], conditional: false },
    ]
    const out = validateScenarioRebates(rebates, {
      id: "s", label: "outside bank", apr: 6.5, termMonths: 60,
      rebatesApplied: ["r1", "r2", "r3"], bonusCash: 0, usesCaptiveFinancing: false,
    })
    assert.equal(out.valid.length, 1)
    assert.equal(out.invalid.length, 2)
  })
})(window.CDA)
