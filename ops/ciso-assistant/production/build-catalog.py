"""Build a proposed CISO review catalog from the committed FSP source feed, without legal approval."""
import hashlib
import json
from pathlib import Path

source = Path('src/lib/fsp-compliance/initial-feed.json').read_bytes()
feed = json.loads(source)
nodes = []
for rule in feed['rules']:
    sources = [item for item in feed['sources'] if item['id'] in rule['sourceIds']]
    description = '\n'.join([
        'INITIAL REVIEW INVENTORY. No human applicability approval. Control implementation is not assessed.',
        rule['summary'], 'Basis: ' + rule['basis'] + '. Jurisdiction: ' + rule['jurisdiction'] + '.',
        'Proposed review actions:', *['- ' + item for item in rule['actions']], 'Sources:',
        *[item['url'] + ' (checked ' + item['checkedAt'] + ')' for item in sources],
    ])
    nodes.append({'urn': 'urn:legalos:risk:req_node:fsp-initial-20261006:' + rule['id'].lower(),
                  'ref_id': rule['id'], 'name': rule['title'], 'description': description,
                  'assessable': True, 'depth': 1})
name = 'FSP initial compliance review inventory (unapproved)'
catalog = {
    'urn': 'urn:legalos:risk:library:fsp-initial-20261006', 'locale': 'en',
    'ref_id': 'LEGAL-OS-FSP-INITIAL-20261006', 'name': name, 'version': 1,
    'publication_date': '2026-10-06', 'provider': 'Legal OS', 'packager': 'Legal OS',
    'copyright': 'Original source-backed summaries. Primary legal sources retain their respective rights. No certification or legal approval.',
    'description': 'Initial manually published FSP review catalog. Legal OS owns applicability decisions, source snapshots and approval history. All requirements require legal review; catalog inclusion does not establish applicability or verified compliance. Source file SHA-256: ' + hashlib.sha256(source).hexdigest(),
    'objects': {'framework': {
        'urn': 'urn:legalos:risk:framework:fsp-initial-20261006', 'ref_id': 'LEGAL-OS-FSP-INITIAL-20261006',
        'name': name, 'description': 'Source-backed review requirements. No human applicability decisions or control verification recorded.',
        'min_score': 0, 'max_score': 1, 'requirement_nodes': nodes,
    }},
}
Path('ops/ciso-assistant/production/fsp-review-catalog.json').write_text(json.dumps(catalog, indent=2) + '\n')
print('Catalog contains', len(nodes), 'unapproved source-backed review requirements.')
