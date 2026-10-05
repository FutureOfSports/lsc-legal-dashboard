"""Create synthetic local principals and short-lived tokens without printing secrets.

Run only through the CPL-02 isolated proof service. No feature/license gates
are changed. Scope setup is exercised by the HTTP proof rather than this file.
"""
import json
import os
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from iam.models import PersonalAccessToken, User
from knox.models import AuthToken

expected = Path('/code/db/ciso-assistant.sqlite3')
actual = Path(settings.DATABASES['default']['NAME'])
if actual != expected or os.environ.get('LEGAL_OS_SYNTHETIC_PROOF') != 'cpl02':
    raise RuntimeError('Refusing bootstrap outside the isolated synthetic database')
if User.objects.filter(email='admin@cpl02.invalid').exists():
    raise RuntimeError('Fixtures already exist; reuse the private credential file or reset explicitly')

admin = User.objects.create_superuser(email='admin@cpl02.invalid')
scoped = User.objects.create_user(email='integration@cpl02.invalid')
secrets = {}
for key, user in [('admin', admin), ('scoped', scoped)]:
    instance, token = AuthToken.objects.create(user=user, expiry=timedelta(days=1))
    PersonalAccessToken.objects.create(auth_token=instance, name='CPL02 synthetic API proof')
    secrets[key] = {'user_id': str(user.pk), 'token': token}
output = Path('/code/db/proof-credentials.json')
fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as handle:
    json.dump(secrets, handle)
print('Synthetic principals created. Credentials retained in the private proof directory.')
