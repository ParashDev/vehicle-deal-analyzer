// The headline feature: every offer × every financing scenario at the user's
// ACTUAL payoff horizon, ranked by total cost of ownership, plus the
// rebate-vs-low-APR breakeven solver.

;(function (CDA) {
  const { computeWaterfall, amortize, round2 } = CDA

  // - requiresCaptiveFinancing rebates die when financing elsewhere
  // - mutuallyExclusiveWith pairs can't co-exist
  function validateScenarioRebates(rebates, scenario) {
    const applied = rebates.filter((r) => scenario.rebatesApplied.includes(r.id))
    const invalid = []
    const valid = []

    for (const rebate of applied) {
      if (rebate.requiresCaptiveFinancing && scenario.usesCaptiveFinancing === false) {
        invalid.push({ rebate, reason: '"' + rebate.label + '" requires financing through the captive lender — it doesn\'t survive outside financing.' })
        continue
      }
      const conflict = valid.find(
        (v) => rebate.mutuallyExclusiveWith.includes(v.id) || v.mutuallyExclusiveWith.includes(rebate.id)
      )
      if (conflict) {
        invalid.push({ rebate, reason: '"' + rebate.label + '" can\'t stack with "' + conflict.label + '" — they\'re mutually exclusive.' })
        continue
      }
      valid.push(rebate)
    }
    return { valid, invalid }
  }

  function evaluateScenario(offer, scenario, payoffHorizonMonths) {
    const { valid, invalid } = validateScenarioRebates(offer.rebates, scenario)
    const rebateTotal = round2(valid.reduce((s, r) => s + r.amount, 0))

    const waterfall = computeWaterfall({
      msrp: offer.msrp,
      marketAdjustment: offer.marketAdjustment,
      factoryDiscount: offer.factoryDiscount,
      dealerDiscount: offer.dealerDiscount,
      accessories: offer.accessories,
      fees: offer.fees,
      rebateTotal,
      tradeInValue: offer.financing.tradeInValue,
      tradeInPayoff: offer.financing.tradeInPayoff,
      stateCode: offer.taxJurisdiction.stateCode,
      rateOverride: offer.taxJurisdiction.salesTaxRate,
      extraTaxes: offer.taxJurisdiction.extraTaxes,
      dealerStatedTax: offer.dealerStatedTax != null ? offer.dealerStatedTax : undefined,
    })

    const netTradeEquity = round2(offer.financing.tradeInValue - offer.financing.tradeInPayoff)
    const cashDown = round2(offer.financing.downPayment + scenario.bonusCash)
    const amountFinanced = round2(Math.max(0, waterfall.outTheDoor - cashDown - netTradeEquity))

    const horizon = Math.min(payoffHorizonMonths, scenario.termMonths)
    const loan = amortize({
      principal: amountFinanced,
      annualRate: scenario.apr,
      termMonths: scenario.termMonths,
      payoffAtMonth: horizon < scenario.termMonths ? horizon : undefined,
    })

    // Bonus cash is the lender's money — it reduces what's financed but
    // doesn't come out of the buyer's pocket.
    const totalCost = round2(offer.financing.downPayment + loan.totalPaid)

    return {
      offerId: offer.id,
      offerLabel: offer.label,
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      waterfall,
      rebateTotal,
      invalidRebates: invalid,
      bonusCash: scenario.bonusCash,
      amountFinanced,
      scheduledPayment: loan.scheduledPayment,
      apr: scenario.apr,
      termMonths: scenario.termMonths,
      horizonMonths: horizon,
      interestPaid: loan.totalInterest,
      balanceAtHorizon: loan.payoffBalance,
      totalCost,
    }
  }

  function compareAll(offers, payoffHorizonMonths) {
    const results = offers.flatMap((offer) =>
      (offer.scenarios || []).map((s) => evaluateScenario(offer, s, payoffHorizonMonths))
    )
    results.sort((a, b) => a.totalCost - b.totalCost)
    return results
  }

  function costCurve(offer, scenario) {
    const curve = []
    for (let m = 1; m <= scenario.termMonths; m++) {
      curve.push({ month: m, totalCost: evaluateScenario(offer, scenario, m).totalCost })
    }
    return curve
  }

  function breakevenMonth(offer, a, b) {
    const maxMonth = Math.min(a.termMonths, b.termMonths)
    let prevSign = 0
    for (let m = 1; m <= maxMonth; m++) {
      const diff = evaluateScenario(offer, a, m).totalCost - evaluateScenario(offer, b, m).totalCost
      const sign = diff > 0 ? 1 : diff < 0 ? -1 : 0
      if (m > 1 && sign !== 0 && prevSign !== 0 && sign !== prevSign) {
        return m
      }
      if (sign !== 0) prevSign = sign
    }
    return null
  }

  // Never hedges a real gap; names a close call as a close call.
  function verdict(offer, a, b, payoffHorizonMonths) {
    const resA = evaluateScenario(offer, a, payoffHorizonMonths)
    const resB = evaluateScenario(offer, b, payoffHorizonMonths)
    const gap = round2(Math.abs(resA.totalCost - resB.totalCost))
    const winner = resA.totalCost <= resB.totalCost ? resA : resB
    const loser = winner === resA ? resB : resA
    const cross = breakevenMonth(offer, a, b)

    let text
    if (gap < 200) {
      text = 'It\'s a wash — "' + winner.scenarioLabel + '" and "' + loser.scenarioLabel + '" land within $' + gap.toFixed(0) + " of each other at " + payoffHorizonMonths + " months. Decide on flexibility instead: a lower payment, not being tied to the captive lender, or keeping the option to refinance."
    } else if (cross) {
      const early = evaluateScenario(offer, a, Math.max(1, cross - 1)).totalCost <= evaluateScenario(offer, b, Math.max(1, cross - 1)).totalCost ? resA : resB
      text = '"' + early.scenarioLabel + '" only wins if you pay this off within ' + (cross - 1) + ' months. Past that, "' + (early === resA ? resB : resA).scenarioLabel + '" is cheaper. You said ' + payoffHorizonMonths + ' months, so take "' + winner.scenarioLabel + '" — you\'re $' + gap.toFixed(0) + " ahead."
    } else {
      text = '"' + winner.scenarioLabel + '" is cheaper at every payoff horizon — take it. At ' + payoffHorizonMonths + " months you're $" + gap.toFixed(0) + ' ahead of "' + loser.scenarioLabel + '".'
    }

    return { winner, loser, gap, breakevenMonth: cross, isCloseCall: gap < 200, text }
  }

  Object.assign(CDA, { validateScenarioRebates, evaluateScenario, compareAll, costCurve, breakevenMonth, verdict })
})(window.CDA = window.CDA || {})
