// All rendering — quick-compare model only. Two tiers: renderOffers()
// rebuilds the entry forms (only on structural changes, so typing never
// loses focus) and renderDerived() rebuilds everything computed — cheap,
// runs on every keystroke and slider move.

;(function (CDA) {
  const { state, fmt, fmt0, esc,
    evaluateScenario, effectiveScenarios, compareAll, breakevenMonth, verdict, costCurve,
    detectFlags, scoreQuickDeal, generateChecklist, crossoverChart } = CDA

  const $ = (sel) => document.querySelector(sel)

  // Free dealer add-ons (charged 0): never move the OTD, count as value
  const includedItemsOf = (offer) => offer.accessories.filter((a) => a.charged === 0 && a.retailValue > 0)
  const includedValueOf = (offer) => includedItemsOf(offer).reduce((s, a) => s + a.retailValue, 0)
  const includedNamesOf = (offer) => {
    const names = includedItemsOf(offer).map((a) => a.label || "unnamed item")
    return names.length > 3 ? names.slice(0, 3).join(", ") + "…" : names.join(", ")
  }
  const rebateTotalOf = (offer) => (offer.rebates || []).reduce((s, r) => s + (r.amount || 0), 0)

  // ── shared computation for one offer ──────────────────────────
  function offerComputed(offer) {
    const results = effectiveScenarios(offer, state.horizon).map((s) => evaluateScenario(offer, s, state.horizon))
    results.sort((a, b) => a.totalCost - b.totalCost)
    const best = results[0]
    // flags still feed the checklist (e.g. a quote above sticker fires the
    // markup question) even though there is no flags section any more
    const flags = detectFlags(offer, 0)
    // Score's biggest component is RELATIVE: value-adjusted total cost as a
    // fraction of each vehicle's own sticker — a dollar comparison when the
    // MSRPs match, a deal-quality comparison when the vehicles differ
    const peers = state.offers.filter((o) => !o.draft)
    let relative = null
    if (peers.length >= 2 && !offer.draft && offer.msrp > 0) {
      const msrps = peers.map((o) => o.msrp).filter((m) => m > 0)
      const sameVehicle = msrps.length >= 2 && (Math.max.apply(null, msrps) - Math.min.apply(null, msrps)) / Math.min.apply(null, msrps) <= 0.02
      const myNet = best.totalCost - includedValueOf(offer)
      const myRatio = myNet / offer.msrp
      const bestRatio = Math.min.apply(null, peers.filter((o) => o.msrp > 0).map((o) => netCostOf(o) / o.msrp))
      const gapRatio = myRatio - bestRatio
      let detail, improve
      if (gapRatio <= 0.0005) {
        detail = "This is your best offer — the others are graded against it."
      } else if (sameVehicle) {
        const bestNet = Math.min.apply(null, peers.map(netCostOf))
        const gapDollars = Math.round(myNet - bestNet)
        detail = "$" + gapDollars.toLocaleString() + " more total cost than your best offer by your payoff date, with included extras counted."
        improve = "You're $" + gapDollars.toLocaleString() + " behind your best offer — show this dealer that quote and ask them to beat it."
      } else {
        detail = "Total cost lands at " + (myRatio * 100).toFixed(1) + "% of THIS vehicle's sticker; your best offer runs " + (bestRatio * 100).toFixed(1) + "% of its own. Different vehicles are graded on deal quality, not absolute price."
        improve = "This deal runs " + ((gapRatio) * 100).toFixed(1) + " points of sticker behind your best — push this dealer harder or take the other deal."
      }
      relative = { gapRatio, detail, improve }
    }
    const bench = aprBenchmark(peers)
    const incValues = peers.map(includedValueOf).sort((a, b) => a - b)
    const incMid = Math.floor(incValues.length / 2)
    const includedBench = incValues.length >= 2 ? {
      median: incValues.length % 2 ? incValues[incMid] : (incValues[incMid - 1] + incValues[incMid]) / 2,
      max: Math.max.apply(null, incValues),
    } : null
    // Price head-to-head: best and median quoted-OTD-to-sticker ratios
    const priceRatios = peers.filter((o) => o.msrp > 0).map((o) => (o.quickOtd || 0) / o.msrp).sort((a, b) => a - b)
    const prMid = Math.floor(priceRatios.length / 2)
    const priceBench = priceRatios.length >= 2 ? {
      best: priceRatios[0],
      median: priceRatios.length % 2 ? priceRatios[prMid] : (priceRatios[prMid - 1] + priceRatios[prMid]) / 2,
    } : null
    const score = scoreQuickDeal(offer, best, { aprBenchmark: bench.value, benchmarkLabel: bench.label, relative, includedBench, priceBench })
    return { results, best, flags, score }
  }

  // Financing benchmark: the median APR of the standard-rate (rebate-kept)
  // ways across all entered offers — your own market, not a magic number.
  // Falls back to any entered rates, then to a 7% market default.
  function aprBenchmark(peers) {
    const kept = peers.flatMap((o) => o.scenarios.filter((s) => s.rebatesApplied && s.rebatesApplied.length > 0).map((s) => s.apr)).filter((a) => a > 0)
    const pool = kept.length ? kept : peers.flatMap((o) => o.scenarios.map((s) => s.apr)).filter((a) => a > 0)
    if (!pool.length) return { value: 7, label: "a 7% market default" }
    pool.sort((a, b) => a - b)
    const mid = Math.floor(pool.length / 2)
    const median = pool.length % 2 ? pool[mid] : (pool[mid - 1] + pool[mid]) / 2
    return { value: median, label: "the " + (Math.round(median * 100) / 100) + "% median of the standard-rate ways you entered" }
  }

  // Cheapest way's total cost at the horizon, minus what's thrown in free
  function netCostOf(offer) {
    const costs = effectiveScenarios(offer, state.horizon).map((s) => evaluateScenario(offer, s, state.horizon).totalCost)
    return Math.min.apply(null, costs) - includedValueOf(offer)
  }

  // ── Offers list + editor ──────────────────────────────────────
  function renderOffers() {
    const host = $("#offers")
    if (!state.offers.length) {
      host.innerHTML = `
        <div class="panel grid-paper p-8 text-center">
          <p class="font-mono text-[0.6875rem] tracking-[0.14em] text-ink-faint">NO OFFERS YET</p>
          <p class="mx-auto mt-3 max-w-md text-[0.9375rem] text-ink-soft">
            One offer per dealer: the quoted out-the-door price, the rebate inside it,
            what they throw in, and the ways to pay. Load the demo deal to see it filled in.
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
          <p class="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint">OFFER ${String(index + 1).padStart(2, "0")}${offer.draft ? ` <span class="text-warn">· DRAFT — NOT SAVED</span>` : ""}</p>
          <h3 class="truncate text-lg font-extrabold tracking-tight">${esc(offer.label)}</h3>
        </div>
        <div class="flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2">
          ${best && !offer.draft ? `<div class="text-right">
            <p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">OTD</p>
            <p class="font-mono text-base font-semibold tabular">${fmt(best.waterfall.outTheDoor)}</p>
          </div>
          <div class="text-right">
            <p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">MONTHLY</p>
            <p class="font-mono text-base font-semibold tabular">${fmt(best.scheduledPayment)}</p>
          </div>
          ${includedValueOf(offer) > 0 ? `<div class="text-right">
            <p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">+VALUE</p>
            <p class="font-mono text-base font-semibold tabular text-good">${fmt0(includedValueOf(offer))}</p>
          </div>` : ""}
          <div class="text-right">
            <p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">SCORE</p>
            <p class="font-mono text-base font-semibold tabular ${score.score >= 6.5 ? "text-good" : score.score < 4.5 ? "text-bad" : ""}">${score.score.toFixed(1)}</p>
          </div>` : ""}
          <div class="flex gap-2">
            ${open
              ? offer.draft
                ? `<button class="btn btn-ghost text-[0.75rem]" data-action="toggle-offer" data-id="${offer.id}">Close</button>`
                : `<button class="btn btn-ghost text-[0.75rem]" data-action="cancel-edit" data-id="${offer.id}">Cancel</button>`
              : `<button class="btn btn-ghost text-[0.75rem]" data-action="toggle-offer" data-id="${offer.id}">Edit</button>`}
            ${offer.draft
              ? `<button class="btn btn-danger text-[0.75rem]" data-action="discard-offer" data-id="${offer.id}">Discard</button>`
              : `<button class="btn btn-danger text-[0.75rem]" data-action="delete-offer" data-id="${offer.id}">Delete</button>`}
          </div>
        </div>
      </header>
      ${open ? offerEditor(offer) : ""}
      ${!offer.draft && offer.msrp ? breakdownDetail(offer) : ""}
    </article>`
  }

  // Save / Cancel bar at the bottom of the editor — nothing commits without it
  function editorFooter(offer) {
    return `
    <div class="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
      ${offer.draft
        ? `<button class="btn" data-action="save-offer" data-id="${offer.id}">Save offer</button>
           <button class="btn btn-danger" data-action="discard-offer" data-id="${offer.id}">Discard</button>
           <p class="w-full text-[0.6875rem] text-ink-faint sm:w-auto">This offer joins the comparison when you save it.</p>`
        : `<button class="btn" data-action="save-offer" data-id="${offer.id}">Save changes</button>
           <button class="btn btn-ghost" data-action="cancel-edit" data-id="${offer.id}">Cancel</button>
           <p class="w-full text-[0.6875rem] text-ink-faint sm:w-auto">Live preview below — Cancel reverts everything since you opened this.</p>`}
    </div>`
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
    return `<div class="grid gap-6 px-4 py-5 sm:px-5">
      <div class="grid gap-2.5">
        <p class="section-code">The offer — five numbers</p>
        <div class="field-row"><span class="field-num">01</span>
          <label class="field-label">Dealer / label</label>
          <input class="cell cell-text" data-path="${p}.label" data-type="text" value="${esc(offer.label)}" /></div>
        ${moneyField("02", "Total MSRP (window sticker)", `${p}.msrp`, offer.msrp)}
        ${moneyField("03", "Out-the-door price quoted <span class=\"text-ink-faint\">(their bottom line, rebate included)</span>", `${p}.quickOtd`, offer.quickOtd)}
        ${moneyField("04", "Rebate included in that price <span class=\"text-ink-faint\">(Ford/Toyota cash — 0 if none)</span>", `${p}.rebates.0.amount`, offer.rebates[0] ? offer.rebates[0].amount : 0)}
        ${moneyField("05", "Down payment", `${p}.financing.downPayment`, offer.financing.downPayment)}
        <p class="text-[0.6875rem] leading-relaxed text-ink-faint">If a way to pay gives the rebate up (the usual 0% APR trade), we price that way at your quote + the rebate — the dealer doesn't hand you both.</p>
      </div>

      <div class="grid gap-2.5">
        <div class="flex items-center justify-between gap-3">
          <p class="section-code">Dealer add-ons included in that price</p>
          <button class="btn btn-ghost text-[0.6875rem]" data-action="add-included" data-id="${offer.id}">+ Add an add-on</button>
        </div>
        <p class="text-[0.8125rem] text-ink-soft">
          Bed liner, mats, tint — anything the dealer throws in. This never changes the OTD;
          it counts as <strong class="text-ink">value</strong>, so two same-price offers rank
          by what you actually get.
        </p>
        ${offer.accessories.length ? `<p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">WHAT IT IS · WHAT IT'S WORTH</p>` : ""}
        ${offer.accessories.map((a, ai) => `
          <div class="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-2">
            <input class="cell cell-text" data-path="${p}.accessories.${ai}.label" data-type="text" value="${esc(a.label)}" placeholder="e.g. all-weather mats, tint, bed liner" />
            <input class="cell" inputmode="decimal" data-path="${p}.accessories.${ai}.retailValue" data-type="money" value="${a.retailValue}" title="What it's worth" />
            <button class="btn btn-danger !min-h-[36px] !px-2 text-[0.75rem]" data-action="remove-item" data-list="${p}.accessories" data-index="${ai}" aria-label="Remove add-on">×</button>
          </div>`).join("")}
      </div>

      ${scenarioEditor(offer, p)}
      ${editorFooter(offer)}
    </div>`
  }

  function scenarioEditor(offer, p) {
    return `
    <section class="grid gap-2.5">
      <div class="flex items-center justify-between gap-3">
        <p class="section-code">Ways to pay</p>
        <button class="btn btn-ghost text-[0.6875rem]" data-action="add-scenario" data-id="${offer.id}">+ Add a way to pay</button>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <button type="button" data-action="add-scenario-preset" data-preset="keep" data-id="${offer.id}"
          class="rounded-[2px] border border-hairline bg-paper px-3 py-2 text-left transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">TYPICAL CHOICE 1 · TAP TO ADD</p>
          <p class="mt-0.5 text-[0.8125rem] font-medium">Keep the rebate, pay the normal rate</p>
        </button>
        <button type="button" data-action="add-scenario-preset" data-preset="zero" data-id="${offer.id}"
          class="rounded-[2px] border border-hairline bg-paper px-3 py-2 text-left transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">TYPICAL CHOICE 2 · TAP TO ADD</p>
          <p class="mt-0.5 text-[0.8125rem] font-medium">Give up the rebate, get 0% / low APR</p>
        </button>
      </div>
      <p class="text-[0.8125rem] text-ink-soft">Tap a choice to add it pre-filled, then fix the APR and months to the dealer's exact offer. The tool shows which one costs less.</p>
      ${offer.rebates[0] ? `<p class="font-mono text-[0.6875rem] tracking-wide text-ink-faint">REBATE ON THE TABLE: <span data-rebate-total="${offer.id}">${fmt0(rebateTotalOf(offer))}</span> — TICK WHICH WAYS KEEP IT</p>` : ""}
      ${offer.scenarios.map((s, si) => `
        <div class="panel grid gap-2 p-3">
          <div class="grid grid-cols-[1fr_2.5rem] items-center gap-2 sm:grid-cols-[1fr_6rem_6rem_6.5rem_2.5rem]">
            <input class="cell cell-text" data-path="${p}.scenarios.${si}.label" data-type="text" value="${esc(s.label)}" placeholder="e.g. 0% APR (no rebate)" />
            <input class="cell hidden sm:block" inputmode="decimal" data-path="${p}.scenarios.${si}.apr" data-type="apr" value="${s.apr}" title="APR %" />
            <input class="cell hidden sm:block" inputmode="numeric" data-path="${p}.scenarios.${si}.termMonths" data-type="int" value="${s.termMonths}" title="Term (months)" />
            <input class="cell hidden sm:block" inputmode="decimal" data-path="${p}.scenarios.${si}.bonusCash" data-type="money" value="${s.bonusCash}" title="Bonus cash" />
            <button class="btn btn-danger !min-h-[36px] !px-2 text-[0.75rem]" data-action="remove-item" data-list="${p}.scenarios" data-index="${si}" aria-label="Remove way to pay">×</button>
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
                keeps the <span data-rebate-text="${r.id}">${fmt0(r.amount)}</span> rebate
              </label>`).join("")}
          </div>` : ""}
        </div>`).join("")}
      <p class="text-[0.6875rem] font-mono tracking-wide text-ink-faint">THE 3 NUMBER BOXES = APR % · MONTHS · BONUS CASH (if the 0% offer includes extra cash)</p>
    </section>`
  }

  // ── Per-way breakdown (quick model: MSRP → discount → rebate → OTD) ──
  function breakdownCard(offer, scenario) {
    const res = scenario ? evaluateScenario(offer, scenario, state.horizon) : evaluateScenario(offer, effectiveScenarios(offer, state.horizon)[0], state.horizon)
    const w = res.waterfall
    const label = scenario ? scenario.label : res.scenarioLabel
    const line = (label2, value, cls) => `<tr class="${cls || ""}"><td class="py-1.5 pr-4 text-ink-soft">${label2}</td><td class="py-1.5 text-right font-mono tabular whitespace-nowrap">${value}</td></tr>`
    const rebateRow = w.rebateTotal > 0
      ? line("Rebate kept in this option", `<span class="text-good">−${fmt(w.rebateTotal)}</span>`)
      : rebateTotalOf(offer) > 0
        ? line(`Rebate <span class="text-ink-faint">(given up in this option)</span>`, `<span class="text-ink-faint">—</span>`)
        : ""
    return `
      <div class="panel panel-strong min-w-0 bg-paper p-4 sm:p-5">
        <div class="mb-3 flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
          <p class="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint">${esc(label).toUpperCase()}</p>
          <p class="font-mono text-[0.6875rem] tracking-widest text-ink-faint">OTD <span class="text-sm font-semibold text-ink">${fmt(w.outTheDoor)}</span></p>
        </div>
        <div class="mb-3 grid grid-cols-2 gap-3 border-b border-hairline pb-3">
          <div>
            <p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">MONTHLY PAYMENT — OUR MATH</p>
            <p class="font-mono text-xl font-semibold tabular">${fmt(res.scheduledPayment)}</p>
            <p class="text-[0.6875rem] text-ink-faint">${res.apr}% APR · ${res.termMonths} months</p>
          </div>
          <div class="text-right">
            <p class="font-mono text-[0.625rem] tracking-widest text-ink-faint">AMOUNT FINANCED</p>
            <p class="font-mono text-xl font-semibold tabular">${fmt(res.amountFinanced)}</p>
            <p class="text-[0.6875rem] text-ink-faint">after ${fmt0(offer.financing.downPayment)} down</p>
          </div>
        </div>
        <table class="w-full text-[0.8125rem]">
          ${line("Total MSRP (sticker)", fmt(w.msrp))}
          ${w.marketAdjustment ? (w.marketAdjustment > offer.msrp * 0.10
            ? line(`<span class="text-bad">Above sticker — beyond tax &amp; fees</span>`, `<span class="text-bad">+${fmt(w.marketAdjustment)}</span>`)
            : line(`Above sticker <span class="text-ink-faint">(tax &amp; fees usually explain this)</span>`, "+" + fmt(w.marketAdjustment))) : ""}
          ${w.dealerDiscount ? line("Off sticker in this quote", `<span class="text-good">−${fmt(w.dealerDiscount)}</span>`) : ""}
          ${rebateRow}
          ${line("<strong>OUT THE DOOR</strong>", `<strong class="text-base">${fmt(w.outTheDoor)}</strong>`, "border-t-2 border-ink")}
        </table>
        ${includedItemsOf(offer).length ? `
        <p class="mt-3 border-t border-hairline pt-2 text-[0.6875rem] leading-relaxed text-ink-faint">
          INCLUDED AT NO CHARGE: ${esc(includedNamesOf(offer))} — <span class="text-good">≈ ${fmt0(includedValueOf(offer))} of value</span> on top of this price. Get every item on a signed We Owe form.
        </p>` : ""}
      </div>`
  }

  function breakdownDetail(offer) {
    const scenarios = offer.scenarios.length ? offer.scenarios : [null]
    const cards = scenarios.map((s) => breakdownCard(offer, s)).join("")
    const notes = []
    notes.push("Your quoted OTD already includes tax, fees, and the rebate — we don't split those out in quick compare; we compare bottom lines.")
    if (offer.scenarios.length) {
      notes.push("The monthly payment is our math, not the dealer's quote: the amount financed, amortized at the APR and months you entered. If the dealer quotes a higher payment for the same numbers, something is buried in it — ask why.")
    }
    if (scenarios.length > 1 && rebateTotalOf(offer) > 0) {
      notes.push("The cards differ only in the rebate line: a way that gives the rebate up pays your quote + the rebate. That's the rebate-vs-low-APR trade in dollars, before financing even starts.")
    }
    return `
    <details class="border-t border-hairline">
      <summary class="cursor-pointer px-4 py-3 font-mono text-[0.6875rem] tracking-[0.14em] text-ink-faint hover:text-ink sm:px-5">SHOW THE BREAKDOWN${scenarios.length > 1 ? " — PER WAY TO PAY" : ""}</summary>
      <div class="grid gap-4 px-4 pb-3 sm:px-5 ${scenarios.length > 1 ? "lg:grid-cols-2" : "lg:max-w-xl"}">
        ${cards}
      </div>
      <div class="px-4 pb-5 sm:px-5">
        <ul class="grid gap-1.5 text-[0.75rem] leading-relaxed text-ink-faint ${scenarios.length > 1 ? "" : "lg:max-w-xl"}">
          ${notes.map((n) => `<li class="flex gap-2"><span class="select-none">·</span><span>${n}</span></li>`).join("")}
        </ul>
      </div>
    </details>`
  }

  // ── Derived sections ──────────────────────────────────────────
  // Drafts are invisible here: only SAVED offers rank, chart, or checklist
  const savedOffers = () => state.offers.filter((o) => !o.draft)

  function renderDerived() {
    const results = compareAll(savedOffers(), state.horizon)
    const has = results.length > 0

    $("#comparison-section").classList.toggle("hidden", results.length < 2)
    $("#chart-section").classList.toggle("hidden", !chartFocusOffer())
    $("#score-section").classList.toggle("hidden", !has)
    $("#checklist-section").classList.toggle("hidden", !has)

    if (results.length >= 2) renderComparison(results)
    renderDealerVerdict(results)
    renderChart()
    if (has) { renderScores(); renderChecklist() }
  }

  function renderScores() {
    $("#scores").innerHTML = savedOffers().map((offer) => {
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
        <p class="mt-3 text-[0.6875rem] leading-relaxed text-ink-faint">Honest scale: 8 is genuinely good, most buyers land 5–6. Graded on the quote itself — the dealer-vs-dealer winner is above.</p>
      </div>`
    }).join("")
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
        ${(() => {
          const ratios = results.map((r) => { const o = state.offers.find((x) => x.id === r.offerId); return o && o.msrp > 0 ? (r.totalCost - includedValueOf(o)) / o.msrp : null })
          if (ratios.some((x) => x == null)) return ""
          const minR = Math.min.apply(null, ratios)
          return `<tr><td>Deal quality — total cost as % of its sticker</td>${results.map((r, ri) => `<td class="${ratios[ri] === minR && results.length > 1 ? "win" : ""}">${(ratios[ri] * 100).toFixed(1)}%</td>`).join("")}</tr>`
        })()}
        <tr><td>Out the door</td>${results.map((r) => `<td>${fmt(r.waterfall.outTheDoor)}</td>`).join("")}</tr>
        <tr><td>Rebate kept in this path</td>${results.map((r) => `<td>${r.rebateTotal ? "−" + fmt(r.rebateTotal) : "—"}</td>`).join("")}</tr>
        ${(() => {
          const byOffer = new Map(state.offers.map((o) => [o.id, includedValueOf(o)]))
          const values = results.map((r) => byOffer.get(r.offerId) || 0)
          if (!values.some((v) => v > 0)) return ""
          const maxV = Math.max.apply(null, values)
          const varies = values.some((v) => v !== maxV)
          return `<tr><td>Extras included (value — higher is better)</td>${results.map((r, ri) => `<td class="${values[ri] > 0 && values[ri] === maxV && varies ? "win" : ""}">${values[ri] ? fmt0(values[ri]) : "—"}</td>`).join("")}</tr>`
        })()}
        <tr><td>Amount financed</td>${results.map((r) => `<td>${fmt(r.amountFinanced)}</td>`).join("")}</tr>
        <tr><td>APR / term</td>${results.map((r) => `<td>${r.apr}% · ${r.termMonths} mo</td>`).join("")}</tr>
        <tr><td>Monthly payment</td>${results.map((r) => `<td>${fmt(r.scheduledPayment)}</td>`).join("")}</tr>
        <tr><td>Interest paid by month ${state.horizon}</td>${results.map((r) => `<td>${fmt(r.interestPaid)}</td>`).join("")}</tr>
        <tr><td>Balance cleared at month ${state.horizon}</td>${results.map((r) => `<td>${r.balanceAtHorizon ? fmt(r.balanceAtHorizon) : "—"}</td>`).join("")}</tr>
      </tbody>
    </table>`
  }

  // Which DEALER wins: best row per offer, ranked, value-aware.
  function renderDealerVerdict(results) {
    const host = $("#dealer-verdict")
    if (!host) return
    const bestPerOffer = new Map()
    for (const r of results) {
      if (!bestPerOffer.has(r.offerId)) bestPerOffer.set(r.offerId, r)
    }
    const offerOf = (r) => state.offers.find((o) => o.id === r.offerId)
    const netRatio = (r) => { const o = offerOf(r); return o && o.msrp > 0 ? (r.totalCost - includedValueOf(o)) / o.msrp : Infinity }

    // Same vehicle (MSRPs within 2%): rank by dollars. Different vehicles:
    // rank by deal quality — total cost as % of each vehicle's own sticker.
    const allBests = Array.from(bestPerOffer.values())
    const msrps = allBests.map((r) => (offerOf(r) || {}).msrp || 0).filter((m) => m > 0)
    const sameVehicle = msrps.length < 2 || (Math.max.apply(null, msrps) - Math.min.apply(null, msrps)) / Math.min.apply(null, msrps) <= 0.02

    if (!sameVehicle) {
      const ranked = allBests.sort((a, b) => netRatio(a) - netRatio(b))
      if (ranked.length < 2) { host.innerHTML = ""; return }
      const w = ranked[0], r = ranked[1]
      const wr = netRatio(w) * 100, rr = netRatio(r) * 100
      if (Math.abs(wr - rr) < 0.5) {
        host.innerHTML = `
          <div class="verdict verdict-close p-5">
            <p class="font-mono text-[0.625rem] tracking-[0.14em] text-warn">DIFFERENT VEHICLES — DEALS ARE EQUALLY GOOD</p>
            <p class="mt-2 text-[1.0625rem] font-semibold leading-relaxed">${esc(w.offerLabel)} and ${esc(r.offerLabel)} are equally good deals for their money (${wr.toFixed(1)}% vs ${rr.toFixed(1)}% of each sticker, extras counted). Pick the vehicle you actually want.</p>
          </div>`
        return
      }
      host.innerHTML = `
        <div class="verdict p-5">
          <p class="font-mono text-[0.625rem] tracking-[0.14em] text-good">BEST DEAL FOR THE MONEY — DIFFERENT VEHICLES</p>
          <p class="mt-2 text-[1.0625rem] font-semibold leading-relaxed">${esc(w.offerLabel)} is the better deal for its money — total cost lands at ${wr.toFixed(1)}% of its sticker vs ${rr.toFixed(1)}% for ${esc(r.offerLabel)}, extras counted. Which vehicle you'd rather own is your call — we grade the deals, not the vehicles.</p>
          <p class="mt-2 font-mono text-[0.75rem] text-ink-soft">${esc(w.offerLabel).toUpperCase()} TOTAL ${fmt0(w.totalCost)} · ${esc(r.offerLabel).toUpperCase()} TOTAL ${fmt0(r.totalCost)}</p>
        </div>`
      return
    }

    const bests = allBests.sort((a, b) => a.totalCost - b.totalCost)
    if (bests.length < 2) { host.innerHTML = ""; return }
    const winner = bests[0], runnerUp = bests[1]
    const gap = Math.round(runnerUp.totalCost - winner.totalCost)

    const winnerOffer = state.offers.find((o) => o.id === winner.offerId)
    const runnerOffer = state.offers.find((o) => o.id === runnerUp.offerId)
    const wVal = winnerOffer ? includedValueOf(winnerOffer) : 0
    const rVal = runnerOffer ? includedValueOf(runnerOffer) : 0
    const effAdv = gap + wVal - rVal
    const extrasStrip = (wVal || rVal)
      ? `<p class="mt-2 font-mono text-[0.75rem] text-ink-soft">EXTRAS INCLUDED · ${esc(winner.offerLabel).toUpperCase()} ${fmt0(wVal)} · ${esc(runnerUp.offerLabel).toUpperCase()} ${fmt0(rVal)}</p>`
      : ""

    if (gap < 200) {
      if (Math.abs(wVal - rVal) >= 100) {
        const valWinner = wVal > rVal ? winner : runnerUp
        const valOffer = wVal > rVal ? winnerOffer : runnerOffer
        const valDiff = Math.abs(wVal - rVal)
        host.innerHTML = `
          <div class="verdict p-5">
            <p class="font-mono text-[0.625rem] tracking-[0.14em] text-good">BEST DEAL — SAME MONEY, MORE EQUIPMENT</p>
            <p class="mt-2 text-[1.0625rem] font-semibold leading-relaxed">${esc(valWinner.offerLabel)} and the other offer land within ${fmt0(gap)} on price — but ${esc(valWinner.offerLabel)} includes ${fmt0(valDiff)} more in extras${valOffer && includedNamesOf(valOffer) ? " (" + esc(includedNamesOf(valOffer)) + ")" : ""}. Same money, more vehicle — take the better-equipped one.</p>
            ${extrasStrip}
          </div>`
        return
      }
      host.innerHTML = `
        <div class="verdict verdict-close p-5">
          <p class="font-mono text-[0.625rem] tracking-[0.14em] text-warn">DEALER VS DEALER — TOO CLOSE TO CALL</p>
          <p class="mt-2 text-[1.0625rem] font-semibold leading-relaxed">${esc(winner.offerLabel)} and ${esc(runnerUp.offerLabel)} land within ${fmt0(gap)} of each other by your payoff date. Pick on the non-money stuff: which dealer puts it in writing, has the actual unit, and doesn't play games at the desk.</p>
          ${extrasStrip}
        </div>`
      return
    }

    let valueSentence = ""
    if (wVal || rVal) {
      if (effAdv >= 200) {
        valueSentence = ` Counting the extras, ${esc(winner.offerLabel)} stays about ${fmt0(effAdv)} ahead.`
      } else if (effAdv > -200) {
        valueSentence = ` But counting ${esc(runnerUp.offerLabel)}'s ${fmt0(rVal)} in included extras, it's effectively even — decide on the non-money stuff.`
      } else {
        valueSentence = ` But ${esc(runnerUp.offerLabel)} includes ${fmt0(rVal)} of extras${runnerOffer && includedNamesOf(runnerOffer) ? " (" + esc(includedNamesOf(runnerOffer)) + ")" : ""} — counting them, it's effectively about ${fmt0(-effAdv)} ahead. Same class of money, more vehicle.`
      }
    }
    host.innerHTML = `
      <div class="verdict p-5">
        <p class="font-mono text-[0.625rem] tracking-[0.14em] text-good">BEST DEAL</p>
        <p class="mt-2 text-[1.0625rem] font-semibold leading-relaxed">${esc(winner.offerLabel)} wins — ${fmt0(gap)} less than ${esc(runnerUp.offerLabel)} by your payoff date, paying via &ldquo;${esc(winner.scenarioLabel)}&rdquo;.${valueSentence}</p>
        <p class="mt-2 font-mono text-[0.75rem] text-ink-soft">${esc(winner.offerLabel).toUpperCase()} TOTAL ${fmt0(winner.totalCost)} · ${esc(runnerUp.offerLabel).toUpperCase()} TOTAL ${fmt0(runnerUp.totalCost)}</p>
      </div>`
  }

  function chartFocusOffer() {
    const eligible = savedOffers()
    if (!eligible.length) return null
    return eligible.find((o) => o.id === state.chartOfferId) || eligible[0]
  }

  function renderChart() {
    const offer = chartFocusOffer()
    if (!offer) return
    const eligible = savedOffers()

    const wayTag = (o) => o.scenarios.length === 0 ? "CASH BASIS" : o.scenarios.length === 1 ? "1 WAY" : o.scenarios.length + " WAYS"
    const picker = eligible.length > 1 ? `
      <div class="mb-5">
        <p class="section-code mb-2">Chart shows</p>
        <div class="grid gap-2 sm:flex sm:flex-wrap">
          ${eligible.map((o) => `
            <button class="btn ${o.id === offer.id ? "" : "btn-ghost"} justify-between text-[0.75rem] sm:justify-center" data-action="focus-chart" data-id="${o.id}" aria-pressed="${o.id === offer.id}">
              <span class="truncate">${esc(o.label)}</span>
              <span class="ml-2 shrink-0 font-mono text-[0.625rem] tracking-widest ${o.id === offer.id ? "opacity-60" : "text-ink-faint"}">${wayTag(o)}</span>
            </button>`).join("")}
        </div>
      </div>` : ""

    let verdictHtml
    let be = null
    if (offer.scenarios.length >= 2) {
      const ranked = offer.scenarios
        .map((s) => ({ s, cost: evaluateScenario(offer, s, state.horizon).totalCost }))
        .sort((x, y) => x.cost - y.cost)
      const sA = ranked[0].s, sB = ranked[1].s
      const v = verdict(offer, sA, sB, Math.min(state.horizon, Math.max(sA.termMonths, sB.termMonths)))
      be = breakevenMonth(offer, sA, sB)
      verdictHtml = `
      <div class="verdict ${v.isCloseCall ? "verdict-close" : ""} p-5 sm:p-6">
        <p class="font-mono text-[0.625rem] tracking-[0.14em] ${v.isCloseCall ? "text-warn" : "text-good"}">${v.isCloseCall ? "TOO CLOSE TO CALL ON PRICE ALONE" : "THE VERDICT"}${offer.scenarios.length > 2 ? ` · BEST 2 OF ${offer.scenarios.length} WAYS` : ""}</p>
        <p class="mt-2 text-[1.0625rem] font-semibold leading-relaxed">${esc(v.text)}</p>
        ${v.breakevenMonth ? `<p class="mt-2 font-mono text-[0.75rem] text-ink-soft">ANSWER FLIPS AT MONTH ${v.breakevenMonth} · YOU SAID ${state.horizon} · DIFFERENCE ${fmt0(v.gap)}</p>` : ""}
      </div>`
    } else if (offer.scenarios.length === 1) {
      verdictHtml = `
      <div class="panel border-dashed p-5">
        <p class="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint">ONE WAY TO PAY ENTERED</p>
        <p class="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">The line below is this offer's total cost by payoff month. Add the dealer's other option (the rebate path or the 0% path) and the chart will show exactly where the answer flips.</p>
      </div>`
    } else {
      verdictHtml = `
      <div class="panel border-dashed p-5">
        <p class="font-mono text-[0.625rem] tracking-[0.14em] text-ink-faint">NO WAYS TO PAY ENTERED — CASH BASIS</p>
        <p class="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">The flat line below is this offer's out-the-door cost with the rebate applied and zero interest — what it costs if you pay in full. It still ranks in the comparison on that basis. Tap the typical choices in the offer's editor for the real picture.</p>
      </div>`
    }

    $("#verdict").innerHTML = picker + verdictHtml

    const curves = effectiveScenarios(offer, state.horizon).map((s) => ({ label: s.label, points: costCurve(offer, s) }))
    $("#chart").innerHTML = crossoverChart(curves, state.horizon, be)
  }

  function renderChecklist() {
    $("#print-checklist").innerHTML = savedOffers().map((offer) => {
      const { flags, best } = offerComputed(offer)
      const sections = generateChecklist(
        Object.assign({}, offer, { otdForChecklist: best ? best.waterfall.outTheDoor : null }),
        flags,
        { payoffHorizonMonths: state.horizon }
      )
      const allItems = sections.flatMap((s) => s.items)
      const doneCount = allItems.filter((item) => state.checklistDone[offer.id + "|" + item.text]).length
      return `
      <div class="panel p-5">
        <div class="flex items-baseline justify-between gap-4">
          <p class="font-mono text-[0.6875rem] tracking-[0.14em] text-ink-faint">${esc(offer.label).toUpperCase()}</p>
          <p class="font-mono text-[0.6875rem] tabular ${doneCount === allItems.length ? "text-good" : "text-ink-faint"}">${doneCount} / ${allItems.length} DONE</p>
        </div>
        ${sections.map((s) => `
          <h3 class="mt-4 border-b border-hairline pb-1.5 text-[0.9375rem] font-extrabold tracking-tight">${esc(s.title)}</h3>
          <ul class="mt-2 grid gap-2">
            ${s.items.map((item) => {
              const key = offer.id + "|" + item.text
              const done = !!state.checklistDone[key]
              return `
              <li class="flex items-start gap-2.5 text-[0.875rem] leading-relaxed ${item.critical ? "font-semibold" : "text-ink-soft"}">
                <button type="button" class="check-btn ${done ? "checked" : ""}" data-action="toggle-check" data-key="${esc(key)}" role="checkbox" aria-checked="${done}" aria-label="Mark done">✓</button>
                <span class="${done ? "check-done-text" : ""}">${item.critical ? `<span class="font-mono text-[0.625rem] tracking-widest text-bad">CRITICAL · </span>` : ""}${esc(item.text)}</span>
              </li>`
            }).join("")}
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
