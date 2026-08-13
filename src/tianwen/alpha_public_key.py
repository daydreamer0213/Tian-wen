from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key

_ALPHA_PUBLIC_PEM = b"""-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAzNclJ2Y9RcwTu9bw9NqmSsxdFk3sBpEhNIgDK7QhlJw=
-----END PUBLIC KEY-----
"""


def alpha_public_evaluator_key() -> Ed25519PublicKey:
    key = load_pem_public_key(_ALPHA_PUBLIC_PEM)
    if not isinstance(key, Ed25519PublicKey):
        raise RuntimeError("invalid built-in Alpha public key")
    return key
