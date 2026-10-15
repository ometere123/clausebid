"""Pure cross-language canonical commit vectors, independent of GenVM."""
import hashlib

def hash_fields(parts):
    return hashlib.sha256(b''.join(
        str(len(s.encode('utf8'))).encode('ascii')+b':'+s.encode('utf8')
        for s in parts
    )).hexdigest()

def test_bid_commit_vector():
    parts=['clausebid/commit/v1','61999','0x'+'1'*40,'7','0x'+'2'*40,
           '25000000000000000000','Three products, all SEO, all warranties.','a'*64]
    assert hash_fields(parts)=='173d22dc5b3b72c6952ec17b81d28177634e6bd5610c667029bfa2086a3712a2'

def test_collision_resistant_length_prefix():
    assert hash_fields(['ab','c'])!=hash_fields(['a','bc'])
    assert hash_fields(['café'])!=hash_fields(['cafe'])
