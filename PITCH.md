# First-client pitch kit

Everything you need to send `https://thevinylplugsug.vercel.app` to a roster artist or an
independent Kampala act — and to run the demo without a hitch.

---

## 1. Before you send the link (5 minutes)

- [ ] `ADMIN_PASSCODE` is no longer `7HADMIN`. Vercel → Project → Settings → Environment Variables,
      then redeploy.
- [ ] One alert channel is live, so an order pings your phone during the demo. The fastest is Slack
      (`SLACK_WEBHOOK_URL`); email via Resend is second. See [DEPLOYMENT.md § Notifications](./DEPLOYMENT.md#notifications).
      Until then the console honestly says *alerts are simulated* — fine for a walkthrough, not for
      a live order.
- [ ] `/admin` → reset demo data, so the pitch starts from the two seeded pressings rather than a
      pile of test orders.
- [ ] Open the link once on **your own phone** first. WhatsApp caches previews; if an old one sticks,
      it clears on its own within a day (or re-scrape it in Slack's app settings).
- [ ] Have the quote for their likely run ready — most Kampala independents start at 250 × 12" Colored
      with a gatefold: **$3,712.50**, deposit **$1,856.25** (≈ UGX 6.96m at 3,750).

---

## 2. The WhatsApp message (paste and send)

> **Short version — for an artist you already talk to**
>
> Yo [Name] — built something for the vinyl side of your release. It prices a real pressing in 30
> seconds: pick the run, the colour, the sleeve, and it shows the actual factory cost plus our 25%
> cut. No "contact us for pricing".
>
> https://thevinylplugsug.vercel.app
>
> Have a look and tell me what run size you're thinking. If the numbers work I can hold a plant slot.
> WhatsApp me on +256 768 261 003, or the desk inbox is 7hmusicgroupug@gmail.com.

> **First-contact version — for a label or an act you haven't worked with**
>
> Hi [Name] — 7H Music Group here, we broker vinyl pressing out of Kampala (Mobineko in Japan, Green
> Lakes in the US).
>
> We put our pricing on a public calculator instead of a PDF: quantity, colour, sleeve — the true
> landed factory cost, our flat 25%, and the 50% deposit, in USD and UGX.
>
> https://thevinylplugsug.vercel.app
>
> A 250-run gatefold lands around $3.7k turnkey. Freight to Kampala and customs are inside that
> number. Happy to walk you through it on a call — the whole quote takes two minutes.

---

## 3. The 5-minute demo script

Run it on **your phone**, screen-shared or in person. The client watches a real order appear in the
console — that is the part that closes.

1. **Landing (30 s).** Scroll past the hero. Let them read `25% all-in · no hidden costs` and
   `50% deposit`. Say: *"That's the whole commercial model, on the page."*
2. **Configurator (90 s).** Set their actual run: 250 units → 12" Colored → Gatefold. Point at the
   line items: pressing, sleeve upgrade, plates & test press, then the fee. Say: *"Nothing appears at
   checkout that isn't on this screen."* Tap 100 units, then 500, and show the per-unit price move —
   volume discounts come from the plant, not from us.
3. **Order portal (90 s).** `/order`. Fill it with **their** name and email. Drop a WAV and a PDF
   in the two zones. Say: *"4 MB direct, or paste a WeTransfer link for full masters — we don't ask
   you to email files."*
4. **Checkout (45 s).** Pick MTN MoMo. Tick the deposit terms: *"Production initialises on 50% deposit
   and proof approval."* Submit.
5. **The close (60 s).** The success screen shows the order ID. Now open `/admin` on your laptop —
   the order is already there, with the files and the money. Say: *"That's what lands on my desk the
   second you press send. From here I forward the spec sheet to the plant."* Press **Forward** so they
   see the payload that goes to Mobineko.

**What not to oversell:** the payment rails are simulated. Say it plainly — *"MoMo and Airtel are
integrated next; today the deposit is confirmed manually and you get a receipt the same day."*
A broker who is straight about the roadmap is more credible than one who isn't.

---

## 4. The three questions you will get

| They ask | Answer |
| --- | --- |
| "Why is it 25%?" | It's flat, on landed factory cost, and it covers mastering review, CMYK pre-flight, plant negotiation, proof handling, freight and customs. Cheaper than a label's 50% recoup, and there is no per-unit rake. |
| "What if the pressing is bad?" | Nothing presses without written proof approval. If the plant deviates from the approved proof, they re-press at their cost. |
| "How long, realistically?" | 7–11 weeks after proof approval, plus 2–3 weeks if it's colour or gatefold and test pressings are needed. Quoted per format on the site. |

---

## 5. After the demo

- Send the order ID screenshot plus the share card (`public/og-image.png`) so the thread keeps the
  quote in front of them. In `/admin`, **Alert on WhatsApp** opens a prefilled brief you can forward
  to management in one tap — no Cloud API needed.
- Delete the demo order in `/admin` → reset demo data once they've seen it.
- If they hesitate on price, re-run the configurator at 100 units — a $1.8k-ish entry point moves more
  first releases than a discount does.

---

## 6. Where the share card comes from

`public/og-image.png` (1200×630) is what WhatsApp, Slack, X and iMessage show for the link. Copy lives
in `scripts/build-og-image.sh`; regenerate with `npm run og-image` after any headline change, and
update the `og:image` URL in `index.html` if the domain changes.
