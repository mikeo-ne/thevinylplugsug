/**
 * The plant desk — what each plant actually asks for, and what it will cost.
 *
 * Six plants, six different intake processes. Mobineko wants a point-and-click
 * order form with a catalogue number; GZ Media wants files on their FTP, in a
 * folder named by catalogue number, with a tracklist of times and a checksum for
 * every file; Green Lakes wants a web form with weight, colour, sleeve and an
 * express/regular choice, plus proof of mechanical licensing; Deepgrooves wants
 * their calculator composed and an invoice address; Seabass wants a configurator
 * quote or an email; Dr. Dub's shop takes a dubplate order at checkout.
 *
 * Retyping the same spec into six sites is where the week goes, and it is also
 * where a number gets transposed. So each plant gets a *profile* describing its
 * intake, and each order gets a *sheet* generated from data the portal already
 * holds. The desk fills gaps once; nothing is typed twice.
 *
 * The second job of this module is the money. A quote is only safe if the plant's
 * real invoice plus freight and duties still sits under what the client paid. When
 * the desk records the plant's actual quote, `marginCheck()` says whether the
 * order is still profitable — and the console refuses to forward a loss-making
 * order to a plant without an explicit acknowledgement.
 *
 * Sources for every claim are recorded with the profile and dated, because plant
 * minimums and lead times move, and a stale minimum is how a quote becomes a loss.
 */

import { findPlant } from './pricing.js';

/** Everything below was read from the plants' own pages on 2026-11-01. */
const CHECKED_AT = '2026-11-01';

/**
 * A field on a plant's sheet.
 *
 * `value(order, ctx)` returns the string to print, or `null`/'' when the portal
 * does not hold it — which becomes a visible gap rather than a silent blank.
 */
const field = (key, label, value, options = {}) => ({ key, label, value, ...options });

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

/** 12" and 7" weights are plant-specific defaults when the client did not pick one. */
const weightFor = (order) => {
  const format = String(order?.configuration?.vinylTypeId ?? '');
  if (format === 'seven_single') return '7" standard (per plant default)';
  if (format === 'lp_colored') return '140 g colour';
  return '140 g black';
};

const sleeveFor = (order) => {
  const sleeve = order?.quote?.sleeve?.name ?? order?.configuration?.sleeveId ?? '';
  if (/gatefold/i.test(String(order?.configuration?.sleeveId ?? ''))) return 'Gatefold';
  if (/inner/i.test(String(order?.configuration?.sleeveId ?? ''))) return 'Standard jacket + printed inner';
  return sleeve ? `${sleeve}` : 'Standard jacket';
};

const formatFor = (order) =>
  order?.quote?.vinylType?.name ?? String(order?.configuration?.vinylTypeId ?? '');

const audioFiles = (order) => order?.files?.audio ?? [];
const artworkFiles = (order) => order?.files?.artwork ?? [];

const tracklist = (order) => order?.release?.tracklist ?? order?.tracklist ?? null;

/**
 * The catalogue number handed to the plant.
 *
 * Every plant that asks for one wants a short, unique, stable code — and the
 * order reference already is one. It is also what the client sees on their
 * invoice, so a plant quoting "GZ-7H-2026-8K2Q" and a client reading
 * "7H-2026-8K2Q" are talking about the same record.
 */
const catalogNumber = (order) => order?.id ?? null;

/* ------------------------------------------------------------------ *
 * Profiles
 * ------------------------------------------------------------------ */

export const PLANT_PROFILES = {
  mobineko: {
    id: 'mobineko',
    channel: 'Online configurator',
    portal: 'mobineko.com/order',
    quoteMode: 'Instant — the configurator prices the run before you commit.',
    fileDelivery: 'Upload in the order form, or paste a cloud link.',
    minimum: 25,
    minimumNote: 'Short-run specialist: 25 is their floor, 50+ is their usual minimum.',
    fields: [
      field('catalogNumber', 'Catalogue number (locked on their order)', catalogNumber),
      field('format', 'Format', formatFor),
      field('quantity', 'Quantity', (order) => String(order?.configuration?.quantity ?? '')),
      field('weight', 'Weight', weightFor),
      field('sleeve', 'Sleeve / packaging', sleeveFor),
      field('cuttingStudio', 'Cutting studio', () => 'Let Mobineko decide', {
        assumed: true,
        note: 'Their default; change only if a specific studio is requested.',
      }),
      field('audioSource', 'Audio source', (order) =>
        audioFiles(order).length
          ? `${audioFiles(order).length} uploaded master file(s) — links below`
          : order?.files?.audioLink ?? null,
      ),
      field('artworkSource', 'Artwork source', (order) =>
        artworkFiles(order).length
          ? `${artworkFiles(order).length} uploaded artwork file(s) — links below`
          : order?.files?.artworkLink ?? null,
      ),
      field('shipName', 'Delivery · name', (order) => order?.client?.recipientName ?? order?.client?.name ?? null),
      field('shipCompany', 'Delivery · company', () => '7H Music Group', { assumed: true }),
      field('shipAddress', 'Delivery · address', (order) => order?.client?.deliveryAddress ?? null),
      field('shipCity', 'Delivery · city', (order) => order?.client?.deliveryCity ?? null),
      field('shipPostcode', 'Delivery · postcode', (order) => order?.client?.deliveryPostalCode ?? null),
      field('shipCountry', 'Delivery · country', (order) => order?.client?.country ?? null),
      field('shipPhone', 'Delivery · phone', (order) => order?.client?.phone ?? null),
      field('shipNotes', 'Notes for the delivery company', (order) => order?.client?.notes || 'None'),
      field('vat', 'VAT / tax number', (_order, ctx) => ctx?.tin ?? null, {
        note: 'Their form requires one for tax-inclusive destinations.',
      }),
    ],
    warnings: [
      'Duties are payable on arrival (DDU) and are not in their quote — carry them in the freight figure.',
    ],
    sources: [{ label: 'Mobineko order form', url: 'https://mobineko.com/order', checked: CHECKED_AT }],
  },

  greenlakes: {
    id: 'greenlakes',
    channel: 'Web form',
    portal: 'greenlakespressing.com/order',
    quoteMode: 'Form submission — they reply with a quote within 24 hours.',
    fileDelivery: 'After the quote: audio and artwork by link or upload.',
    minimum: 100,
    minimumNote: 'Published minimum is 100 records.',
    fields: [
      field('format', 'Format', (order) =>
        String(order?.configuration?.vinylTypeId ?? '') === 'seven_single' ? '7" EP' : '12" EP / LP',
      ),
      field('quantity', 'Quantity', (order) => String(order?.configuration?.quantity ?? '')),
      field('weight', '12" record weight', weightFor),
      field('colour', 'Vinyl colour', (order) =>
        String(order?.configuration?.vinylTypeId ?? '') === 'lp_colored' ? 'Colour' : 'Black',
      ),
      field('cover', 'Cover artwork', (order) => (/gatefold/i.test(sleeveFor(order)) ? 'Gatefold' : 'Standard')),
      field('innerSleeves', 'Inner sleeves', () => 'White poly-lined (their standard)', { assumed: true }),
      field('shrinkwrap', 'Shrinkwrap', () => 'Yes', { assumed: true }),
      field('deliveryTime', 'Delivery time', () => 'Regular (8 weeks)', { assumed: true }),
      field('contactName', 'Full name', (order) => order?.client?.name ?? null),
      field('contactEmail', 'Email', (order) => order?.client?.email ?? null),
      field('licence', 'Mechanical licence / IP rights form', () => null, {
        blockers: true,
        note: 'They require proof of licensing before manufacturing. Collect it before paying them.',
      }),
      field('audioSpec', 'Audio spec', (order) =>
        audioFiles(order).length
          ? `Uploaded masters — confirm 24-bit/WAV or AIFF at 44.1 kHz or higher`
          : order?.files?.audioLink ?? null,
      ),
    ],
    warnings: ['They will not press without a mechanical licence or a completed IP rights form.'],
    sources: [
      { label: 'Green Lakes order form', url: 'https://greenlakespressing.com/order/', checked: CHECKED_AT },
      { label: 'Green Lakes FAQ', url: 'https://greenlakespressing.com/resources/faq/', checked: CHECKED_AT },
    ],
  },

  seabass: {
    id: 'seabass',
    channel: 'Configurator or email',
    portal: 'seabassvinyl.com',
    quoteMode: 'Custom configurator for a quote; splits and unusual specs go by email.',
    fileDelivery: 'Mastered file + finalised artwork; 8 weeks runs from receipt of both.',
    minimum: 100,
    minimumNote: 'Their FAQ states a minimum order size of 100 units.',
    fields: [
      field('quantity', 'Quantity', (order) => String(order?.configuration?.quantity ?? '')),
      field('format', 'Format', formatFor),
      field('weight', 'Weight', (order) =>
        /colour/i.test(formatFor(order)) ? '140 g colour' : '140 g black',
      ),
      field('colour', 'Colour / effect', (order) =>
        String(order?.configuration?.vinylTypeId ?? '') === 'lp_colored' ? 'Colour (per configurator)' : 'Black',
      ),
      field('artwork', 'Artwork', (order) =>
        artworkFiles(order).length || order?.files?.artworkLink ? 'Supplied — see links' : null,
      ),
      field('splitNote', 'Split order', () => 'No split — single format, single colour', {
        assumed: true,
        note: 'Splits need a shared stamper; 140 g and 180 g are separate orders.',
      }),
      field('contactEmail', 'Orders email', (order) => order?.client?.email ?? null),
    ],
    warnings: ['Lead time starts when they have both the mastered audio and finalised artwork.'],
    sources: [
      { label: 'Seabass FAQ', url: 'https://seabassvinyl.com/faq/', checked: CHECKED_AT },
      { label: 'Seabass contact', url: 'https://seabassvinyl.com/contact/', checked: CHECKED_AT },
    ],
  },

  gzmedia: {
    id: 'gzmedia',
    channel: 'FTP upload + your GZ contact',
    portal: 'gzmedia.com',
    quoteMode: 'Quoted by your GZ contact person; minimum 300 vinyl units.',
    fileDelivery: 'FTP: one folder per title named by catalogue number, with separate master/ and artwork/ folders.',
    minimum: 300,
    minimumNote: 'GZ FAQ: minimum 300 pcs for vinyl records.',
    fields: [
      field('catalogNumber', 'FTP folder name (catalogue number)', catalogNumber, {
        note: 'Their instruction: name the folder by the title catalogue number.',
      }),
      field('quantity', 'Quantity', (order) => String(order?.configuration?.quantity ?? '')),
      field('format', 'Format', formatFor),
      field('weight', 'Weight', () => '140 g standard (test press is 180 g)', { assumed: true }),
      field('sleeve', 'Sleeve / print', sleeveFor),
      field('artworkPdf', 'Artwork', (order) =>
        artworkFiles(order).length
          ? 'Supplied — one PDF per print component (see files). Rename per component before FTP upload.'
          : order?.files?.artworkLink ?? null,
      ),
      field('masterArchive', 'Master packaging', () => null, {
        blockers: true,
        note: 'They require the master in an archive (ZIP/RAR/7Z). We store raw WAV — zip it at upload time.',
      }),
      field('tracklist', 'Tracklist with individual track times', (order) => tracklist(order), {
        blockers: true,
        note: 'Their studio checks sides against the times. The portal does not collect this yet — add it to the order.',
      }),
      field('controlCodes', 'Control codes per file', (order) => {
        const files = [...audioFiles(order), ...artworkFiles(order)];
        const withHash = files.filter((file) => file.sha256);
        return withHash.length
          ? `${withHash.length}/${files.length} files carry a SHA-256 (they accept MD5/CRC32/SHA1 — convert)`
          : null;
      }, { blockers: false }),
      field('testPress', 'Test press', () => 'Yes — standard for vinyl', { assumed: true }),
    ],
    warnings: [
      'FTP credentials come from your GZ contact person — request them before the first upload.',
      'Convert our SHA-256 records to MD5 or CRC32 if their studio asks for those specifically.',
    ],
    sources: [
      { label: 'GZ FAQ', url: 'http://www.gzmedia.com/en-GB/Ordering/FAQ.aspx', checked: CHECKED_AT },
      { label: 'GZ FTP instructions', url: 'http://www.gzmedia.com/en-GB/Ordering/The-order-process/FTP.aspx', checked: CHECKED_AT },
    ],
  },

  deepgrooves: {
    id: 'deepgrooves',
    channel: 'Online calculator + email',
    portal: 'deepgrooves.eu/order/calculator',
    quoteMode: 'Compose the order in their calculator, then they confirm.',
    fileDelivery: 'Mastered WAV files; vinyl mastering is included.',
    minimum: 200,
    minimumNote: 'Their site states a minimum order of 200 records.',
    fields: [
      field('format', 'Size / format', (order) =>
        String(order?.configuration?.vinylTypeId ?? '') === 'seven_single' ? '7"' : '12"',
      ),
      field('rpm', 'Speed', () => '33 RPM', { assumed: true }),
      field('quantity', 'Quantity', (order) => String(order?.configuration?.quantity ?? '')),
      field('weight', 'Weight', weightFor),
      field('colour', 'Vinyl colour', (order) =>
        String(order?.configuration?.vinylTypeId ?? '') === 'lp_colored' ? 'Colour' : 'Black',
      ),
      field('centreLabel', 'Centre label', () => 'Full colour, supplied artwork', { assumed: false }),
      field('innerSleeve', 'Inner sleeve', () => 'Black or white poly-lined', { assumed: true }),
      field('audio', 'Audio', (order) =>
        audioFiles(order).length ? 'Mastered WAV supplied — see links' : order?.files?.audioLink ?? null,
      ),
      field('invoiceDetails', 'Invoice and address details', (order) =>
        order?.client?.name
          ? `${order.client.name} · ${order.client.deliveryAddress ?? ''} ${order.client.deliveryCity ?? ''} ${order.client.country ?? ''}`.trim()
          : null,
      ),
      field('vat', 'VAT number', (_order, ctx) => ctx?.tin ?? null),
    ],
    warnings: ['Turnaround has been quoted at 12–16 weeks recently — confirm before promising a date.'],
    sources: [
      { label: 'Deepgrooves', url: 'https://deepgrooves.eu/', checked: CHECKED_AT },
      { label: 'Deepgrooves calculator', url: 'https://deepgrooves.eu/order/calculator/', checked: CHECKED_AT },
    ],
  },

  drdub: {
    id: 'drdub',
    channel: 'Online shop checkout',
    portal: 'drdub.com',
    quoteMode: 'Fixed prices in the shop; basic vinyl mastering included.',
    fileDelivery: 'Upload at checkout, or post the medium (they will digitise it).',
    minimum: 1,
    minimumNote: 'Lathe cut, one at a time — 10 work days, or 1–2 days with Prime service.',
    fields: [
      field('size', 'Size', (order) =>
        String(order?.configuration?.vinylTypeId ?? '') === 'seven_single' ? '7"' : '10" / 12" (per their shop)',
      ),
      field('rpm', 'Speed', () => '45 RPM', { assumed: true }),
      field('sides', 'Sides', () => 'Two-sided', { assumed: true }),
      field('colour', 'Vinyl colour', () => 'Black', { assumed: true, note: 'Shop lists black or transparent.' }),
      field('labels', 'Labels', () => 'Printed (artwork supplied)', { assumed: true }),
      field('cover', 'Cover', (order) => (/gatefold/i.test(sleeveFor(order)) ? 'Printed sleeve' : 'Printed sleeve'), {
        assumed: true,
      }),
      field('quantity', 'Quantity', (order) => String(order?.configuration?.quantity ?? '')),
      field('trackOrder', 'Track order', (order) => (tracklist(order) ? 'Provided' : null), {
        blockers: true,
        note: 'Cuts are made in the order the files are uploaded — confirm the running order.',
      }),
      field('orderNumber', 'Order reference for the package', catalogNumber),
    ],
    warnings: ['Lead time starts once they have the order, the tracks and the payment.'],
    sources: [{ label: 'Dr. Dub FAQ', url: 'https://drdub.com/en/faq/', checked: CHECKED_AT }],
  },
};

export const plantProfile = (plantId) => PLANT_PROFILES[plantId] ?? null;

/* ------------------------------------------------------------------ *
 * The order sheet
 * ------------------------------------------------------------------ */

const money = (value) =>
  Number.isFinite(Number(value))
    ? `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

/**
 * Build the sheet the desk fills in (or pastes into) a plant's intake form.
 *
 * `fields` keeps the plant's own order, so the sheet reads like their form and
 * the desk fills it top to bottom. `missing` collects the blockers: the fields
 * that plant insists on and the portal cannot supply. `warnings` are the things
 * that cost money or time if forgotten.
 */
export function buildPlantSheet(order, plantId, options = {}) {
  const profile = plantProfile(plantId);
  if (!profile) return null;

  const ctx = { tin: options.tin ?? null };
  const quantity = num(order?.configuration?.quantity) ?? 0;
  const fields = profile.fields.map((entry) => {
    const raw = typeof entry.value === 'function' ? entry.value(order, ctx) : entry.value;
    const value = raw === null || raw === undefined || String(raw).trim() === '' ? null : String(raw);
    return {
      key: entry.key,
      label: entry.label,
      value,
      status: value ? (entry.assumed ? 'assumed' : 'ready') : 'missing',
      blocker: Boolean(entry.blockers),
      note: entry.note ?? null,
    };
  });

  const missing = fields.filter((entry) => entry.status === 'missing');
  const blockers = missing.filter((entry) => entry.blocker);
  const files = [
    ...audioFiles(order).map((file) => ({
      role: 'master',
      name: file.originalName ?? file.name ?? 'master',
      bytes: file.size ?? file.bytes ?? null,
      sha256: file.sha256 ?? null,
      download: file.id ? `/api/files/${file.id}/download` : null,
    })),
    ...artworkFiles(order).map((file) => ({
      role: 'artwork',
      name: file.originalName ?? file.name ?? 'artwork',
      bytes: file.size ?? file.bytes ?? null,
      sha256: file.sha256 ?? null,
      download: file.id ? `/api/files/${file.id}/download` : null,
    })),
  ];
  if (!files.length) {
    if (order?.files?.audioLink) files.push({ role: 'master (link)', name: order.files.audioLink, bytes: null, sha256: null, download: null });
    if (order?.files?.artworkLink) files.push({ role: 'artwork (link)', name: order.files.artworkLink, bytes: null, sha256: null, download: null });
  }

  const warnings = [...(profile.warnings ?? [])];
  if (quantity && quantity < profile.minimum) {
    warnings.unshift(
      `This run is ${quantity} units and ${profile.id} will not take anything under ${profile.minimum}.`,
    );
  }

  const sheet = {
    plant: {
      id: profile.id,
      // The plant this sheet is *for*, which is not always the plant the quote
      // was priced on — the desk compares options before committing.
      name: findPlant(profile.id)?.name ?? order?.quote?.plant?.name ?? profile.id,
      channel: profile.channel,
      portal: profile.portal,
      email: options.email ?? null,
      quoteMode: profile.quoteMode,
      fileDelivery: profile.fileDelivery,
      minimum: profile.minimum,
      minimumNote: profile.minimumNote,
      sources: profile.sources,
    },
    order: {
      reference: order?.id ?? null,
      catalogNumber: catalogNumber(order),
      artist: order?.client?.name ?? null,
      deliveredTo: order?.client
        ? [order.client.deliveryAddress, order.client.deliveryCity, order.client.country].filter(Boolean).join(', ')
        : null,
      quantity,
      format: formatFor(order),
      turnaround: order?.quote?.plant?.leadTime ?? null,
    },
    fields,
    files,
    warnings,
    missing: missing.map((entry) => entry.label),
    blockers: blockers.map((entry) => entry.label),
    ready: blockers.length === 0,
  };

  sheet.text = renderPlantSheetText(sheet);
  return sheet;
}

/** The sheet as plain text — what gets pasted into a form or an email. */
export function renderPlantSheetText(sheet) {
  const lines = [];
  lines.push(`7H MUSIC GROUP — ${sheet.plant.name} order sheet`);
  lines.push(`Intake: ${sheet.plant.channel} · ${sheet.plant.portal}`);
  lines.push(`Order ${sheet.order.reference}${sheet.order.catalogNumber !== sheet.order.reference ? ` · catalogue ${sheet.order.catalogNumber}` : ''}`);
  lines.push('');
  lines.push('SPECIFICATION');
  for (const entry of sheet.fields) {
    if (entry.status === 'missing' && !entry.blocker) continue;
    lines.push(`  ${entry.label}: ${entry.value ?? '— MISSING —'}`);
  }
  if (sheet.files.length) {
    lines.push('');
    lines.push('FILES');
    for (const file of sheet.files) {
      lines.push(`  ${file.role}: ${file.name}${file.bytes ? ` (${(file.bytes / 1024 / 1024).toFixed(1)} MB)` : ''}`);
      if (file.sha256) lines.push(`    sha256 ${file.sha256}`);
      if (file.download) lines.push(`    ${file.download}`);
    }
  }
  if (sheet.blockers.length) {
    lines.push('');
    lines.push('COLLECT BEFORE ORDERING');
    for (const entry of sheet.fields.filter((item) => item.blocker && item.status === 'missing')) {
      lines.push(`  - ${entry.label}${entry.note ? ` — ${entry.note}` : ''}`);
    }
  }
  if (sheet.warnings.length) {
    lines.push('');
    lines.push('WATCH');
    for (const warning of sheet.warnings) lines.push(`  - ${warning}`);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * The money
 * ------------------------------------------------------------------ */

/**
 * Is this order still profitable at the plant's real price?
 *
 * The quote the client paid is `revenue`. The plant's actual invoice plus freight
 * and duties is `cost`. Anything the desk records here is the truth; until it does,
 * the check reports `unverified` rather than pretending the quote was right.
 */
export function marginCheck(order) {
  const revenue = num(order?.quote?.total) ?? 0;
  const record = order?.plantQuote ?? null;
  if (!record || !Number.isFinite(Number(record.costUsd))) {
    return {
      status: 'unverified',
      revenueUsd: revenue,
      costUsd: null,
      freightUsd: null,
      dutiesUsd: null,
      landedCostUsd: null,
      marginUsd: null,
      marginPct: null,
      lossRisk: false,
      detail: 'No plant quote recorded yet — record what the plant actually charges before forwarding.',
    };
  }

  const cost = Number(record.costUsd) || 0;
  const freight = Number(record.freightUsd) || 0;
  const duties = Number(record.dutiesUsd) || 0;
  const landedCost = Math.round((cost + freight + duties + Number.EPSILON) * 100) / 100;
  const margin = Math.round((revenue - landedCost + Number.EPSILON) * 100) / 100;
  const pct = revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : 0;
  const lossRisk = margin < 0;

  return {
    status: lossRisk ? 'loss' : 'safe',
    revenueUsd: revenue,
    costUsd: cost,
    freightUsd: freight,
    dutiesUsd: duties,
    landedCostUsd: landedCost,
    marginUsd: margin,
    marginPct: pct,
    lossRisk,
    acknowledged: Boolean(record.acknowledgedLoss),
    detail: lossRisk
      ? `Landed cost ${money(landedCost)} is above the client's ${money(revenue)} — ${money(
          Math.abs(margin),
        )} out of pocket. Renegotiate, re-quote, or acknowledge the loss in the console.`
      : `Landed cost ${money(landedCost)} against ${money(revenue)} paid — ${money(margin)} (${pct}%).`,
  };
}
