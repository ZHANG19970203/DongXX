"""Grade the 30-item kinesiology test and issue its platform certificate atomically."""
import hashlib
import json
from pathlib import Path
import uuid

from learning_service import ServiceError, check_object, dumps, ident, now

BANK = json.loads((Path(__file__).parent / 'learning/ankle-exam.json').read_text('utf8'))
VERSION = BANK['version']
QUESTIONS = BANK['items']
PASS = BANK['passScore']

def init_exam(connection):
    connection.execute('''CREATE TABLE IF NOT EXISTS kinesiology_exams (
        session_id TEXT NOT NULL, attempt_id TEXT NOT NULL, version TEXT NOT NULL,
        answers_json TEXT NOT NULL, score INTEGER NOT NULL, submitted_at TEXT NOT NULL,
        PRIMARY KEY(session_id, attempt_id))''')

def certificate_for(connection, owner):
    row = connection.execute('''SELECT * FROM experience_certificates
        WHERE owner_json=? AND scope='exam' AND json_extract(evidence_json,'$.criteriaVersion')=?
        ORDER BY issued_at LIMIT 1''', (dumps(owner), VERSION)).fetchone()
    return dict(row) if row else None

def submit_exam(learning, data, token):
    check_object(data, ('sessionId','attemptId','version','answers'))
    sid, aid = ident(data['sessionId']), ident(data['attemptId'])
    answers = data['answers']
    if data['version'] != VERSION or not isinstance(answers,list) or len(answers) != len(QUESTIONS):
        raise ServiceError(422,'题目版本或作答数量不匹配。')
    for q, a in zip(QUESTIONS,answers):
        if a is not None and a != 'skip' and not (type(a) is int and 0 <= a < len(q['choices'])):
            raise ServiceError(422,'答案格式无效。')
    score = sum(q['key'] == a for q,a in zip(QUESTIONS,answers))
    encoded = dumps(answers)
    with learning.store.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        owner = json.loads(learning.auth(sid,token,connection=c)['identity_json'])
        if not owner or not owner.get('studentId'):
            raise ServiceError(422,'请先登记学生姓名和学号。')
        prior = c.execute('SELECT * FROM kinesiology_exams WHERE session_id=? AND attempt_id=?',(sid,aid)).fetchone()
        if prior and (prior['answers_json'] != encoded or prior['version'] != VERSION):
            raise ServiceError(409,'该次测试已经交卷，请重新开始测试。')
        at = prior['submitted_at'] if prior else now()
        if not prior:
            c.execute('INSERT INTO kinesiology_exams VALUES (?,?,?,?,?,?)',(sid,aid,VERSION,encoded,score,at))
        cert = None
        if score >= PASS:
            cert = certificate_for(c,owner)
            if not cert:
                evidence = dict(criteriaVersion=VERSION, sessionId=sid,attemptId=aid,
                    score=score,total=len(QUESTIONS),passScore=PASS,questions=[q['id'] for q in QUESTIONS],answers=answers)
                proof = dumps(evidence)
                cid = 'DXX-'+uuid.uuid4().hex[:16].upper()
                c.execute('INSERT INTO experience_certificates VALUES (?,?,?,?,?,?)',
                    (cid,dumps(owner),'exam',hashlib.sha256(proof.encode()).hexdigest(),proof,at))
                cert = certificate_for(c,owner)
        return dict(id=aid,at=at,version=VERSION,answers=answers,correct=score,total=len(QUESTIONS),
                    passed=score>=PASS,certificateId=cert['id'] if cert else None)

def exam_progress(learning, ids, owner, action):
    with learning.store.connect() as c:
        placeholders=','.join('?' for _ in ids)
        row=c.execute(f'''SELECT MAX(score) AS best FROM kinesiology_exams
            WHERE version=? AND session_id IN ({placeholders})''',[VERSION,*ids]).fetchone()
        score=row['best']
        eligible=score is not None and score>=PASS
        if action=='issue' and not eligible:
            raise ServiceError(409,'知识测试须达到 25 / 30 分才能获证。')
        return dict(owner=owner,scope='exam',done=score or 0,total=len(QUESTIONS),passScore=PASS,
                    eligible=eligible,attempted=score is not None,
                    certificate=certificate_for(c,owner) if eligible else None)
