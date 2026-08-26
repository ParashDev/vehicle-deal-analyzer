// The question checklist generator — personalized from what the user
// entered, what's missing, and what got flagged. Grouped to mirror the
// actual sequence of a purchase.

;(function (CDA) {
  function generateChecklist(offer, flags, context) {
    context = context || {}
    const otdKnown = offer.otdForChecklist
    const before = [
      { text: "Is " + (otdKnown ? "$" + Number(otdKnown).toLocaleString() : "your number") + " the total out the door including tax, title, license, and doc fee, with nothing further owed?" },
      { text: "Can you send an itemized buyer's order showing selling price, rebates, doc fee, tax, and TTL as separate lines?" },
      { text: "Which specific rebates are included, and do any require financing through the captive lender?" },
      { text: "Is this price contingent on financing with you?" },
      { text: "How many days has this VIN been on your lot?" },
    ]

    if (offer.rebates.some((r) => r.requiresCaptiveFinancing)) {
      before.push({ text: "Which rebates survive if I finance through my own bank or credit union?" })
    }
    if (context.affiliateUnknown) {
      before.push({ text: "Do I qualify for X-Plan / Partner Recognition / supplier pricing? Can you check my employer?" })
    }
    for (const acc of offer.accessories.filter((a) => a.charged === 0)) {
      before.push({
        critical: true,
        text: '"' + acc.label + '" is promised at no charge — put it on a signed We Owe / Due Bill form with the VIN and a date. A verbal promise is worth nothing after signing.',
      })
    }
    if (offer.financing.hasPrepaymentPenalty !== false) {
      before.push({
        text: "Is this a simple-interest contract with no prepayment penalty? Verify in the Truth in Lending box — reject anything reading “precomputed”, “Rule of 78s”, or “unearned finance charge refund”.",
      })
    }
    const horizon = context.payoffHorizonMonths
    if (horizon != null && horizon < offer.financing.termMonths * 0.6) {
      before.push({ text: "I plan to pay this off early — confirm there is no minimum-term or minimum-amount-financed requirement to keep the rebates." })
    }
    if (offer.vehicle.daysOnLot != null && offer.vehicle.daysOnLot > 60) {
      before.push({ text: "This unit has been here " + offer.vehicle.daysOnLot + " days. What's your best number to move it today?" })
    }
    for (const flag of flags.filter((f) => f.kind === "junk" || f.kind === "adm" || (f.kind === "doc-fee" && f.severity !== "low"))) {
      before.push({ text: "Remove or justify the $" + flag.amount.toFixed(0) + ' "' + flag.label + '" charge. ' + flag.message })
    }

    const atDesk = [
      { text: "Are there any dealer-installed accessories or protection packages on this vehicle?" },
      { text: "Are there fees not on this buyer's order?" },
      { text: "Does it come with two keys, floor mats, and a full tank?" },
      { text: "Confirm the VIN on the buyer's order matches the window sticker." },
    ]

    const fAndI = [
      { text: "What rate did the lender approve versus the rate you're writing?" },
      { text: "If I take the promotional APR instead, do I keep the bonus cash and any included maintenance?" },
      { text: "If GAP or an extended warranty is sold: is it cancelable with a prorated refund, and what's the process?" },
      { text: "Never sign the worksheet — read the final numbers on the retail installment contract.", critical: true },
    ]

    return [
      { title: "Before you go (get it in writing by text or email)", items: before },
      { title: "At the desk", items: atDesk },
      { title: "In the F&I office", items: fAndI },
    ]
  }

  function checklistToText(sections) {
    return sections
      .map((s) => s.title.toUpperCase() + "\n" + s.items.map((i) => "  [ ] " + (i.critical ? "CRITICAL: " : "") + i.text).join("\n"))
      .join("\n\n")
  }

  Object.assign(CDA, { generateChecklist, checklistToText })
})(window.CDA = window.CDA || {})
