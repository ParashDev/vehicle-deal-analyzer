# Vehicle Deal Analyzer

**Live: [cars-compare.dplooy.com](https://cars-compare.dplooy.com/)**

A free, browser-based tool for anyone buying a car or truck. Enter each dealer's
worksheet and it tells you what every offer *really* costs — normalized to a true
out-the-door number — and which one to take, given how fast you actually plan to
pay the loan off.

This is not a payment calculator. Payment calculators are how they get you.

## What it does

- **Out-the-door waterfall** — every offer broken down line by line: MSRP,
  dealer discount, markup, add-ons, doc fee, correctly computed sales tax, and
  government fees, matched against the dealer's worksheet.
- **Rebate vs 0% APR, solved** — the headline feature. Dealers make you choose
  between keeping the rebates at a normal rate or giving them up for promotional
  financing. The analyzer finds the exact payoff month where the answer flips,
  charts the crossover, and states the verdict in one sentence with the dollar gap.
- **Dealer vs dealer** — add every quote you have; the tool ranks them by total
  money out of your pocket by your payoff date and names the winning dealer.
- **Junk-fee detection** — nitrogen fill, VIN etching, "appearance protection",
  dealer prep, market adjustment, and doc fees over your state's legal cap,
  flagged and ranked by dollar impact.
- **State-aware tax math** — a rules table for all 50 states + DC: whether
  rebates are taxed (they are, in most states), trade-in credits and their caps,
  doc-fee caps, and typical title/registration fees (auto-filled).
- **Deal score** — 1–10 with a visible breakdown, never a bare number.
- **Question checklist** — a printable, personalized list generated from your
  actual numbers: what to get in writing before you go, what to ask at the desk,
  what to refuse in the F&I office.

Everything runs in your browser. Offers save to your device's local storage and
are never uploaded anywhere. Export/import as JSON to move between devices.

## Tech

Plain HTML, CSS, and JavaScript. No framework, no build step, no dependencies —
the repository **is** the deployable site.

```
index.html      SEO landing page
analyzer.html   the app
css/app.css     custom styles (Tailwind CDN handles utilities)
js/lib/         the calculation engine — pure functions, no DOM
js/ui/          the interface layer over it
```

Run it locally by opening `analyzer.html` in a browser. That's it.

## Disclaimer

Independent calculator — not financial, tax, or legal advice. State tax rules
and fee caps change; verify the numbers on your contract before signing.

---

Built by the [Dplooy](https://www.dplooy.com) team · hosted on
[Dplooy](https://www.dplooy.com) · [more free tools](https://www.dplooy.com/utility)
