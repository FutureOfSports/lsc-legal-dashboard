#!/usr/bin/env python3
"""Build static compliance design options. No live data, forms, or operational actions."""

from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, unquote

ROOT = Path(__file__).resolve().parent / "mocks"

SOURCES = [
    ("delaware-filings", "Delaware corporate filings", "Delaware Division of Corporations", "https://corp.delaware.gov/paytaxes/", "Confirm corporation versus LLC and formation records before assigning filings or deadlines."),
    ("delaware-llc", "Delaware alternative entity filings", "Delaware LLC, LP and GP tax instructions", "https://corp.delaware.gov/alt-entitytaxinstructions/", "Alternative entities follow different filing rules from corporations. The app entity's legal form is unconfirmed."),
    ("delaware-privacy", "Delaware privacy applicability", "Delaware Personal Data Privacy Act", "https://delcode.delaware.gov/title6/c012d/index.html", "Assess statutory scope, thresholds and exemptions against actual processing and residents. Distinguish provisions in force on 5 October 2026 from future-effective provisions."),
    ("california", "California privacy applicability", "California Attorney General CCPA guidance", "https://oag.ca.gov/privacy/ccpa", "Resident locations, business thresholds, processing and exemptions need a separate assessment. Delaware incorporation does not resolve California scope."),
    ("children", "Children and teens", "FTC COPPA business guidance", "https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy", "Under-13 applicability and teen safeguards require separate analysis; an age gate alone is not evidence of compliance."),
    ("health", "Health and nutrition", "FTC Health Breach Notification Rule guidance", "https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0", "Establish actual health data and data-source combinations before deciding coverage."),
    ("hipaa", "Health app roles", "HHS health app guidance", "https://www.hhs.gov/hipaa/for-professionals/special-topics/health-apps/index.html", "HIPAA scope depends on the relevant entity and relationship. A nutrition feature alone does not establish HIPAA applicability."),
    ("washington-health", "Consumer health data", "Washington Attorney General health data guidance", "https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy", "Assess Washington scope against the actual data and consumer relationships. Do not equate consumer health privacy with HIPAA alone."),
    ("biometrics", "Biometric identifiers", "Illinois Biometric Information Privacy Act, section 15", "https://www.ilga.gov/legislation/ilcs/fulltext?DocName=074000140K15", "Determine whether processing creates covered identifiers or information. Video alone does not establish applicability."),
    ("payments", "Payments and value transfer", "FinCEN money services business guidance", "https://www.fincen.gov/resources/money-services-business-msb-registration", "A wallet label does not establish regulated activity. Document custody, transfers, redemption, jurisdictions and providers for specialist review. Contest and prize law needs a separate jurisdiction review."),
    ("security", "Security controls and assurance", "NIST Cybersecurity Framework", "https://www.nist.gov/cyberframework", "Security framework use and SOC 2 or ISO 27001 assurance do not become mandatory merely through Delaware incorporation."),
    ("ciso", "Proposed open-source engine", "CISO Assistant canonical repository", "https://github.com/intuitem/ciso-assistant-community", "Community uses AGPLv3; enterprise code has separate commercial licensing. Proposed, not installed or connected."),
    ("editions", "Integration boundary", "CISO Assistant Community and Pro comparison", "https://intuitem.com/compare", "Community includes API access. Advanced webhooks, finer permissions and audit trails are listed as Pro capabilities."),
]

TOPICS = [
    {"id": "corporate", "name": "Delaware corporate filings", "signal": "Delaware incorporation stated by Anuj.", "fact": "Exact legal name, legal form and formation records.", "policy": "Entity records and filing calendar", "source": "delaware-filings", "state": "Needs facts", "kind": "Corporate law review"},
    {"id": "privacy", "name": "Privacy notice and rights", "signal": "Backend export is locked. Inspected frontend deletion and ad settings need execution proof.", "fact": "Actual user locations, processing volumes, vendors and advertising flows.", "policy": "Privacy notice, rights and retention", "source": "delaware-privacy", "state": "Candidate for review", "kind": "Privacy law review"},
    {"id": "children", "name": "Children and teens", "signal": "Profile completion rejects under-13s; source contains a 13–17 guardian path.", "fact": "Actual audience, age assurance and guardian verification beyond email agreement.", "policy": "Age eligibility and guardian consent", "source": "children", "state": "Candidate for review", "kind": "Age and privacy review"},
    {"id": "nutrition", "name": "Health and nutrition", "signal": "Nutrition is a registered backend capability; frontend activation is unknown.", "fact": "Health data collected, data combinations, recipients and live use.", "policy": "Health data handling and incident response", "source": "health", "state": "Candidate for review", "kind": "Sensitive data review"},
    {"id": "biometrics", "name": "Video and biometrics", "signal": "Sports video and pose processing do not by themselves establish identifying biometrics.", "fact": "Biometric extraction, identification purpose, location and retention.", "policy": "Biometric consent and retention, if applicable", "source": "biometrics", "state": "Not assessed", "kind": "Conditional review"},
    {"id": "payments", "name": "Wallets and prizes", "signal": "Stripe entry payments and Connect payouts appear in source; FSP Bucks cash redemption is unconfirmed.", "fact": "Custody, cash-out, entry fees, prize rules and operating jurisdictions.", "policy": "Payments, prize rules and eligibility", "source": "payments", "state": "Candidate for review", "kind": "Payments and contest review"},
    {"id": "assurance", "name": "Security assurance", "signal": "No assurance commitment established in this review.", "fact": "Customer contracts, partner requirements and chosen assurance target.", "policy": "Security controls and evidence plan", "source": "security", "state": "Needs facts", "kind": "Voluntary or contractual"},
]

CSS = """
:root{color-scheme:dark;--background:oklch(0.07 0.005 260);--foreground:oklch(0.97 0 0);--card:oklch(0.13 0.005 260);--muted:oklch(0.18 0.005 260);--muted-foreground:oklch(0.72 0.01 260);--border:oklch(0.22 0.005 260);--primary:oklch(0.62 0.19 264);--primary-foreground:oklch(1 0 0);--warning:oklch(0.75 0.17 75);--info:oklch(0.7 0.15 230);--sidebar:oklch(0.07 0.005 260);--sidebar-foreground:oklch(0.92 0 0);--sidebar-border:oklch(0.18 0.005 260);--ring:oklch(0.62 0.19 264);--font-sans:Arial,Helvetica,sans-serif;--font-mono:ui-monospace,SFMono-Regular,Consolas,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font:14px/1.5 var(--font-sans)}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline;text-underline-offset:4px}a:focus-visible,button:focus-visible{outline:2px solid var(--ring);outline-offset:5px}button{font:inherit}button[disabled]{background:transparent;border:1px solid var(--border);color:var(--muted-foreground);padding:8px 12px;cursor:not-allowed}h1,h2,h3,p{margin:0}h1{font-size:32px;line-height:1.14;letter-spacing:-1.1px;font-weight:600}h2{font-size:19px;line-height:1.3;font-weight:600;letter-spacing:-.35px}h3{font-size:14px;font-weight:600}small,.small{font-size:12px}strong{font-weight:600}.muted{color:var(--muted-foreground)}.mono{font-family:var(--font-mono);font-size:12px}.overline{font:11px var(--font-mono);letter-spacing:.1em;text-transform:uppercase}.shell{display:grid;grid-template-columns:204px minmax(0,1fr);min-height:100vh}.sidebar{background:var(--sidebar);border-right:1px solid var(--sidebar-border);padding:28px 18px;display:flex;flex-direction:column;gap:30px}.brand{font-size:22px;letter-spacing:-1px;font-weight:600}.brand span{display:block;font:10px var(--font-mono);letter-spacing:.16em;margin-top:4px;color:var(--muted-foreground)}.nav-label{font:10px var(--font-mono);color:var(--muted-foreground);letter-spacing:.13em;margin-bottom:11px;text-transform:uppercase}.sidebar nav a{display:block;padding:8px 10px;border-left:2px solid transparent;color:var(--sidebar-foreground)}.sidebar nav a.active{border-left-color:var(--primary);color:var(--foreground);background:var(--card)}.sidebar-bottom{margin-top:auto;border-top:1px solid var(--border);padding-top:18px;font-size:12px;color:var(--muted-foreground)}.sidebar-bottom a{display:block;color:var(--foreground);margin-top:7px}.workspace{min-width:0}.topbar{height:57px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 32px;border-bottom:1px solid var(--border);font-size:12px}.topbar strong{letter-spacing:.01em}.preview{font:10px var(--font-mono);letter-spacing:.08em;color:var(--warning)}.page{padding:30px 32px 44px;max-width:1640px;margin:0 auto}.page-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:25px}.page-heading .overline{margin-bottom:11px;color:var(--muted-foreground)}.page-note{font-size:13px;color:var(--muted-foreground);max-width:780px;margin-top:12px}.direction-nav{display:flex;flex-wrap:wrap;gap:24px;border-bottom:1px solid var(--border);margin-bottom:25px}.direction-nav a{font-size:12px;padding:0 0 12px;position:relative}.direction-nav a.active{border-bottom:2px solid var(--foreground)}.direction-nav .recommended{color:var(--muted-foreground);font-size:10px;margin-left:5px}.context{display:grid;grid-template-columns:1.1fr 1fr 1.2fr;gap:20px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:14px 0;margin-bottom:26px}.context dt{font:10px var(--font-mono);letter-spacing:.07em;text-transform:uppercase;color:var(--muted-foreground);margin-bottom:4px}.context dd{margin:0;font-size:12px}.context dd span{color:var(--muted-foreground)}.section-title{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-bottom:14px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;font-size:12px}th{font:10px var(--font-mono);letter-spacing:.06em;color:var(--muted-foreground);text-transform:uppercase;border-bottom:1px solid var(--border);padding:10px 12px 10px 0}td{vertical-align:top;padding:16px 12px 16px 0;border-bottom:1px solid var(--border)}td:first-child{min-width:180px}td p{margin-top:4px;max-width:275px}.text-link{color:var(--info);text-decoration:underline;text-underline-offset:4px}.state{display:block;font-size:11px;color:var(--warning);margin-top:7px}.implementation{font-size:11px;color:var(--muted-foreground)}.notice{border-left:2px solid var(--warning);padding:10px 14px;margin:24px 0;font-size:12px;max-width:880px;background:var(--card)}.detail{display:grid;grid-template-columns:1.45fr 1fr;gap:32px;margin-top:28px;padding-top:22px;border-top:1px solid var(--border)}.detail h3{margin:16px 0 5px}.detail p{font-size:12px}.facts{margin:12px 0 0;padding-left:18px;font-size:12px}.facts li{margin:7px 0;padding-left:3px}.detail aside{border-left:1px solid var(--border);padding-left:26px}.line-list{margin:15px 0 0;padding:0;list-style:none}.line-list li{border-bottom:1px solid var(--border);padding:10px 0;font-size:12px}.line-list li span{float:right;color:var(--muted-foreground)}.line-list li:after{content:'';display:block;clear:both}.footer{border-top:1px solid var(--border);margin-top:35px;padding-top:15px;display:flex;justify-content:space-between;gap:24px;font-size:11px;color:var(--muted-foreground)}.footer a{color:var(--foreground)}.feature-layout{display:grid;grid-template-columns:225px minmax(0,1fr);gap:28px}.feature-nav{border-right:1px solid var(--border);padding-right:22px;align-self:start;position:sticky;top:20px}.feature-nav a{display:block;border-bottom:1px solid var(--border);padding:14px 0;font-size:13px}.feature-nav a span{display:block;font-size:10px;color:var(--muted-foreground);margin-top:3px}.feature-sections section{padding:0 0 24px;border-bottom:1px solid var(--border);margin-bottom:25px;scroll-margin-top:20px}.feature-sections section:target{border-left:2px solid var(--info);padding-left:18px}.feature-title{display:flex;gap:18px;align-items:baseline;justify-content:space-between;margin-bottom:17px}.mapping{display:grid;grid-template-columns:1fr 1fr;gap:20px}.mapping dt{font:10px var(--font-mono);color:var(--muted-foreground);text-transform:uppercase;margin-bottom:6px}.mapping dd{margin:0;font-size:12px}.flow-line{border-top:1px solid var(--border);margin-top:17px;padding-top:12px;font-size:11px;display:flex;justify-content:space-between;gap:15px;color:var(--muted-foreground)}.queue-layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(250px,1fr) minmax(210px,.8fr);gap:26px}.queue-layout>section+section{border-left:1px solid var(--border);padding-left:25px}.queue-title{padding-bottom:12px;border-bottom:1px solid var(--foreground);margin-bottom:5px}.queue-title h2{font-size:16px}.queue-row{padding:18px 0;border-bottom:1px solid var(--border)}.queue-row p{font-size:12px;margin-top:7px}.queue-row a{display:inline-block;margin-top:9px;font-size:11px}.queue-row .overline{font-size:9px;margin-bottom:8px;color:var(--muted-foreground)}.policy-row{padding:16px 0;border-bottom:1px solid var(--border);font-size:12px}.policy-row .implementation{margin-top:5px}.checklist{list-style:none;padding:0;margin:10px 0}.checklist li{padding:10px 0;border-bottom:1px solid var(--border);font-size:12px}.checklist li:before{content:'□';margin-right:9px;color:var(--muted-foreground)}.option-list{margin-top:32px;border-top:1px solid var(--border)}.option{padding:28px 0;border-bottom:1px solid var(--border);display:grid;grid-template-columns:62px 1fr 220px;gap:22px;align-items:center}.option .letter{font:36px var(--font-mono)}.option h2{font-size:22px}.option p{font-size:13px;color:var(--muted-foreground);margin-top:7px;max-width:550px}.option .option-purpose{font:11px/1.6 var(--font-mono);color:var(--muted-foreground)}.sources-layout{display:grid;grid-template-columns:1fr 1fr;gap:38px}.scope-section{padding-bottom:24px;margin-bottom:22px;border-bottom:1px solid var(--border);scroll-margin-top:20px}.scope-section h2{margin-bottom:12px}.scope-section p{font-size:13px;margin:8px 0}.source-item{padding:18px 0;border-bottom:1px solid var(--border);scroll-margin-top:20px}.source-item h3{margin-bottom:6px}.source-item p{font-size:12px;margin-top:7px}.source-item a{font-size:12px}.no-wrap{white-space:nowrap}
@media(min-width:1600px){.page{padding-top:40px}.topbar{padding-left:40px}.page{padding-left:40px;padding-right:40px}}
@media(max-width:1150px){.shell{grid-template-columns:175px minmax(0,1fr)}.page{padding:24px}.topbar{padding:0 24px}.queue-layout{grid-template-columns:1.1fr 1fr}.queue-layout>section:last-child{grid-column:1/-1;border-left:0;padding-left:0}.option{grid-template-columns:45px 1fr}.option-purpose{grid-column:2}.feature-layout{grid-template-columns:180px minmax(0,1fr)}}
@media(max-width:760px){.shell{display:block}.sidebar{padding:15px 18px;border-right:0;border-bottom:1px solid var(--border);display:flex;flex-direction:row;align-items:center;gap:20px}.brand{font-size:17px}.brand span,.sidebar-bottom,.nav-label,.sidebar nav.context-nav{display:none}.sidebar nav{display:flex;margin-left:auto;gap:5px}.sidebar nav a{font-size:11px;padding:6px}.topbar{height:auto;min-height:48px;padding:10px 18px;font-size:11px;align-items:flex-start}.page{padding:22px 18px}.page-heading{display:block}h1{font-size:28px}.page-heading button{margin-top:15px}.direction-nav{gap:16px}.direction-nav a{font-size:11px}.direction-nav .recommended{display:none}.context{grid-template-columns:1fr;gap:13px}.table-wrap table{min-width:760px}.detail,.mapping,.sources-layout{grid-template-columns:1fr}.detail aside{border-left:0;padding-left:0;border-top:1px solid var(--border);padding-top:16px}.feature-layout{display:block}.feature-nav{position:static;border-right:0;padding:0;margin-bottom:26px;display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.feature-nav a{font-size:12px;padding:11px 0}.queue-layout{display:block}.queue-layout>section+section{border-left:0;padding-left:0;margin-top:28px}.footer{display:block}.footer a{display:block;margin-top:7px}.option{gap:14px;padding:22px 0}.option h2{font-size:20px}.feature-title{display:block}.feature-title .state{margin-top:8px}.flow-line{display:block}.flow-line span{display:block;margin-bottom:5px}.sources-layout{gap:10px}}
"""


def link(source_id: str, label: str = "Source and scope") -> str:
    return f'<a class="text-link" href="sources.html#{source_id}">{escape(label)}</a>'


def shell(key: str, title: str, summary: str, body: str) -> str:
    variants = [("a", "A · Applicability register"), ("b", "B · Feature map"), ("c", "C · Review queue")]
    tabs = "".join(f'<a class="{"active" if key == ident else ""}" href="{ident}.html" {"aria-current=\"page\"" if key == ident else ""}>{name}{"<span class=\"recommended\">Recommended</span>" if ident == "a" else ""}</a>' for ident, name in variants)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>{escape(title)} | Legal OS design preview</title><link rel="stylesheet" href="styles.css"></head>
<body><div class="shell"><aside class="sidebar"><a class="brand" href="index.html">Legal OS<span>FUTURE OF SPORTS</span></a>
<nav aria-label="Workspace"><div class="nav-label">Workspace</div><a href="sources.html#entity">Entities</a><a class="active" href="index.html">App compliance</a><a href="sources.html#documents">Policies &amp; evidence</a></nav>
<nav class="context-nav" aria-label="Context"><div class="nav-label">Context</div><a href="sources.html#slack">Slack operations</a><a href="sources.html#scope">Scope &amp; sources</a></nav>
<div class="sidebar-bottom">Entity context<br><strong>FSP app</strong><a href="sources.html#entity">Legal identity needs confirmation ↗</a></div></aside>
<div class="workspace"><header class="topbar"><span>Compliance / <strong>FSP app</strong></span><span class="preview">STATIC DESIGN PREVIEW · NO LIVE DATA</span></header>
<main class="page"><div class="page-heading"><div><div class="overline">Application compliance</div><h1>{escape(title)}</h1><p class="page-note">{escape(summary)}</p></div>{'<button disabled type="button">Run assessment · preview only</button>' if key in ['a','b','c'] else ''}</div>
<nav class="direction-nav" aria-label="Design directions">{tabs}<a class="{"active" if key == "sources" else ""}" href="sources.html">Scope &amp; sources</a></nav>
{body}<footer class="footer"><span>Prepared 5 October 2026. Source-code signals are not production acceptance.</span><a href="sources.html#engine">CISO Assistant Community: proposed integration ↗</a></footer></main></div></div></body></html>'''


def context() -> str:
    return '''<dl class="context"><div><dt>Application</dt><dd>FSP app <span>· source review only</span></dd></div><div><dt>Entity</dt><dd>Delaware <span>· user-provided; legal form unknown</span></dd></div><div><dt>Decision boundary</dt><dd>Applicability review <span>≠ implementation proof</span></dd></div></dl>'''


def index() -> str:
    options = [("a", "Applicability register", "Start with each requirement, its trigger and the facts needed to decide.", "Recommended starting point\nClear legal reasoning"), ("b", "Feature-to-policy map", "Start with the app. Follow each feature to the policies and evidence it may need.", "Product and engineering\nFeature-led review"), ("c", "Legal review queue", "Start with unresolved questions. Keep policy review and control testing visible.", "Legal operations\nReview-led workspace")]
    rows = "".join(f'<a class="option" href="{key}.html"><span class="letter">{key.upper()}</span><div><h2>{escape(title)} ↗</h2><p>{escape(desc)}</p></div><span class="option-purpose">{escape(purpose).replace(chr(10), "<br>")}</span></a>' for key, title, desc, purpose in options)
    return shell("index", "Which view should lead?", "Three layouts for the same FSP compliance workspace. Choose a direction before implementation.", context() + '<div class="notice">These are proposals. No engine is installed, no law has been marked applicable, and no control has been tested.</div><div class="option-list">' + rows + '</div>')


def register() -> str:
    rows = ""
    for topic in TOPICS:
        rows += f'''<tr><td><a href="b.html#{topic['id']}"><strong>{topic['name']}</strong> ↗</a><span class="state">{topic['state']}</span></td><td><p>{topic['signal']}</p><p>{link(topic['source'])}</p></td><td><p>{topic['fact']}</p></td><td><strong>{topic['policy']}</strong><p class="implementation">Document not reviewed<br>Control: Not tested</p></td></tr>'''
    body = context() + f'''<div class="section-title"><h2>Requirements to assess</h2><a class="small text-link" href="sources.html#states">How states work</a></div><div class="table-wrap"><table><thead><tr><th>Review topic / applicability</th><th>Why this is here</th><th>Facts still needed</th><th>Policy / implementation evidence</th></tr></thead><tbody>{rows}</tbody></table></div>
<section class="detail" id="privacy-review"><div><div class="overline muted">Review focus / privacy</div><h2>Decide scope before assigning obligations.</h2><ul class="facts"><li>Confirm where users are located and which personal data is processed.</li><li>Test each state law's thresholds and exemptions using real records.</li><li>Review advertising, rights requests and retention against actual flows.</li></ul><h3>Proposed output</h3><p>A reasoned applicability record linked to the source, facts and legal reviewer. No automatic “compliant” verdict.</p></div><aside><h2>Evidence to request</h2><ul class="line-list"><li>Data inventory <span>Not supplied</span></li><li>Audience and processing figures <span>Unknown</span></li><li>Approved privacy notice <span>Not reviewed</span></li><li>Rights request completion proof <span>Not tested</span></li></ul><p style="margin-top:15px">{link('delaware-privacy', 'Read privacy source and scope')}</p></aside></section>'''
    return shell("a", "What applies to the app?", "A requirement register with the reason, missing facts and evidence beside each decision.", body)


def feature_map() -> str:
    feature_names = {"corporate": "Company profile", "privacy": "Data, ads and rights", "children": "Age and guardian flows", "nutrition": "Nutrition", "biometrics": "Video processing", "payments": "Wallets and prizes", "assurance": "Security commitments"}
    nav = ''.join(f'<a href="#{t["id"]}">{feature_names[t["id"]]}<span>{t["state"]}</span></a>' for t in TOPICS)
    sections = ""
    for topic in TOPICS:
        sections += f'''<section id="{topic['id']}"><div class="feature-title"><h2>{feature_names[topic['id']]}</h2><span class="state">{topic['state']}</span></div><dl class="mapping"><div><dt>Signal to investigate</dt><dd>{topic['signal']}<p class="small muted" style="margin-top:7px">Live use has not been established. <a class="text-link" href="sources.html#app-source">Source audit ↗</a></p></dd></div><div><dt>Facts needed</dt><dd>{topic['fact']}</dd></div><div><dt>Policy candidate</dt><dd><strong>{topic['policy']}</strong><p class="implementation">Document not reviewed</p></dd></div><div><dt>Evidence</dt><dd>Approved policy, relevant data flow and executed control proof.<p class="implementation">Control: Not tested</p></dd></div></dl><div class="flow-line"><span>{topic['kind']}</span>{link(topic['source'], 'Review source ↗')}</div></section>'''
    body = context() + f'<div class="feature-layout"><nav class="feature-nav" aria-label="Feature sections"><div class="overline muted">Follow an app feature</div>{nav}</nav><div class="feature-sections">{sections}</div></div>'
    return shell("b", "Follow the feature. Find the policy.", "App capabilities lead to review questions, policy candidates and the evidence needed to close them.", body)


def review_queue() -> str:
    questions = [
        ("Entity identity", "Corporation or LLC?", "Confirm the exact legal entity and formation record before adding a filing calendar.", "corporate", "Needs facts"),
        ("Audience", "Who actually uses the app?", "Establish resident locations and age groups, including whether under-13 users can access it.", "children", "Needs facts"),
        ("Product operation", "What value moves through wallets?", "Identify custody, cash-out, entry fees, prizes and the responsible providers.", "payments", "Needs facts"),
        ("Data use", "What reaches external providers?", "Map advertising, nutrition data, video processing and their recipients.", "privacy", "Needs facts"),
        ("Control execution", "What does a rights request execute?", "Backend export is locked; inspected frontend deletion is toast-only. Verify generated and live behavior before any conclusion.", "privacy", "Candidate for review"),
    ]
    queue = ''.join(f'<article class="queue-row"><div class="overline">{group}</div><h3>{title}</h3><span class="state">{state}</span><p>{text}</p><a class="text-link" href="b.html#{ident}">Open feature context ↗</a></article>' for group, title, text, ident, state in questions)
    policies = ''.join(f'<div class="policy-row"><strong>{t["policy"]}</strong><div class="implementation">Document not reviewed<br>Implementation: Not tested</div></div>' for t in TOPICS)
    body = context() + f'''<div class="queue-layout"><section><div class="queue-title"><h2>Resolve scope</h2></div>{queue}</section><section><div class="queue-title"><h2>Review policy coverage</h2></div>{policies}</section><section><div class="queue-title"><h2>Collect proof</h2></div><div class="queue-row"><h3>No compliance score yet</h3><p>Policy existence and implemented controls are different checks. Neither is established in this preview.</p></div><ul class="checklist"><li>Formation record</li><li>Actual data inventory</li><li>Audience and location facts</li><li>Approved policy versions</li><li>Consent and rights flow tests</li><li>Payment and vendor agreements</li></ul><p class="small muted">Owners and due dates are unset.</p><div class="notice">Proposed Slack handoff: ask for missing facts and link the reviewed evidence. No messages are sent by this preview.</div><a class="text-link small" href="sources.html#slack">Slack and access boundary ↗</a></section></div>'''
    return shell("c", "Move each question toward a decision.", "A legal review workspace separates unresolved scope, policy documents and implementation proof.", body)


def sources_page() -> str:
    sources = ''.join(f'<article class="source-item" id="{ident}"><h3>{escape(title)}</h3><a class="text-link" href="{escape(url, quote=True)}">{escape(publisher)} ↗</a><p>{escape(note)}</p></article>' for ident, title, publisher, url, note in SOURCES)
    body = '''<div class="sources-layout"><div>
<section class="scope-section" id="scope"><h2>What this preview establishes</h2><p>The layout and proposed review process only. No GRC software has been installed or connected. No production data, user counts, owners, due dates or compliance scores have been invented.</p><p>FSP app source contains relevant signals. A source-code path does not prove deployment, enabled configuration, real use, correct policy or successful control execution.</p><p>Review topics are an initial intake, not an exhaustive legal requirements inventory.</p></section>
<section class="scope-section" id="entity"><h2>One app, a sourced entity profile</h2><p>Delaware incorporation is user-provided. The exact contracting entity, legal form and formation records remain unconfirmed.</p><p>FSP is app context, not a substituted legal company name. Keep existing entity relationships and KYC in Legal OS.</p></section>
<section class="scope-section" id="app-source"><h2>Source audit, 5 October 2026</h2><p><strong>Repository snapshots:</strong> d_zero <span class="mono">b6a4d416e0dc</span> and app-frontend <span class="mono">7a87e6326d24</span>. Source findings require generated-build and live validation; none is a finding of legal violation.</p><p><strong>Identity:</strong> source/footer text says “Future of Sports Labs Inc.” Corporate records have not verified that identity. The country selector does not establish actual user residency.</p><p><strong>Ages:</strong> the inspected profile-completion path rejects under-13s and handles ages 13–17. Initial guardian verification uses email agreement, not government ID for every guardian. <a class="text-link" href="https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/users.js#L265">Source ↗</a></p><p><strong>Rights:</strong> export returns a locked response. Account deletion exists with partial deletion limited to never-uploaded accounts. Inspected frontend deletion is toast-only; no deleteSelf call was found there. <a class="text-link" href="https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/accountDataRequests.js#L31">Export source ↗</a> · <a class="text-link" href="https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/services/accountLifecycleService.js#L41">Deletion source ↗</a></p><p><strong>Payments:</strong> Stripe paid entry and Connect cash payouts appear in source. FSP Bucks is not proven to be crypto or redeemable cash. Golden Ticket purchase is a Stripe test path. <a class="text-link" href="https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/settlement/payments.js#L90">Entry source ↗</a></p><p><strong>Nutrition:</strong> registered backend capability; no nutrition calls found in the inspected frontend. Activation is unknown.</p><p><strong>Ads and video:</strong> the inspected ad-preferences toggle changes the DOM; signup consent separately persists. Downstream enforcement is unproven. Sports pose processing is not automatically identifying biometrics; a file named biometricThrottle is ad frequency logic.</p></section>
<section class="scope-section" id="states"><h2>Two independent decisions</h2><p><strong>Applicability:</strong> Needs facts, Candidate for review, or Not assessed. These states do not assert that a law applies.</p><p><strong>Implementation:</strong> Document not reviewed and Not tested. Source-code signals cannot close either check.</p><p>SOC 2 and ISO 27001 are assurance topics to assess against customer commitments and business choices. They are not automatically required by Delaware incorporation.</p></section>
<section class="scope-section" id="documents"><h2>Policies and evidence stay attributable</h2><p>Reuse the Legal OS document repository and immutable versions. Link an applicability decision to its official source, verified business facts, approved policy and executed evidence.</p><p>Do not treat a draft policy, proposed mapping or AI answer as proof of implementation.</p></section>
<section class="scope-section" id="slack"><h2>Slack remains the working channel</h2><p>Proposed use: request missing facts, notify the responsible reviewer and link back to this workspace.</p><p>Existing Legal OS access rules remain the boundary. This preview does not add users, grant access, submit requests or send messages.</p></section>
<section class="scope-section" id="engine"><h2>CISO Assistant Community, proposed</h2><p>Use the open-source engine for frameworks, controls, assessments, tasks and evidence links. Legal OS would keep the application profile and source-backed applicability review.</p><p>Community is AGPLv3 and includes API access. Advanced webhooks, custom fields, finer permissions and audit trails are listed as Pro features. Do not assume they are included.</p><p>Integration and license review are still ahead. No automatic statutory applicability capability has been established.</p></section>
</div><section><h2>Primary source anchors</h2><p class="page-note">These sources guide review. The relevant statutory tests and business facts must be assessed before any obligation is assigned.</p>''' + sources + '</section></div>'
    return shell("sources", "Scope, evidence and open questions", "The boundary between what was observed, what was proposed and what still requires a decision.", body)


class PreviewParser(HTMLParser):
    """Validate preview semantics and record links without a browser or scripts."""

    def __init__(self, filename: str):
        super().__init__()
        self.filename = filename
        self.ids: set[str] = set()
        self.links: list[str] = []
        self.buttons = 0
        self.main = 0
        self.title = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        values = dict(attrs)
        assert tag not in {"script", "form", "iframe", "input", "textarea", "select"}, (self.filename, tag)
        assert not any(name.lower().startswith("on") for name in values), (self.filename, "event handler")
        if "id" in values:
            assert values["id"] not in self.ids, (self.filename, "duplicate id", values["id"])
            self.ids.add(values["id"] or "")
        if tag == "a":
            assert values.get("href"), (self.filename, "empty link")
            self.links.append(values["href"] or "")
        if tag == "link":
            self.links.append(values["href"] or "")
        if tag == "button":
            assert "disabled" in values, (self.filename, "enabled action")
            self.buttons += 1
        self.main += tag == "main"
        self.title += tag == "title"


def verify() -> None:
    parsers: dict[str, PreviewParser] = {}
    for path in ROOT.glob("*.html"):
        content = path.read_text()
        assert "\u2014" not in content, (path.name, "em dash")
        assert "STATIC DESIGN PREVIEW" in content
        parser = PreviewParser(path.name)
        parser.feed(content)
        assert parser.main == parser.title == 1, (path.name, "document landmarks")
        parsers[path.name] = parser
    local, external, disabled = 0, 0, 0
    for name, parser in parsers.items():
        disabled += parser.buttons
        for href in parser.links:
            url = urlparse(href)
            if url.scheme:
                assert url.scheme == "https", (name, "unsafe scheme", href)
                external += 1
                continue
            target = unquote(url.path) or name
            assert (ROOT / target).is_file(), (name, "missing local target", href)
            if url.fragment:
                assert target in parsers and unquote(url.fragment) in parsers[target].ids, (name, "missing anchor", href)
            local += 1
    assert set(parsers) == {"index.html", "a.html", "b.html", "c.html", "sources.html"}
    assert disabled == 3
    print(f"PASS: {len(parsers)} pages; {local} local links/assets and anchors; {external} HTTPS source links; {disabled} disabled preview actions; no forms, scripts, inputs, inline handlers or em dashes.")


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / "styles.css").write_text(CSS.strip() + "\n")
    for filename, content in {"index.html": index(), "a.html": register(), "b.html": feature_map(), "c.html": review_queue(), "sources.html": sources_page()}.items():
        (ROOT / filename).write_text(content + "\n")
    verify()
