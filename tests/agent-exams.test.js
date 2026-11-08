import test from 'node:test';
import assert from 'node:assert/strict';
import {availableAgentExams,gradeAgentExam} from '../src/agent-exams.js';
test('deterministic exams score answers and reject malformed submissions',()=>{
 assert.equal(availableAgentExams().length,6);
 const full=gradeAgentExam({role:'researcher',answers:[1,1]});
 assert.equal(full.score,1);
 assert.equal(full.correct,2);
 assert.equal(gradeAgentExam({role:'researcher',answers:[0,1]}).score,0.5);
 assert.throws(()=>gradeAgentExam({role:'researcher',answers:[1]}),/Invalid agent exam/);
 assert.throws(()=>gradeAgentExam({role:'developer',answers:[1,1]}),/Invalid agent exam/);
 assert.throws(()=>gradeAgentExam({role:'researcher',answers:[1,'1']}),/Invalid agent exam/);
});
