"""Operator-only principal bootstrap. PATs leave the job only as RSA-encrypted ciphertext."""
import base64
import json
import os
from datetime import timedelta

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from django.conf import settings
from django.db import transaction
from iam.models import PersonalAccessToken, User
from knox.models import AuthToken

if settings.DATABASES['default']['NAME'] != 'legal_os_ciso' or os.environ.get('LEGAL_OS_CISO_BOOTSTRAP') != '2026-10-06':
    raise RuntimeError('Refusing unexpected bootstrap target')
key = serialization.load_pem_public_key(base64.b64decode(os.environ['BOOTSTRAP_PUBLIC_KEY']))
with transaction.atomic():
    if User.objects.filter(email='ciso-integration@futureofsports.io').exists():
        raise RuntimeError('Integration already bootstrapped; recover encrypted receipt instead of creating duplicate tokens')
    principals = [
        ('admin', User.objects.create_superuser(email='ciso-bootstrap@futureofsports.io'), 1),
        ('scoped', User.objects.create_user(email='ciso-integration@futureofsports.io'), 90),
    ]
    receipt = {}
    for label, user, days in principals:
        instance, token = AuthToken.objects.create(user=user, expiry=timedelta(days=days))
        PersonalAccessToken.objects.create(auth_token=instance, name='Legal OS initial integration' if label == 'scoped' else 'Temporary operator bootstrap')
        receipt[label] = {'user_id': str(user.pk), 'token': token}
    ciphertext = key.encrypt(json.dumps(receipt).encode(), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    print('LEGAL_OS_ENCRYPTED_BOOTSTRAP=' + base64.b64encode(ciphertext).decode())
