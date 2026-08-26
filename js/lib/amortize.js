// Simple-interest amortization with extra payments and early payoff, plus a
// Rule of 78s comparison for spotting precomputed-interest contracts.

;(function (CDA) {
  const { round2 } = CDA

  function scheduledPayment(principal, annualRate, termMonths) {
    if (termMonths <= 0) return 0
    if (annualRate === 0) return round2(principal / termMonths)
    const r = annualRate / 100 / 12
    const pow = Math.pow(1 + r, termMonths)
    return round2((principal * r * pow) / (pow - 1))
  }

  function amortize(params) {
    const payment = scheduledPayment(params.principal, params.annualRate, params.termMonths)
    const extra = params.extraMonthlyPayment || 0
    const r = params.annualRate / 100 / 12

    const schedule = []
    let balance = params.principal
    let totalInterest = 0
    let totalPaid = 0
    let month = 0
    let payoffBalance = 0

    while (balance > 0.005 && month < params.termMonths) {
      month++
      const interest = round2(balance * r)
      let pay = round2(payment + extra)
      let principalPart = round2(pay - interest)
      if (principalPart >= balance) {
        principalPart = balance
        pay = round2(balance + interest)
      }
      balance = round2(balance - principalPart)
      totalInterest = round2(totalInterest + interest)
      totalPaid = round2(totalPaid + pay)
      schedule.push({ month, payment: pay, principal: principalPart, interest, balance })

      if (params.payoffAtMonth != null && month === params.payoffAtMonth && balance > 0) {
        payoffBalance = balance
        totalPaid = round2(totalPaid + balance)
        balance = 0
      }
    }

    return { scheduledPayment: payment, totalInterest, totalPaid, monthsToPayoff: month, payoffBalance, schedule }
  }

  // Rule of 78s: precomputed interest earned on a reverse-digits curve —
  // early payoff refunds LESS interest than simple interest would.
  function ruleOf78Interest(params) {
    const payment = scheduledPayment(params.principal, params.annualRate, params.termMonths)
    const totalScheduledInterest = round2(payment * params.termMonths - params.principal)
    const n = params.termMonths
    const k = Math.min(params.payoffAtMonth != null ? params.payoffAtMonth : n, n)
    const sumDigits = (n * (n + 1)) / 2
    const earnedFraction = (k * (2 * n - k + 1)) / 2 / sumDigits
    return { totalScheduledInterest, interestKept: round2(totalScheduledInterest * earnedFraction) }
  }

  function precomputedPenalty(params) {
    const simple = amortize(params)
    const r78 = ruleOf78Interest(params)
    return round2(r78.interestKept - simple.totalInterest)
  }

  // Two-phase amortization for a planned refinance.
  function amortizeWithRefinance(params) {
    const phase1 = amortize({
      principal: params.principal,
      annualRate: params.annualRate,
      termMonths: params.termMonths,
      payoffAtMonth: params.refiAtMonth,
    })
    const refiPrincipal = phase1.payoffBalance
    const horizonAfterRefi = Math.max(0, params.payoffHorizonMonths - params.refiAtMonth)
    const phase2 = amortize({
      principal: refiPrincipal,
      annualRate: params.refiRate,
      termMonths: params.refiTermMonths,
      payoffAtMonth: horizonAfterRefi > 0 && horizonAfterRefi < params.refiTermMonths ? horizonAfterRefi : undefined,
    })
    const phase1Payments = round2(phase1.totalPaid - phase1.payoffBalance)
    return {
      phase1,
      phase2,
      totalInterest: round2(phase1.totalInterest + phase2.totalInterest),
      totalPaid: round2(phase1Payments + phase2.totalPaid),
    }
  }

  Object.assign(CDA, { scheduledPayment, amortize, ruleOf78Interest, precomputedPenalty, amortizeWithRefinance })
})(window.CDA = window.CDA || {})
