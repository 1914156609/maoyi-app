"""Verify and optionally remove only the craft created by this UI acceptance run."""
import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--cleanup', action='store_true')
parser.add_argument('--release', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
out = root / '.data/qa/current-review/round30/ui'
owned = json.loads((out / 'ownership.json').read_text())
assert owned == {
    'ownerId': 103, 'name': 'QA_R30_页面验收_1795266161143',
    'craftIds': ['GY-20261121-FB95C27A68A84A13'],
}, 'Unexpected ownership manifest; do not touch any data'
craft_id = owned['craftIds'][0]


def sql(query):
    return subprocess.check_output(
        ['mysql', '--protocol=socket', '-uroot', '--default-character-set=utf8mb4',
         '--raw', '-N', 'maoyi_ruoyi'], input=query.encode()).decode().strip()


def rows(query):
    return [json.loads(line) for line in sql(query).splitlines() if line]


craft = rows(f"SELECT JSON_OBJECT('id',id,'ownerId',owner_id,'name',name,"
             f"'status',status,'version',version,'payload',payload) FROM maoyi_craft "
             f"WHERE id='{craft_id}'")
assert len(craft) == 1
craft = craft[0]
payload = json.loads(craft.pop('payload'))
assert craft == dict(id=craft_id, ownerId=103, name=owned['name'],
                     status='approved', version=6)
expected_sizes = dict(bodyLength='66', chest='51.148', shoulder='40', armhole='22',
    armholeDecrease='12', shoulderSlope='4', bodyRib='6', neckWidth='18',
    frontNeckDepth='7', frontNeckFlat='4', backNeckDepth='2.5', backNeckFlat='8',
    sleeveLength='55', sleeveCapHeight='15', sleeveCapWidth='17', sleeveWidth='34',
    sleeveRib='6', underarmFlat='2', sleeveCuffWidth='20', placketWidth='3',
    placketLength='60')
assert payload == dict(name=owned['name'], length='常规', style='开衫', sleeve='长袖',
    neck='V领', measurementBasis='flat', calculationVersion='video-v1',
    density='68', rowDensity='46', sizes=expected_sizes, parts=[])
charts = rows(f"SELECT JSON_OBJECT('id',id,'ownerId',owner_id,'craftId',craft_id,"
              f"'payload',payload) FROM maoyi_chart WHERE craft_id='{craft_id}'")
assert len(charts) == 1 and charts[0]['ownerId'] == 103
assert json.loads(charts[0]['payload']) == dict(showDimensions=True, locked=False, showText=True)
audits = rows(f"SELECT JSON_OBJECT('actorId',actor_id,'status',status,'note',note,"
              f"'version',version) FROM maoyi_audit WHERE craft_id='{craft_id}' ORDER BY version")
assert [r['status'] for r in audits] == ['pending', 'rejected', 'pending', 'approved']
assert [r['version'] for r in audits] == [2, 3, 5, 6]
assert [r['actorId'] for r in audits] == [103, 1, 103, 1]
assert audits[1]['note'] == 'R30页面验收：请核对尺寸'
shares = rows(f"SELECT JSON_OBJECT('ownerId',owner_id,'revoked',revoked,"
              f"'lifetimeMs',expires_at-created_at) FROM maoyi_share WHERE craft_id='{craft_id}'")
assert shares == [dict(ownerId=103, revoked=1, lifetimeMs=7*86400000)]
export = out / 'r31-craft-export.png'
assert hashlib.sha256(export.read_bytes()).hexdigest() == '09b3b2fe5363e44e8f0415b62f88be3618451d1076e5830f217ea477f2fbe23f'
report = dict(at=datetime.now(timezone.utc).isoformat(), release=args.release,
    kind='SQL comparison against actual UI inputs/actions and actual downloaded PNG; no simulated UI',
    passed=True, craft=craft, payload=payload, charts=charts, audits=audits, shares=shares,
    sizeFields=21, exportBytes=export.stat().st_size)
(out / ('readback-before-cleanup.json' if args.cleanup else 'readback.json')).write_text(
    json.dumps(report, ensure_ascii=False, indent=2)+'\n')
if args.cleanup:
    # Every related row above was checked before deleting this exact owned craft.
    sql(f"START TRANSACTION; DELETE FROM maoyi_share WHERE craft_id='{craft_id}' AND owner_id=103;"
        f"DELETE FROM maoyi_audit WHERE craft_id='{craft_id}';"
        f"DELETE FROM maoyi_chart WHERE craft_id='{craft_id}' AND owner_id=103;"
        f"DELETE FROM maoyi_craft WHERE id='{craft_id}' AND owner_id=103 AND version=6 "
        f"AND name='{owned['name']}'; COMMIT;")
    remaining = {table: int(sql(f"SELECT COUNT(*) FROM {table} WHERE "
                 f"{'id' if table == 'maoyi_craft' else 'craft_id'}='{craft_id}'"))
                 for table in ['maoyi_craft', 'maoyi_chart', 'maoyi_audit', 'maoyi_share']}
    assert not any(remaining.values())
    (out / 'cleanup.json').write_text(json.dumps(dict(at=datetime.now(timezone.utc).isoformat(),
        release=args.release, scope=owned, remaining=remaining, passed=True,
        preserved='All pre-existing crafts, shares, users, roles, logs and unrelated Redis keys'),
        ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(passed=True, sizeFields=21, cleanup=args.cleanup)))
