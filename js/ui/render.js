// All rendering. Two tiers: renderOffers() rebuilds the entry forms (only on
// structural changes, so typing never loses focus) and renderDerived()
// rebuilds everything computed — cheap, runs on every keystroke and slider
// move.

;(function (CDA) {
  const { state, fmt, fmt0, fmtPct, esc, STATE_TAX_RULES, getStateRule,
    computeWaterfall, evaluateScenario, compareAll, breakevenMonth, verdict, costCurve,
    detectFlags, scoreDeal, generateChecklist, crossoverChart } = CDA

  const $ = (sel) => document.querySelector(sel)

  // ── shared computation for one offer ──────────────────────────
  function offerComputed(offer) {
    const results = offer.scenarios.map((s) => evaluateScenario(offer, s, state.horizon))
    results.sort((a, b) => a.totalCost - b.totalCost)
    const best = results[0]
    const flags = detectFlags(offer, best ? best.waterfall.computedTax.totalTax : 0)
    const waterfall = best ? best.waterfall : computeWaterfall({
      msrp: offer.msrp, marketAdjustment: offer.marketAdjustment, factoryDiscount: offer.factoryDiscount,
      dealerDiscount: offer.dealerDiscount, accessories: offer.accessories, fees: offer.fees,
      rebateTotal: 0, tradeInValue: 0, tradeInPayoff: 0,
      stateCode: offer.taxJurisdiction.stateCode, rateOverride: offer.taxJurisdiction.salesTaxRate, extraTaxes: [],
    })
    const score = scoreDeal(offer, flags, waterfall, {
      segment: "mainstream",
      aprBenchmark: state.benchmark || 7,
      scenarioApr: best ? best.apr : offer.financing.apr,
    })
    return { results, best, flags, waterfall, score }
  }

  // ── Offers list + editors ─────────────────────────────────────
  function renderOffers() {
    const host = $("#offers")
    if (!state.offers.length) {
      host.innerHTML = `
        <div class="panel grid-paper p-8 text-center">
          <p class="font-mono text-[0.6875rem] tracking-[0.14em] text-ink-faint">NO OFFERS YET</p>
          <p class="mx-auto mt-3 max-w-md text-[0.9375rem] text-ink-soft">
            <strong class="text-ink">Full worksheet</strong> is the real tool — sticker price,
            dealer discount, rebates, add-ons, fees, and every way to pay. Quick compare is for
            checking bottom-line quotes in a hurry. Load the demo deal to see it all filled in.
          </p>
        </div>`
      return
    }
    host.innerHTML = state.offers.map((offer, i) => offerCard(offer, i)).join("")
  }

  function offerCard(offer, index) {
    const { best, score } = offerComputed(offer)
    const open = state.expandedOfferId === offer.id
    return `
    <article class="panel ${open ? "panel-strong" : ""}">
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
        <div class="min-w-0">
          <p class="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint">OFFER ${String(index + 1).padStart(2, "0")}${offer.mode === "quick" ? " · QUICK" : ""}</p>
          <h3 class="truncate text-lg font-extrabold tracking-tight">${esc(offer.label)}</h3>
        </div>
        <div class="flex items-center gap-4">
          ${best ? `<div class="text-right">
            <p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">OTD</p>
            <p class="font-mono text-base font-semibold tabular">${fmt(best.waterfall.outTheDoor)}</p>
          </div>
          <div class="text-right">
            <p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">SCORE</p>
            <p class="font-mono text-base font-semibold tabular ${score.score >= 6.5 ? "text-good" : score.score < 4.5 ? "text-bad" : ""}">${score.score.toFixed(1)}</p>
          </div>` : ""}
          <div class="flex gap-2">
            <button class="btn btn-ghost text-[0.75rem]" data-action="toggle-offer" data-id="${offer.id}">${open ? "Close" : "Edit"}</button>
            <button class="btn btn-danger text-[0.75rem]" data-action="delete-offer" data-id="${offer.id}">Delete</button>
          </div>
        </div>
      </header>
      ${open ? offerEditor(offer) : ""}
      ${offer.mode === "detailed" ? waterfallDetail(offer) : ""}
    </article>`
  }

  function moneyField(num, label, path, value, placeholder) {
    return `<div class="field-row">
      <span class="field-num">${num}</span>
      <label class="field-label" for="f-${path.replace(/\./g, "-")}">${label}</label>
      <input id="f-${path.replace(/\./g, "-")}" class="cell" inputmode="decimal" data-path="${path}" data-type="money" value="${value || value === 0 ? value : ""}" placeholder="${placeholder || "0.00"}" />
    </div>`
  }

  function offerEditor(offer) {
    const i = state.offers.indexOf(offer)
    const p = `offers.${i}`
    const rule = getStateRule(offer.taxJurisdiction.stateCode)

    if (offer.mode === "quick") {
      return `<div class="grid gap-6 px-4 py-5 sm:px-5">
        <div class="grid gap-2.5">
          <p class="section-code">Quick offer — five numbers</p>
          <div class="field-row"><span class="field-num">01</span>
            <label class="field-label">Dealer / label</label>
            <input class="cell cell-text" data-path="${p}.label" data-type="text" value="${esc(offer.label)}" /></div>
          ${moneyField("02", "Total MSRP (window sticker)", `${p}.msrp`, offer.msrp)}
          ${moneyField("03", "Out-the-door price quoted", `${p}.quickOtd`, offer.msrp - offer.dealerDiscount + offer.marketAdjustment)}
          ${moneyField("04", "Down payment", `${p}.financing.downPayment`, offer.financing.downPayment)}
        </div>
        ${scenarioEditor(offer, p)}
        <p class="border-l-2 border-warn bg-warn-wash px-3 py-2 text-[0.8125rem] leading-relaxed text-warn">Quick compare only checks bottom-line quotes. To enter <strong>dealer discounts, rebates (Ford/Toyota cash), add-ons, and fees</strong>, use the <strong>Full worksheet</strong> button instead — that's where the real analysis happens.</p>
      </div>`
    }

    return `<div class="grid gap-7 px-4 py-5 sm:px-5">
      <section class="grid gap-2.5">
        <p class="section-code">A — Dealer &amp; your state</p>
        <div class="field-row"><span class="field-num">01</span>
          <label class="field-label">Dealer / label</label>
          <input class="cell cell-text" data-path="${p}.label" data-type="text" value="${esc(offer.label)}" /></div>
        <div class="field-row"><span class="field-num">02</span>
          <label class="field-label">State</label>
          <select class="cell" data-path="${p}.taxJurisdiction.stateCode" data-type="state">
            ${STATE_TAX_RULES.map((r) => `<option value="${r.stateCode}" ${r.stateCode === offer.taxJurisdiction.stateCode ? "selected" : ""}>${r.stateCode} — ${esc(r.name)}</option>`).join("")}
          </select></div>
        <div class="field-row"><span class="field-num">03</span>
          <label class="field-label">Combined tax rate <span class="text-ink-faint">(state expects ${rule ? fmtPct(rule.baseRate) : "?"} + local)</span></label>
          <input class="cell" inputmode="decimal" data-path="${p}.taxJurisdiction.salesTaxRate" data-type="pct" value="${(offer.taxJurisdiction.salesTaxRate * 100).toFixed(2).replace(/\.?0+$/, "")}%" /></div>
        <div class="field-row"><span class="field-num">04</span>
          <label class="field-label">Dealer's stated tax <span class="text-ink-faint">(optional — pins their number)</span></label>
          <input class="cell" inputmode="decimal" data-path="${p}.dealerStatedTax" data-type="money-null" value="${offer.dealerStatedTax != null ? offer.dealerStatedTax : ""}" placeholder="leave blank" /></div>
        <div class="field-row"><span class="field-num">05</span>
          <label class="field-label">Days this VIN has been on the lot</label>
          <input class="cell" inputmode="numeric" data-path="${p}.vehicle.daysOnLot" data-type="int-null" value="${offer.vehicle.daysOnLot != null ? offer.vehicle.daysOnLot : ""}" placeholder="ask them" /></div>
        ${rule && rule.specialCase ? `<p class="border-l-2 border-warn bg-warn-wash px-3 py-2 text-[0.75rem] leading-relaxed text-warn">${esc(rule.name)} uses a special tax regime (${esc(rule.notes)}) — treat the computed tax as a rough estimate and lean on the dealer's stated number.</p>` : ""}
      </section>

      <section class="grid gap-2.5">
        <p class="section-code">B — Price &amp; discounts</p>
        ${moneyField("06", "Sticker price — the Total MSRP at the bottom of the window sticker", `${p}.msrp`, offer.msrp)}
        ${moneyField("07", "Discount already printed ON the sticker (0 if none)", `${p}.factoryDiscount`, offer.factoryDiscount)}
        ${moneyField("08", "Dealer discount — money the dealer takes off", `${p}.dealerDiscount`, offer.dealerDiscount)}
        ${moneyField("09", "Dealer markup ABOVE sticker price (0 if none)", `${p}.marketAdjustment`, offer.marketAdjustment)}
      </section>

      <section class="grid gap-2.5">
        <div class="flex items-center justify-between">
          <p class="section-code">C — Rebates <span class="normal-case">(Ford, Toyota, GM cash offers — any money the manufacturer takes off)</span></p>
          <button class="btn btn-ghost text-[0.6875rem]" data-action="add-rebate" data-id="${offer.id}">+ Add rebate</button>
        </div>
        ${offer.rebates.map((r, ri) => `
          <div class="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-2 sm:grid-cols-[1fr_8rem_auto_2.5rem]">
            <input class="cell cell-text" data-path="${p}.rebates.${ri}.label" data-type="text" value="${esc(r.label)}" placeholder="Retail Bonus Cash" />
            <input class="cell" inputmode="decimal" data-path="${p}.rebates.${ri}.amount" data-type="money" value="${r.amount}" />
            <label class="hidden items-center gap-1.5 text-[0.6875rem] text-ink-soft sm:flex" title="Some rebates only apply if you finance through the brand's own lender (Ford Credit, GM Financial, Toyota Financial)">
              <input type="checkbox" data-path="${p}.rebates.${ri}.requiresCaptiveFinancing" data-type="bool" ${r.requiresCaptiveFinancing ? "checked" : ""} />needs their financing
            </label>
            <button class="btn btn-danger !min-h-[36px] !px-2 text-[0.75rem]" data-action="remove-item" data-list="${p}.rebates" data-index="${ri}" aria-label="Remove rebate">×</button>
          </div>`).join("") || `<p class="text-[0.8125rem] text-ink-faint">None entered.</p>`}
      </section>

      <section class="grid gap-2.5">
        <div class="flex items-center justify-between">
          <p class="section-code">D — Dealer options &amp; add-ons <span class="normal-case">(tint, protection packages… what they charge vs what it's worth)</span></p>
          <button class="btn btn-ghost text-[0.6875rem]" data-action="add-accessory" data-id="${offer.id}">+ Add option</button>
        </div>
        ${offer.accessories.map((a, ai) => `
          <div class="grid grid-cols-[1fr_6.5rem_6.5rem_2.5rem] items-center gap-2">
            <input class="cell cell-text" data-path="${p}.accessories.${ai}.label" data-type="text" value="${esc(a.label)}" placeholder="Nitrogen fill…" />
            <input class="cell" inputmode="decimal" data-path="${p}.accessories.${ai}.charged" data-type="money" value="${a.charged}" title="Charged" />
            <input class="cell" inputmode="decimal" data-path="${p}.accessories.${ai}.retailValue" data-type="money" value="${a.retailValue}" title="Real value" />
            <button class="btn btn-danger !min-h-[36px] !px-2 text-[0.75rem]" data-action="remove-item" data-list="${p}.accessories" data-index="${ai}" aria-label="Remove add-on">×</button>
          </div>`).join("") || `<p class="text-[0.8125rem] text-ink-faint">None — good. Charged / real-value columns appear when you add one.</p>`}
      </section>

      <section class="grid gap-2.5">
        <div class="flex items-center justify-between">
          <p class="section-code">E — Fees</p>
          <button class="btn btn-ghost text-[0.6875rem]" data-action="add-fee" data-id="${offer.id}">+ Fee</button>
        </div>
        ${offer.fees.map((f, fi) => `
          <div class="grid grid-cols-[1fr_6.5rem_2.5rem] items-center gap-2 sm:grid-cols-[1fr_6.5rem_8rem_auto_2.5rem]">
            <input class="cell cell-text" data-path="${p}.fees.${fi}.label" data-type="text" value="${esc(f.label)}" />
            <input class="cell" inputmode="decimal" data-path="${p}.fees.${fi}.amount" data-type="money" value="${f.amount}" />
            <select class="cell hidden sm:block" data-path="${p}.fees.${fi}.category" data-type="text">
              <option value="government" ${f.category === "government" ? "selected" : ""}>government</option>
              <option value="doc" ${f.category === "doc" ? "selected" : ""}>doc</option>
              <option value="dealer-junk" ${f.category === "dealer-junk" ? "selected" : ""}>dealer</option>
            </select>
            <label class="hidden items-center gap-1.5 text-[0.6875rem] text-ink-soft sm:flex">
              <input type="checkbox" data-path="${p}.fees.${fi}.isTaxable" data-type="bool" ${f.isTaxable ? "checked" : ""} />taxable
            </label>
            <button class="btn btn-danger !min-h-[36px] !px-2 text-[0.75rem]" data-action="remove-item" data-list="${p}.fees" data-index="${fi}" aria-label="Remove fee">×</button>
          </div>`).join("")}
      </section>

      <section class="grid gap-2.5">
        <p class="section-code">F — Down payment &amp; trade-in</p>
        ${moneyField("10", "Down payment", `${p}.financing.downPayment`, offer.financing.downPayment)}
        ${moneyField("11", "Trade-in value offered", `${p}.financing.tradeInValue`, offer.financing.tradeInValue)}
        ${moneyField("12", "Trade-in loan payoff", `${p}.financing.tradeInPayoff`, offer.financing.tradeInPayoff)}
        <div class="field-row"><span class="field-num">13</span>
          <label class="field-label">Prepayment penalty?</label>
          <select class="cell" data-path="${p}.financing.hasPrepaymentPenalty" data-type="tristate">
            <option value="unknown" ${offer.financing.hasPrepaymentPenalty == null ? "selected" : ""}>don't know yet</option>
            <option value="no" ${offer.financing.hasPrepaymentPenalty === false ? "selected" : ""}>no — simple interest</option>
            <option value="yes" ${offer.financing.hasPrepaymentPenalty === true ? "selected" : ""}>yes / precomputed</option>
          </select></div>
      </section>

      ${scenarioEditor(offer, p)}
    </div>`
  }

  function scenarioEditor(offer, p) {
    return `
    <section class="grid gap-2.5">
      <div class="flex items-center justify-between gap-3">
        <p class="section-code">G — Ways to pay</p>
        <button class="btn btn-ghost text-[0.6875rem]" data-action="add-scenario" data-id="${offer.id}">+ Add a way to pay</button>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <div class="border border-hairline bg-paper px-3 py-2 rounded-[2px]">
          <p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">TYPICAL CHOICE 1</p>
          <p class="mt-0.5 text-[0.8125rem] font-medium">Keep the rebates, pay the normal rate</p>
        </div>
        <div class="border border-hairline bg-paper px-3 py-2 rounded-[2px]">
          <p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">TYPICAL CHOICE 2</p>
          <p class="mt-0.5 text-[0.8125rem] font-medium">Give up the rebates, get 0% / low APR</p>
        </div>
      </div>
      <p class="text-[0.8125rem] text-ink-soft">Add each choice the dealer offers. Tick the rebates it keeps. The tool shows which one costs less.</p>
      ${offer.scenarios.map((s, si) => `
        <div class="panel grid gap-2 p-3">
          <div class="grid grid-cols-[1fr_2.5rem] items-center gap-2 sm:grid-cols-[1fr_6rem_6rem_6.5rem_2.5rem]">
            <input class="cell cell-text" data-path="${p}.scenarios.${si}.label" data-type="text" value="${esc(s.label)}" placeholder="0% for 60, forfeit rebates" />
            <input class="cell hidden sm:block" inputmode="decimal" data-path="${p}.scenarios.${si}.apr" data-type="apr" value="${s.apr}" title="APR %" />
            <input class="cell hidden sm:block" inputmode="numeric" data-path="${p}.scenarios.${si}.termMonths" data-type="int" value="${s.termMonths}" title="Term (months)" />
            <input class="cell hidden sm:block" inputmode="decimal" data-path="${p}.scenarios.${si}.bonusCash" data-type="money" value="${s.bonusCash}" title="Bonus cash" />
            <button class="btn btn-danger !min-h-[36px] !px-2 text-[0.75rem]" data-action="remove-item" data-list="${p}.scenarios" data-index="${si}" aria-label="Remove scenario">×</button>
          </div>
          <div class="grid grid-cols-3 gap-2 sm:hidden">
            <input class="cell" inputmode="decimal" data-path="${p}.scenarios.${si}.apr" data-type="apr" value="${s.apr}" aria-label="APR percent" />
            <input class="cell" inputmode="numeric" data-path="${p}.scenarios.${si}.termMonths" data-type="int" value="${s.termMonths}" aria-label="Term months" />
            <input class="cell" inputmode="decimal" data-path="${p}.scenarios.${si}.bonusCash" data-type="money" value="${s.bonusCash}" aria-label="Bonus cash" />
          </div>
          ${offer.rebates.length ? `<div class="flex flex-wrap gap-x-4 gap-y-1">
            ${offer.rebates.map((r) => `
              <label class="inline-flex items-center gap-1.5 text-[0.75rem] text-ink-soft">
                <input type="checkbox" data-action="toggle-scenario-rebate" data-scenario="${p}.scenarios.${si}" data-rebate="${r.id}" ${s.rebatesApplied.includes(r.id) ? "checked" : ""} />
                ${esc(r.label)} (${fmt0(r.amount)})
              </label>`).join("")}
          </div>` : ""}
        </div>`).join("")}
      <p class="text-[0.6875rem] font-mono tracking-wide text-ink-faint">THE 3 NUMBER BOXES = APR % · MONTHS · BONUS CASH (if the 0% offer includes extra cash)</p>
    </section>`
  }

  function waterfallDetail(offer) {
    const { best } = offerComputed(offer)
    if (!best) return ""
    const w = best.waterfall
    const line = (label, value, cls) => `<tr class="${cls || ""}"><td class="py-1 pr-4 text-ink-soft">${label}</td><td class="py-1 text-right font-mono tabular">${value}</td></tr>`
    const taxDelta = w.dealerStatedTax != null ? w.dealerStatedTax - w.computedTax.totalTax : null
    return `
    <details class="border-t border-hairline">
      <summary class="cursor-pointer px-4 py-3 font-mono text-[0.6875rem] tracking-[0.14em] text-ink-faint hover:text-ink sm:px-5">SHOW THE WATERFALL — MSRP TO OUT THE DOOR</summary>
      <div class="px-4 pb-5 sm:px-5">
        <table class="w-full max-w-md text-[0.8125rem]">
          ${w.factoryDiscount ? line("Sticker before discounts", fmt(w.stickerBeforeDiscounts)) : ""}
          ${line("Total MSRP", fmt(w.msrp))}
          ${w.marketAdjustment ? line("Market adjustment", `<span class="text-bad">+${fmt(w.marketAdjustment)}</span>`) : ""}
          ${line("Dealer discount", `<span class="text-good">−${fmt(w.dealerDiscount)}</span>`)}
          ${line("<strong>Selling price</strong>", `<strong>${fmt(w.sellingPrice)}</strong>`, "border-t border-hairline")}
          ${w.accessoriesCharged ? line("Accessories charged", "+" + fmt(w.accessoriesCharged)) : ""}
          ${line("Taxable fees", "+" + fmt(w.taxableFees))}
          ${line("<strong>Taxable subtotal</strong>", `<strong>${fmt(w.taxableSubtotal)}</strong>`, "border-t border-hairline")}
          ${line("Rebates", `<span class="text-good">−${fmt(w.rebateTotal)}</span>`)}
          ${line("<strong>Cash price</strong>", `<strong>${fmt(w.cashPrice)}</strong>`, "border-t border-hairline")}
          ${line(`Sales tax · our estimate @ ${fmtPct(w.computedTax.rateUsed)}${w.computedTax.rebateReducedBase ? " (post-rebate basis)" : " (pre-rebate basis)"}`, "+" + fmt(w.computedTax.totalTax))}
          ${w.dealerStatedTax != null ? line(`Dealer's stated tax <span class="text-ink-faint">(pinned${taxDelta && Math.abs(taxDelta) > 50 ? `, ${taxDelta > 0 ? "higher" : "lower"} by ${fmt(Math.abs(taxDelta))}` : ""})</span>`, "+" + fmt(w.dealerStatedTax)) : ""}
          ${line("Government fees (non-taxable)", "+" + fmt(w.nonTaxableFees))}
          ${line("<strong>OUT THE DOOR</strong>", `<strong class="text-base">${fmt(w.outTheDoor)}</strong>`, "border-t-2 border-ink")}
        </table>
      </div>
    </details>`
  }

  // ── Derived sections ──────────────────────────────────────────
  function renderDerived() {
    const results = compareAll(state.offers, state.horizon)
    const has = results.length > 0

    $("#comparison-section").classList.toggle("hidden", results.length < 2)
    $("#chart-section").classList.toggle("hidden", !chartFocusOffer())
    $("#flags-section").classList.toggle("hidden", !has)
    $("#score-section").classList.toggle("hidden", !has)
    $("#checklist-section").classList.toggle("hidden", !has)

    if (results.length >= 2) renderComparison(results)
    renderChart()
    if (has) { renderFlags(); renderScores(); renderChecklist() }
  }

  function renderComparison(results) {
    const min = (key) => Math.min.apply(null, results.map((r) => r[key]))
    const cell = (r, key, formatter) => {
      const isBest = results.length > 1 && r[key] === min(key)
      return `<td class="${isBest ? "win" : ""}">${formatter(r[key])}</td>`
    }
    $("#comparison").innerHTML = `
    <table class="compare w-full">
      <thead><tr>
        <th>Line</th>
        ${results.map((r) => `<th>${esc(r.offerLabel)}<br/><span class="normal-case text-ink-soft">${esc(r.scenarioLabel)}</span></th>`).join("")}
      </tr></thead>
      <tbody>
        <tr class="row-headline"><td>Total cost @ ${state.horizon} mo</td>${results.map((r) => cell(r, "totalCost", fmt)).join("")}</tr>
        <tr><td>Out the door</td>${results.map((r) => `<td>${fmt(r.waterfall.outTheDoor)}</td>`).join("")}</tr>
        <tr><td>Rebates in this path</td>${results.map((r) => `<td>${r.rebateTotal ? "−" + fmt(r.rebateTotal) : "—"}</td>`).join("")}</tr>
        <tr><td>Amount financed</td>${results.map((r) => `<td>${fmt(r.amountFinanced)}</td>`).join("")}</tr>
        <tr><td>APR / term</td>${results.map((r) => `<td>${r.apr}% · ${r.termMonths} mo</td>`).join("")}</tr>
        <tr><td>Monthly payment <span class="text-ink-faint">(not the headline)</span></td>${results.map((r) => `<td>${fmt(r.scheduledPayment)}</td>`).join("")}</tr>
        <tr><td>Interest paid by month ${state.horizon}</td>${results.map((r) => `<td>${fmt(r.interestPaid)}</td>`).join("")}</tr>
        <tr><td>Balance cleared at month ${state.horizon}</td>${results.map((r) => `<td>${r.balanceAtHorizon ? fmt(r.balanceAtHorizon) : "—"}</td>`).join("")}</tr>
      </tbody>
    </table>`
  }

  function chartFocusOffer() {
    const eligible = state.offers.filter((o) => o.scenarios.length >= 2)
    if (!eligible.length) return null
    return eligible.find((o) => o.id === state.chartOfferId) || eligible[0]
  }

  function renderChart() {
    const offer = chartFocusOffer()
    if (!offer) return
    const eligible = state.offers.filter((o) => o.scenarios.length >= 2)

    const a = offer.scenarios[0], b = offer.scenarios[1]
    const v = verdict(offer, a, b, Math.min(state.horizon, Math.max(a.termMonths, b.termMonths)))
    $("#verdict").innerHTML = `
      ${eligible.length > 1 ? `<div class="mb-4 flex flex-wrap gap-2">${eligible.map((o) => `
        <button class="btn ${o.id === offer.id ? "" : "btn-ghost"} text-[0.75rem]" data-action="focus-chart" data-id="${o.id}">${esc(o.label)}</button>`).join("")}</div>` : ""}
      <div class="verdict ${v.isCloseCall ? "verdict-close" : ""} p-5 sm:p-6">
        <p class="font-mono text-[0.625rem] tracking-[0.14em] ${v.isCloseCall ? "text-warn" : "text-good"}">${v.isCloseCall ? "TOO CLOSE TO CALL ON PRICE ALONE" : "THE VERDICT"}</p>
        <p class="mt-2 text-[1.0625rem] font-semibold leading-relaxed">${esc(v.text)}</p>
        ${v.breakevenMonth ? `<p class="mt-2 font-mono text-[0.75rem] text-ink-soft">ANSWER FLIPS AT MONTH ${v.breakevenMonth} · YOU SAID ${state.horizon} · DIFFERENCE ${fmt0(v.gap)}</p>` : ""}
      </div>`

    const curves = offer.scenarios.map((s) => ({ label: s.label, points: costCurve(offer, s) }))
    const be = offer.scenarios.length >= 2 ? breakevenMonth(offer, offer.scenarios[0], offer.scenarios[1]) : null
    $("#chart").innerHTML = crossoverChart(curves, state.horizon, be)
  }

  function renderFlags() {
    const blocks = state.offers.map((offer) => {
      const { flags } = offerComputed(offer)
      if (!flags.length) return `
        <div class="panel p-4">
          <p class="font-mono text-[0.6875rem] tracking-[0.14em] text-ink-faint">${esc(offer.label).toUpperCase()}</p>
          <p class="mt-1 text-[0.875rem] text-good">Clean worksheet — nothing flagged. That's rarer than it should be.</p>
        </div>`
      return `
      <div class="panel">
        <p class="border-b border-hairline px-4 py-2.5 font-mono text-[0.6875rem] tracking-[0.14em] text-ink-faint">${esc(offer.label).toUpperCase()} — ${flags.length} FLAG${flags.length > 1 ? "S" : ""}, RANKED BY DOLLARS</p>
        ${flags.map((f) => `
          <div class="flag flag-${f.severity} flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-3 last:border-b-0">
            <div class="min-w-0 flex-1">
              <p class="font-semibold ${f.severity === "critical" ? "text-bad" : ""}">${esc(f.label)}
                <span class="ml-2 font-mono text-[0.625rem] tracking-widest ${f.severity === "critical" || f.severity === "high" ? "text-bad" : f.severity === "medium" ? "text-warn" : "text-ink-faint"}">${f.severity.toUpperCase()}</span></p>
              <p class="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">${esc(f.message)}</p>
            </div>
            <p class="font-mono text-base font-semibold tabular">${fmt0(f.amount)}</p>
          </div>`).join("")}
      </div>`
    })
    $("#flags").innerHTML = blocks.join("")
  }

  function renderScores() {
    $("#scores").innerHTML = state.offers.map((offer) => {
      const { score } = offerComputed(offer)
      return `
      <div class="panel p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="font-mono text-[0.6875rem] tracking-[0.14em] text-ink-faint">${esc(offer.label).toUpperCase()}</p>
            <p class="mt-1 text-[0.875rem] font-semibold">${esc(score.band)}</p>
          </div>
          <p class="font-mono text-4xl font-semibold tabular ${score.score >= 6.5 ? "text-good" : score.score < 4.5 ? "text-bad" : ""}">${score.score.toFixed(1)}<span class="text-base text-ink-faint">/10</span></p>
        </div>
        <div class="mt-4 grid gap-2.5">
          ${score.components.map((c) => `
            <div>
              <div class="flex items-baseline justify-between gap-4">
                <p class="text-[0.8125rem] text-ink-soft">${esc(c.label)} <span class="font-mono text-[0.625rem] text-ink-faint">${Math.round(c.weight * 100)}%</span></p>
                <p class="font-mono text-[0.8125rem] tabular">${(c.score * 10).toFixed(1)}</p>
              </div>
              <div class="scorebar mt-1"><span style="width:${(c.score * 100).toFixed(0)}%"></span></div>
              <p class="mt-1 text-[0.6875rem] leading-relaxed text-ink-faint">${esc(c.detail)}</p>
            </div>`).join("")}
        </div>
        ${score.improvements.length ? `
        <div class="mt-4 border-t border-hairline pt-3">
          <p class="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint">WHAT WOULD MAKE THIS A 9–10</p>
          <ul class="mt-2 grid gap-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">
            ${score.improvements.map((imp) => `<li class="flex gap-2"><span class="text-ink-faint">→</span>${esc(imp)}</li>`).join("")}
          </ul>
        </div>` : ""}
        <p class="mt-3 text-[0.6875rem] leading-relaxed text-ink-faint">Honest scale: 8 is genuinely good, most buyers land 5–6, and a 10 takes luck about a specific unit as much as skill.</p>
      </div>`
    }).join("")
  }

  function renderChecklist() {
    $("#print-checklist").innerHTML = state.offers.map((offer) => {
      const { flags, best } = offerComputed(offer)
      const sections = generateChecklist(
        Object.assign({}, offer, { otdForChecklist: best ? best.waterfall.outTheDoor : null }),
        flags,
        { payoffHorizonMonths: state.horizon }
      )
      return `
      <div class="panel p-5">
        <p class="font-mono text-[0.6875rem] tracking-[0.14em] text-ink-faint">${esc(offer.label).toUpperCase()}</p>
        ${sections.map((s) => `
          <h3 class="mt-4 border-b border-hairline pb-1.5 text-[0.9375rem] font-extrabold tracking-tight">${esc(s.title)}</h3>
          <ul class="mt-2 grid gap-2">
            ${s.items.map((item) => `
              <li class="flex items-start gap-2.5 text-[0.875rem] leading-relaxed ${item.critical ? "font-semibold" : "text-ink-soft"}">
                <span class="mt-0.5 inline-block h-4 w-4 flex-shrink-0 border border-ink-faint" aria-hidden="true"></span>
                <span>${item.critical ? `<span class="font-mono text-[0.625rem] tracking-widest text-bad">CRITICAL · </span>` : ""}${esc(item.text)}</span>
              </li>`).join("")}
          </ul>`).join("")}
      </div>`
    }).join("")
  }

  function renderAll() {
    renderOffers()
    renderDerived()
  }

  Object.assign(CDA, { offerComputed, renderOffers, renderDerived, renderAll })
})(window.CDA = window.CDA || {})
