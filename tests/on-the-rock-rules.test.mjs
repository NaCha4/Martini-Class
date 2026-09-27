import test from 'node:test';
import assert from 'node:assert/strict';
import {BINGO_MISSIONS,BINGO_LINES,REPEAT_MISSIONS,SPECIAL_MISSIONS,calculateScore} from '../functions/src/on-the-rock-rules.js';

const bingo=(missionId,extra={})=>({kind:'bingo',missionId,allParticipated:false,...extra});

test('the supplied 4 by 4 board has 400 base points and ten bingo lines',()=>{
 assert.equal(BINGO_MISSIONS.length,16);
 assert.equal(new Set(BINGO_MISSIONS.map(m=>m.id)).size,16);
 assert.equal(BINGO_MISSIONS.reduce((sum,m)=>sum+m.points,0),400);
 assert.equal(BINGO_LINES.length,10);
 assert.deepEqual(REPEAT_MISSIONS.map(m=>[m.id,m.points]),[['meal',10],['cafe',10],['karaoke',10],['bar',20]]);
 assert.deepEqual(SPECIAL_MISSIONS.map(m=>m.points),[50,70]);
});

test('complete board scores all rows columns diagonals and the sixteen full participation bonuses',()=>{
 const score=calculateScore(BINGO_MISSIONS.map(m=>bingo(m.id,{allParticipated:true})));
 assert.deepEqual(score,{bingoPoints:400,participationBonus:80,bingoLinePoints:300,repeatPoints:0,specialPoints:0,total:780,completedCells:BINGO_MISSIONS.map(m=>m.id),completedLines:10});
});

test('each row column and diagonal counts only when all its cells are complete',()=>{
 for(const line of BINGO_LINES){
  assert.equal(calculateScore(line.map(id=>bingo(id))).completedLines,1);
  assert.equal(calculateScore(line.slice(1).map(id=>bingo(id))).completedLines,0);
 }
});

test('full participation follows the staff checkbox and does not enforce attendance eligibility',()=>{
 const score=calculateScore([bingo('martini-follow'),bingo('meal',{allParticipated:true,participants:1,memberCountSnapshot:5}),{kind:'repeat',missionId:'bar',allParticipated:true},{kind:'special',missionId:'event-class',allParticipated:true}]);
 assert.equal(score.bingoPoints,20);assert.equal(score.participationBonus,5);
 assert.equal(score.repeatPoints,20);assert.equal(score.specialPoints,50);assert.equal(score.total,95);
});

test('undo removes cell points bonuses and every affected line without changing other records',()=>{
 const records=BINGO_MISSIONS.map(m=>bingo(m.id,{allParticipated:true}));
 records[0].voidedAt='2026-09-28T00:00:00.000Z';
 const score=calculateScore(records);
 assert.equal(score.bingoPoints,390);assert.equal(score.participationBonus,75);
 assert.equal(score.completedLines,7);assert.equal(score.bingoLinePoints,210);assert.equal(score.total,675);
 assert.equal(score.completedCells.includes('martini-follow'),false);
});

test('repeat records count independently and voided or duplicate one-time records do not inflate scores',()=>{
 const score=calculateScore([
  bingo('meal'),bingo('meal'),bingo('movie',{voidedAt:'cancelled'}),bingo('unknown'),
  {kind:'repeat',missionId:'cafe'},{kind:'repeat',missionId:'cafe'},{kind:'repeat',missionId:'cafe',voidedAt:'cancelled'},
  {kind:'special',missionId:'liquor-expo'},{kind:'special',missionId:'liquor-expo'},
  {kind:'special',missionId:'event-class',voidedAt:'cancelled'},{kind:'repeat',missionId:'unknown'}
 ]);
 assert.equal(score.bingoPoints,10);assert.equal(score.repeatPoints,20);assert.equal(score.specialPoints,70);assert.equal(score.total,100);
 assert.deepEqual(calculateScore(),{bingoPoints:0,participationBonus:0,bingoLinePoints:0,repeatPoints:0,specialPoints:0,total:0,completedCells:[],completedLines:0});
});
