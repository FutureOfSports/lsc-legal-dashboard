"""Execute real HTTP API and isolation checks against the disposable CPL-02 instance.

The private token file never leaves /tmp. Receipts include only synthetic IDs,
HTTP outcomes and response shapes. Running the script twice reuses fixture IDs.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path('/tmp/legal-os-ciso-cpl02')
BASE = 'http://127.0.0.1:18784/api/'
CREDS = json.loads((ROOT / 'db/proof-credentials.json').read_text())
STATE_PATH = ROOT / 'fixture-state.json'
STATE = json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else {}
checks = []


def persist():
    STATE_PATH.write_text(json.dumps(STATE, indent=2))
    STATE_PATH.chmod(0o600)


def request(path, method='GET', data=None, actor='admin', upload=None):
    assert not path.startswith('/') and '://' not in path
    headers = {}
    if actor:
        headers['Authorization'] = 'Token ' + CREDS[actor]['token']
    if upload:
        body = upload
        headers['Content-Type'] = 'application/yaml'
        headers['Content-Disposition'] = 'attachment; filename="synthetic-framework.yaml"'
    elif data is not None:
        body = json.dumps(data).encode()
        headers['Content-Type'] = 'application/json'
    else:
        body = None
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    try:
        result = json.loads(raw)
    except ValueError:
        result = {'non_json_body': raw.decode()[:300]}
    return status, result


def expect(name, path, method='GET', data=None, actor='admin', statuses=(200,), upload=None):
    status, result = request(path, method, data, actor, upload)
    check = {'name': name, 'method': method, 'endpoint': path, 'status': status, 'passed': status in statuses}
    checks.append(check)
    if not check['passed']:
        raise AssertionError(f'{name}: HTTP {status}: {str(result)[:700]}')
    return result


def items(result):
    return result['results'] if isinstance(result, dict) else result


def fixture(key, endpoint, payload):
    if key not in STATE:
        result = expect('create ' + key, endpoint, 'POST', payload, statuses=(201,))
        STATE[key] = result['id']
        persist()
    return STATE[key]


def verify():
    expect('anonymous denied', 'applied-controls/', actor=None, statuses=(401, 403))
    me = expect('scoped token authentication', 'iam/current-user/', actor='scoped')
    assert me['id'] == CREDS['scoped']['user_id']
    fsp = fixture('domain', 'folders/', {'name': 'Synthetic FSP CPL02', 'create_iam_groups': True})
    other = fixture('other_domain', 'folders/', {'name': 'Synthetic unrelated CPL02', 'create_iam_groups': False})
    if 'analyst_group' not in STATE:
        roles = items(expect('read built-in roles', 'roles/?limit=100'))
        analyst = next(role for role in roles if role['name'] == 'Analyst')
        STATE['analyst_role'] = analyst['id']; persist()
        groups = items(expect('read generated domain groups', 'user-groups/?folder='+fsp+'&limit=100'))
        group = next(x for x in groups if x['name'] == 'Synthetic FSP CPL02 - Analyst')
        expect('assign scoped built-in analyst group', 'users/'+CREDS['scoped']['user_id']+'/', 'PATCH', {'user_groups':[group['id']]})
        STATE['analyst_group'] = group['id']; persist()
    me = expect('read scoped membership', 'iam/current-user/', actor='scoped')
    assert not me['is_superuser'] and not me['is_admin']
    assert set(me['accessible_domains']) == {fsp}
    checks.append({'name':'ordinary account has only the synthetic FSP domain','passed':True})
    expect('Community service accounts gated', 'iam/service-accounts/', statuses=(403,))
    if 'framework' not in STATE:
        expect('custom framework upload', 'stored-libraries/upload/', 'POST', upload=(Path(__file__).parent/'synthetic-framework.yaml').read_bytes(), statuses=(200, 201))
        frameworks = items(expect('find imported framework', 'frameworks/?limit=100'))
        framework = next(x for x in frameworks if x.get('ref_id') == 'LEGAL-OS-CPL02-SYNTHETIC')
        STATE['framework'] = framework['id']
        persist()
    framework = expect('scoped custom framework read', f'frameworks/{STATE["framework"]}/', actor='scoped')
    STATE['framework_folder'] = framework['folder']['id'] if isinstance(framework['folder'], dict) else framework['folder']
    requirements = items(expect('read imported custom requirement', 'requirement-nodes/?framework='+STATE['framework']+'&limit=100', actor='scoped'))
    assert any(item.get('ref_id') == 'PROOF-01' for item in requirements)
    fixture('control', 'applied-controls/', {'name': 'Synthetic CPL02 control', 'folder': fsp, 'ref_id': 'legal-os:cpl02-proof', 'description': 'Synthetic control only', 'status': 'to_do'})
    fixture('other_control', 'applied-controls/', {'name': 'Synthetic unrelated control', 'folder': other, 'ref_id': 'legal-os:cpl02-other', 'description': 'Boundary fixture', 'status': 'to_do'})
    marker = '<!-- legal-os:12345678-1234-4234-8234-123456789012 -->'
    if 'scoped_control' not in STATE:
        result = expect('scoped create control', 'applied-controls/', 'POST', {'name': 'Synthetic scoped control', 'folder': fsp, 'ref_id': 'legal-os:cpl02-scoped', 'status': 'to_do'}, actor='scoped', statuses=(201,))
        STATE['scoped_control'] = result['id']; persist()
    expect('scoped control update', f'applied-controls/{STATE["scoped_control"]}/', 'PATCH', {'description': 'Synthetic updated description'}, actor='scoped')
    if 'evidence' not in STATE:
        result = expect('scoped create evidence metadata', 'evidences/', 'POST', {'name': 'Synthetic evidence', 'folder': fsp, 'description': marker+'\nSynthetic metadata only', 'link': 'https://example.invalid/proof-v1', 'applied_controls': [STATE['scoped_control']]}, actor='scoped', statuses=(201,))
        STATE['evidence'] = result['id']; persist()
    fixture('other_evidence', 'evidences/', {'name': 'Unrelated synthetic evidence', 'folder': other, 'description': 'Boundary fixture', 'link': 'https://example.invalid/other'})
    before = expect('read scoped evidence', f'evidences/{STATE["evidence"]}/', actor='scoped')
    expect('scoped evidence metadata update', f'evidences/{STATE["evidence"]}/', 'PATCH', {'description': marker+'\nUpdated synthetic metadata', 'applied_controls': [STATE['control']]}, actor='scoped')
    after = expect('read updated scoped evidence', f'evidences/{STATE["evidence"]}/', actor='scoped')
    assert after['description'] == marker+'\nUpdated synthetic metadata'
    assert {STATE['control']} == {item['id'] if isinstance(item,dict) else item for item in after['applied_controls']}
    assert STATE['scoped_control'] in [item['id'] if isinstance(item,dict) else item for item in before['applied_controls']]
    checks.append({'name':'evidence create and update preserve exact applied_controls relationships','passed':True})
    expect('link evidence to control', f'applied-controls/{STATE["scoped_control"]}/', 'PATCH', {'evidences': [STATE['evidence']]}, actor='scoped')
    linked = expect('read linked control', f'applied-controls/{STATE["scoped_control"]}/', actor='scoped')
    assert STATE['evidence'] in [item['id'] if isinstance(item,dict) else item for item in linked['evidences']]
    for endpoint, key in [('applied-controls', 'other_control'), ('evidences', 'other_evidence')]:
        expect('deny cross-domain read '+endpoint, f'{endpoint}/{STATE[key]}/', actor='scoped', statuses=(403,404))
        expect('deny cross-domain update '+endpoint, f'{endpoint}/{STATE[key]}/', 'PATCH', {'description':'must not persist'}, actor='scoped', statuses=(403,404))
        expect('deny cross-domain create '+endpoint, endpoint+'/', 'POST', {'name':'must not exist','folder':other}, actor='scoped', statuses=(403,))
        listing = expect('scoped list '+endpoint, endpoint+'/?limit=100', actor='scoped')
        assert STATE[key] not in [x['id'] for x in items(listing)]
        checks.append({'name': 'cross-domain omitted from '+endpoint, 'passed': True})
    expect('deny moving own control into other domain', f'applied-controls/{STATE["scoped_control"]}/', 'PATCH', {'folder':other}, actor='scoped', statuses=(403,))
    expect('deny linking cross-domain evidence', f'applied-controls/{STATE["scoped_control"]}/', 'PATCH', {'evidences':[STATE['other_evidence']]}, actor='scoped', statuses=(400,403,404))
    own_evidence_before = expect('read evidence before inverse boundary check', f'evidences/{STATE["evidence"]}/', actor='scoped')
    expect('deny inverse cross-domain control link', f'evidences/{STATE["evidence"]}/', 'PATCH', {'applied_controls':[STATE['other_control']]}, actor='scoped', statuses=(400,403,404))
    own_evidence_after = expect('read evidence after inverse boundary check', f'evidences/{STATE["evidence"]}/', actor='scoped')
    assert own_evidence_after['applied_controls'] == own_evidence_before['applied_controls']
    own_control_after = expect('read own control after denied move and link', f'applied-controls/{STATE["scoped_control"]}/', actor='scoped')
    assert own_control_after['folder']['id'] == fsp
    assert own_control_after['evidences'] == linked['evidences']
    foreign_control = expect('verify foreign control unchanged', f'applied-controls/{STATE["other_control"]}/')
    foreign_evidence = expect('verify foreign evidence unchanged', f'evidences/{STATE["other_evidence"]}/')
    assert foreign_control['description'] == 'Boundary fixture'
    assert foreign_evidence['description'] == 'Boundary fixture'
    assert foreign_evidence['id'] not in [x['id'] if isinstance(x,dict) else x for x in own_control_after['evidences']]
    checks.append({'name':'denied operations preserve source and target records','passed':True})
    expect('deny global role assignment', 'role-assignments/', 'POST', {'name':'must not exist','folder':other,'user':CREDS['scoped']['user_id'],'role':STATE['analyst_role'],'perimeter_folders':[other]}, actor='scoped', statuses=(403,))
    # Upstream accepts but silently ignores metadata PATCH link changes. Record
    # the behavior so the client rejects such a change rather than losing it.
    expect('upstream evidence link PATCH response', f'evidences/{STATE["evidence"]}/', 'PATCH', {'link':'https://example.invalid/proof-v2'}, actor='scoped')
    final = expect('read link after PATCH', f'evidences/{STATE["evidence"]}/', actor='scoped')
    STATE['evidence_link_patch_behavior'] = 'unchanged' if final.get('link') == before.get('link') else 'updated'
    STATE['response_shapes'] = {'framework_keys': sorted(framework), 'control_keys': sorted(linked), 'evidence_keys': sorted(final), 'framework_folder': STATE['framework_folder'], 'domain': fsp, 'evidence_link_patch_behavior': STATE['evidence_link_patch_behavior']}
    persist()
    return STATE['response_shapes']

try:
    shape = verify()
    passed = True
    error = None
except Exception as exc:
    shape = STATE.get('response_shapes')
    passed = False
    error = str(exc)
receipt = {'recorded_at': datetime.now(timezone.utc).isoformat(), 'scope':'local synthetic Community API only', 'upstream_version':'v4.1.0', 'upstream_commit':'5d62f2d2fad19e838da9588b3d720c52b524feb3', 'passed':passed, 'checks':checks, 'response_shapes':shape, 'error':error}
(ROOT/'api-proof.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps({'passed':passed,'checks':len(checks),'receipt':'/tmp/legal-os-ciso-cpl02/api-proof.json','error':error}))
raise SystemExit(0 if passed else 1)
