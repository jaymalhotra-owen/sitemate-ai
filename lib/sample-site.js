// A small, FICTIONAL website bundled with the prototype and served at /sample-site/.
// The "Try the sample site" demo crawls it for real through the same crawler,
// extractor and index as any external site — nothing is pre-indexed.
// "Fernhill Outdoor Co." and everything on these pages is made up.

export const SAMPLE_PREFIX = '/sample-site';
export const SAMPLE_NAME = 'Fernhill Outdoor Co.';
export const SAMPLE_SUGGESTED = [
  'What is your return policy?',
  'Do you ship to Canada?',
  'How warm is the Summit Down Jacket?',
];

const PAGES = {
  '/': {
    title: 'Fernhill Outdoor Co. | Gear built for the long trail',
    description: 'Fernhill Outdoor Co. designs durable backpacks, tents and outerwear in Portland, Oregon. Free shipping over $75 and a lifetime repair program.',
    body: `
<h1>Gear built for the long trail</h1>
<p>Fernhill Outdoor Co. designs durable, repairable backpacks, tents and outerwear for hikers, climbers and weekend campers. Every product is tested on the trails of the Pacific Northwest before it reaches our shelves.</p>
<h2>Why hikers choose Fernhill</h2>
<ul>
<li>Free standard shipping on US orders over $75.</li>
<li>60-day no-hassle returns on unused gear.</li>
<li>A limited lifetime warranty and an in-house <a href="/sample-site/repair-program">repair program</a>.</li>
<li>bluesign®-approved fabrics and recycled nylon across our 2026 line.</li>
</ul>
<h2>Featured gear</h2>
<p><a href="/sample-site/products/trailhead-backpack-40l">Trailhead 40L Backpack</a> — our best-selling multi-day pack, $189.</p>
<p><a href="/sample-site/products/summit-down-jacket">Summit Down Jacket</a> — 800-fill responsibly sourced down, $279.</p>
<p><a href="/sample-site/products/ridgeline-tent-2p">Ridgeline 2P Tent</a> — a freestanding three-season tent weighing 1.6 kg, $399.</p>
<p>Read our latest guide: <a href="/sample-site/blog/how-to-choose-a-sleeping-bag">How to choose a sleeping bag</a>.</p>`,
  },
  '/products/trailhead-backpack-40l': {
    title: 'Trailhead 40L Backpack | Fernhill Outdoor Co.',
    description: 'A 40-litre multi-day hiking backpack with an adjustable torso, rain cover and hydration sleeve. $189.',
    body: `
<h1>Trailhead 40L Backpack</h1>
<p>The Trailhead 40L is our best-selling multi-day pack. It costs $189 and comes in three colours: Moss, Slate and Ember.</p>
<h2>Specifications</h2>
<ul>
<li>Volume: 40 litres.</li>
<li>Weight: 1.35 kg (2 lb 15 oz).</li>
<li>Torso length: adjustable from 41 to 53 cm, so one size fits most adults.</li>
<li>Fabric: 210D recycled ripstop nylon with a PFC-free water-repellent finish.</li>
<li>Includes a detachable rain cover and a sleeve for hydration bladders up to 3 litres.</li>
<li>Maximum recommended load: 18 kg.</li>
</ul>
<h2>Fit and sizing</h2>
<p>Measure from the bony bump at the base of your neck (C7 vertebra) to the top of your hip bones. If your torso is shorter than 41 cm, we recommend the Trailhead 32L instead, which fits torsos from 36 to 46 cm.</p>
<h2>Care</h2>
<p>Hand wash with mild soap and air dry. Do not machine wash or tumble dry, as this damages the frame sheet and coatings.</p>`,
  },
  '/products/summit-down-jacket': {
    title: 'Summit Down Jacket | Fernhill Outdoor Co.',
    description: 'An 800-fill-power down jacket rated for active use to -10°C. $279.',
    body: `
<h1>Summit Down Jacket</h1>
<p>The Summit Down Jacket uses 800-fill-power down certified to the Responsible Down Standard (RDS). It costs $279 and is available in men's and women's fits, sizes XS to XXL.</p>
<h2>Warmth</h2>
<p>The Summit is designed for active use down to about -10°C (14°F) and as a camp layer down to about -5°C (23°F). For colder, static conditions, layer it under a waterproof shell.</p>
<h2>Specifications</h2>
<ul>
<li>Weight: 390 g (size M).</li>
<li>Shell: 20D recycled nylon with a DWR finish. The jacket is water-resistant, not waterproof.</li>
<li>Packs into its own chest pocket.</li>
<li>Two zippered hand pockets and an adjustable hood.</li>
</ul>
<h2>Care</h2>
<p>Machine wash cold on a gentle cycle with a down-specific detergent, then tumble dry on low with two clean tennis balls to restore loft.</p>`,
  },
  '/products/ridgeline-tent-2p': {
    title: 'Ridgeline 2P Tent | Fernhill Outdoor Co.',
    description: 'A freestanding, three-season, two-person backpacking tent weighing 1.6 kg. $399.',
    body: `
<h1>Ridgeline 2P Tent</h1>
<p>The Ridgeline 2P is a freestanding, three-season backpacking tent for two people. It costs $399.</p>
<h2>Specifications</h2>
<ul>
<li>Trail weight: 1.6 kg; packed weight with stakes and stuff sacks: 1.82 kg.</li>
<li>Floor area: 2.7 m², with two doors and two vestibules.</li>
<li>Peak height: 102 cm.</li>
<li>Rainfly: 15D silicone-coated nylon with a 1,500 mm waterproof rating; floor: 3,000 mm.</li>
<li>Aluminium DAC poles.</li>
</ul>
<h2>Is it a four-season tent?</h2>
<p>No. The Ridgeline is a three-season tent designed for spring, summer and autumn. It is not designed for heavy snow loads or winter mountaineering.</p>
<h2>Footprint</h2>
<p>A matching footprint is sold separately for $49 and protects the floor on rough ground.</p>`,
  },
  '/shipping': {
    title: 'Shipping & Delivery | Fernhill Outdoor Co.',
    description: 'Shipping options, costs and delivery times for Fernhill Outdoor Co. orders.',
    body: `
<h1>Shipping &amp; Delivery</h1>
<h2>United States</h2>
<p>Standard shipping is free on orders over $75. Orders under $75 ship for a flat $7.95. Standard delivery takes 3–6 business days.</p>
<p>Expedited shipping costs $19.95 and arrives in 1–2 business days. Orders placed before 12 p.m. Pacific Time on a business day ship the same day.</p>
<h2>Canada</h2>
<p>We ship to Canada for a flat $14.95, or free on orders over $150 USD. Delivery takes 5–10 business days. Duties and taxes are included at checkout, so there are no surprise fees on delivery.</p>
<h2>Other countries</h2>
<p>At the moment we only ship to the United States and Canada. We hope to offer shipping to the UK and EU in 2027.</p>
<h2>Order tracking</h2>
<p>You'll receive a tracking link by email as soon as your order ships. If your tracking hasn't updated in 5 business days, please <a href="/sample-site/contact">contact us</a>.</p>`,
  },
  '/returns': {
    title: 'Returns & Exchanges | Fernhill Outdoor Co.',
    description: '60-day returns on unused gear. Free return shipping in the US.',
    body: `
<h1>Returns &amp; Exchanges</h1>
<p>You can return unused gear in its original condition within 60 days of delivery for a full refund to your original payment method.</p>
<h2>How to start a return</h2>
<ol>
<li>Visit our returns portal and enter your order number and email address.</li>
<li>Print the prepaid label. Return shipping is free for US orders; Canadian customers pay a flat $9.95 return fee, which is deducted from the refund.</li>
<li>Drop the package at any UPS location.</li>
</ol>
<p>Refunds are issued within 5 business days of the return arriving at our warehouse.</p>
<h2>Exchanges</h2>
<p>Need a different size or colour? Choose "exchange" in the returns portal and we'll ship the replacement as soon as your return is scanned by the carrier.</p>
<h2>Used or damaged gear</h2>
<p>Gear that has been used outdoors can't be returned for a refund, but it may be covered by our <a href="/sample-site/warranty">warranty</a> or <a href="/sample-site/repair-program">repair program</a>.</p>
<h2>Final sale items</h2>
<p>Items marked "Final Sale" and gift cards cannot be returned.</p>`,
  },
  '/warranty': {
    title: 'Limited Lifetime Warranty | Fernhill Outdoor Co.',
    description: 'Fernhill gear is covered against defects in materials and workmanship for the lifetime of the product.',
    body: `
<h1>Limited Lifetime Warranty</h1>
<p>Every Fernhill product is guaranteed against defects in materials and workmanship for the practical lifetime of the product. If something fails because of how we made it, we'll repair it, replace it or refund it — your choice where possible.</p>
<h2>What isn't covered</h2>
<ul>
<li>Normal wear and tear, such as abrasion or faded fabric after years of use.</li>
<li>Damage from accidents, misuse, animals or improper care.</li>
<li>Zippers and buckles damaged by force (these are usually fixable through our repair program).</li>
</ul>
<h2>How to make a warranty claim</h2>
<p>Email warranty@fernhill-outdoor.example with your order number (if you have it) and photos of the issue. Our team replies within 2 business days. A receipt isn't required.</p>`,
  },
  '/repair-program': {
    title: 'Repair Program | Fernhill Outdoor Co.',
    description: 'Get your Fernhill gear repaired by our in-house technicians.',
    body: `
<h1>Repair Program</h1>
<p>Our in-house repair team in Portland fixes torn fabric, broken zippers, buckles, tent poles and more. Keeping gear in use is the most sustainable thing we can do.</p>
<h2>Pricing</h2>
<ul>
<li>Repairs covered by the <a href="/sample-site/warranty">warranty</a> are free, including return shipping.</li>
<li>Non-warranty repairs start at $15 for small patches; zipper replacements are $25–$45.</li>
<li>Replacement tent pole sections are $12 each.</li>
</ul>
<h2>Turnaround</h2>
<p>Most repairs take 2–3 weeks from the day we receive your gear. You'll get an email with a quote before we start any paid repair.</p>
<h2>In-store repairs</h2>
<p>Small repairs can be done while you wait at our Portland flagship store on Saturdays from 10 a.m. to 2 p.m.</p>`,
  },
  '/stores': {
    title: 'Store Locations & Hours | Fernhill Outdoor Co.',
    description: 'Visit Fernhill Outdoor Co. stores in Portland and Seattle.',
    body: `
<h1>Store Locations &amp; Hours</h1>
<h2>Portland Flagship</h2>
<p>1420 NW Lovejoy Street, Portland, OR 97209.</p>
<p>Open Monday to Saturday 10 a.m. – 7 p.m., and Sunday 11 a.m. – 5 p.m. Phone: (503) 555-0142.</p>
<p>The flagship has a repair bench, a gear rental counter and free parking behind the building.</p>
<h2>Seattle</h2>
<p>812 Pike Street, Seattle, WA 98101.</p>
<p>Open every day 10 a.m. – 6 p.m. Phone: (206) 555-0187.</p>
<h2>Gear rental</h2>
<p>Tents, backpacks and sleeping bags can be rented at the Portland flagship only. Rentals start at $15 per day and must be reserved at least 48 hours in advance.</p>
<h2>Holiday hours</h2>
<p>Both stores are closed on Thanksgiving Day, Christmas Day and New Year's Day.</p>`,
  },
  '/about': {
    title: 'About Us | Fernhill Outdoor Co.',
    description: 'Founded in Portland in 2014 by two trail guides.',
    body: `
<h1>About Fernhill</h1>
<p>Fernhill Outdoor Co. was founded in 2014 in Portland, Oregon, by trail guides Maya Okafor and Daniel Reyes, who were tired of gear that fell apart after one season.</p>
<p>Today we're a team of 48 people designing gear in Portland. Our products are made by audited manufacturing partners in Vietnam and Portugal.</p>
<h2>Our commitments</h2>
<ul>
<li>1% of revenue goes to trail maintenance organisations through 1% for the Planet.</li>
<li>By 2027, 90% of the fabrics in our line will be recycled or bio-based (today: 72%).</li>
<li>We're a certified B Corporation since 2021.</li>
</ul>`,
  },
  '/faq': {
    title: 'FAQ | Fernhill Outdoor Co.',
    description: 'Answers to common questions about orders, payments, sizing and gift cards.',
    body: `
<h1>Frequently Asked Questions</h1>
<h2>Which payment methods do you accept?</h2>
<p>We accept Visa, Mastercard, American Express, Discover, PayPal, Apple Pay and Shop Pay. You can also split purchases over $100 into four interest-free payments with Shop Pay Installments.</p>
<h2>Can I change or cancel my order?</h2>
<p>Orders can be changed or cancelled within 1 hour of being placed. After that they're already being packed, but you can return items once they arrive.</p>
<h2>Do you offer student or military discounts?</h2>
<p>Yes. Students, military members, veterans and first responders get 15% off full-price items after verifying through our checkout partner.</p>
<h2>Do gift cards expire?</h2>
<p>No. Fernhill gift cards never expire and can be used online or in our stores.</p>
<h2>Do you price match?</h2>
<p>We don't price match other retailers, but if we lower the price of an item within 14 days of your purchase, we'll refund the difference.</p>`,
  },
  '/contact': {
    title: 'Contact Us | Fernhill Outdoor Co.',
    description: 'Get in touch with the Fernhill customer care team.',
    body: `
<h1>Contact Us</h1>
<p>Our customer care team is available Monday to Friday, 8 a.m. – 5 p.m. Pacific Time.</p>
<ul>
<li>Email: hello@fernhill-outdoor.example — we reply within 1 business day.</li>
<li>Phone: 1-800-555-0199.</li>
<li>Live chat: available on our website during business hours.</li>
</ul>
<h2>Press and partnerships</h2>
<p>For press enquiries, email press@fernhill-outdoor.example.</p>`,
  },
  '/blog/how-to-choose-a-sleeping-bag': {
    title: 'How to Choose a Sleeping Bag | Fernhill Journal',
    description: 'Temperature ratings, down vs synthetic, and shapes explained.',
    body: `
<h1>How to choose a sleeping bag</h1>
<p>Picking a sleeping bag comes down to three things: temperature rating, insulation type and shape.</p>
<h2>Understand temperature ratings</h2>
<p>Most bags list a "comfort" and a "limit" rating under the ISO 23537 standard. The comfort rating is the temperature at which a typical cold sleeper stays comfortable; choose a bag whose comfort rating is a few degrees below the coldest night you expect.</p>
<h2>Down vs synthetic</h2>
<p>Down is lighter and more compressible for the same warmth, but loses insulation when wet. Synthetic insulation is heavier and bulkier but keeps insulating when damp, which makes it a good choice for wet climates like the Pacific Northwest.</p>
<h2>Shape</h2>
<p>Mummy bags are the warmest for their weight. Rectangular bags give more room to move but are heavier and less efficient.</p>
<p>Fernhill doesn't currently make sleeping bags, but you can rent one at our Portland store.</p>`,
  },
  '/internal/pricing-draft': {
    title: 'INTERNAL — 2027 pricing draft',
    description: 'Not for crawlers.',
    body: `<h1>Internal pricing draft</h1><p>This page is disallowed in robots.txt and should never be indexed by SiteMate. If you can read this in the chatbot, robots.txt handling is broken.</p>`,
  },
};

const NAV = [
  ['/', 'Home'], ['/products/trailhead-backpack-40l', 'Backpacks'], ['/products/summit-down-jacket', 'Jackets'],
  ['/products/ridgeline-tent-2p', 'Tents'], ['/stores', 'Stores'], ['/about', 'About'],
];
const FOOTER = [
  ['/shipping', 'Shipping'], ['/returns', 'Returns'], ['/warranty', 'Warranty'], ['/repair-program', 'Repairs'],
  ['/faq', 'FAQ'], ['/contact', 'Contact'], ['/careers', 'Careers'], ['/internal/pricing-draft', 'Staff'],
];

const link = ([p, label]) => `<a href="${SAMPLE_PREFIX}${p === '/' ? '/' : p}">${label}</a>`;

export function renderSamplePage(pathname, { widgetBotId } = {}) {
  const key = pathname.slice(SAMPLE_PREFIX.length).replace(/\/$/, '') || '/';
  const page = PAGES[key];
  if (!page) return null;
  const widget = widgetBotId
    ? `<script src="/widget.js" data-bot-id="${widgetBotId}" async></script>`
    : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${page.title}</title>
<meta name="description" content="${page.description}">
<link rel="canonical" href="${SAMPLE_PREFIX}${key === '/' ? '/' : key}">
<style>
:root{--g:#2f5d3a;--bg:#f6f3ec;--ink:#1f2a22}
*{box-sizing:border-box}body{margin:0;font:16px/1.65 Georgia,'Times New Roman',serif;background:var(--bg);color:var(--ink)}
.demo{background:#1f2a22;color:#f6f3ec;font:12px/1.4 system-ui,sans-serif;text-align:center;padding:6px 12px}
header,footer{font-family:system-ui,sans-serif}
header{display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:space-between;padding:18px 6vw;background:#fff;border-bottom:1px solid #e4dfd2}
header b{font-size:20px;color:var(--g);letter-spacing:-.02em}header nav{display:flex;flex-wrap:wrap;gap:16px}
a{color:var(--g)}header a{text-decoration:none;color:var(--ink);font-size:14px}
main{max-width:760px;margin:0 auto;padding:40px 6vw 80px}h1{font-size:clamp(30px,5vw,44px);line-height:1.15;color:var(--g);margin:0 0 16px}
h2{font-size:22px;margin-top:36px}footer{border-top:1px solid #e4dfd2;padding:28px 6vw;display:flex;flex-wrap:wrap;gap:16px;font-size:13px;background:#fff}
</style></head><body>
<div class="demo">Fictional demo website bundled with SiteMate AI — “${SAMPLE_NAME}” is not a real company.</div>
<header><b>Fernhill Outdoor Co.</b><nav>${NAV.map(link).join('')}</nav></header>
<main>${page.body}</main>
<footer>${FOOTER.map(link).join('')}<span style="margin-left:auto;color:#776">© 2026 Fernhill Outdoor Co. (fictional)</span></footer>
${widget}
</body></html>`;
}

export function sampleRobots() {
  return `# Robots for the SiteMate AI prototype server (sample site lives under ${SAMPLE_PREFIX}/)
User-agent: *
Disallow: ${SAMPLE_PREFIX}/internal/
Disallow: /api/
`;
}

export function sampleSitemap(origin) {
  const urls = Object.keys(PAGES).filter((p) => !p.startsWith('/internal'))
    .map((p) => `  <url><loc>${origin}${SAMPLE_PREFIX}${p === '/' ? '/' : p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
