'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { classifyAttendanceReport } = require('../attendance-report');
const { startFixture } = require('./fixtures/browser-server');

const at = (date, time) => Date.parse(date + 'T' + time + ':00+08:00');
const punch = (employeeId, date, time, type, attendanceStatusText = '正常') => ({
    employeeId, timestamp:at(date,time), type, recordKind:'punch', attendanceStatusText
});

test('daily missing punch findings stay on one original row, honor cross-midnight evidence and assess current shifts at cutoff', () => {
    const previous='2026-11-11', today='2026-11-12';
    const nightIn=punch('N',previous,'22:00','in'), nightOut=punch('N',today,'06:00','out');
    const badIn=punch('I',previous,'09:00','in','GPS 異常'), repeatedIn=punch('I',previous,'09:10','in');
    const duplicateOut=punch('I',previous,'09:01','out','重複打卡');
    const lonelyOut=punch('O',previous,'17:00','out');
    const openIn=punch('W',today,'09:00','in'), lateIn=punch('L',today,'09:00','in');
    const leave={ employeeId:'NO-PUNCH',recordKind:'leave' };
    const visible=[nightOut,badIn,repeatedIn,duplicateOut,lonelyOut,openIn,lateIn,leave];
    const rows=classifyAttendanceReport(visible,[...visible,nightIn],at(today,'18:00'),row=>
        row.employeeId==='W' ? at(today,'19:00') : row.employeeId==='L' ? at(today,'17:00') : null);
    assert.deepEqual(rows.map(row=>row.attendanceFlags),[[],['missing_out'],[],[],['missing_in'],['awaiting_out'],['missing_out'],[]]);
    assert.equal(rows.filter(row=>row.reportCategories.includes('abnormal')).length,3);
    assert.equal(rows.filter(row=>row.reportCategories.includes('raw_abnormal')).length,1);
    assert.equal(rows.filter(row=>row.reportCategories.includes('missing_punch')).length,3);
    assert.equal(rows[1].attendanceStatusText,'GPS 異常');
    assert.equal(rows.length,visible.length);
});

test('attendance query filters exact employee and category, keeps source status, and applies the same filter to CSV',async t=>{
    t.mock.method(Date,'now',()=>at('2026-11-12','18:00'));
    const fixture=await startFixture(),{db,url}=fixture;
    t.after(fixture.close);
    db.setSetting('browserSecuritySettings',{deviceBindingEnabled:false,gpsRequiredOnPunch:false});
    const api=async(route,token,body)=>{
        const response=await fetch(url+'/api/browser'+route,{
            method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)
        });
        return {status:response.status,...await response.json()};
    };
    const account=await api('/login',null,{employeeId:'A001',secret:'A001-test-password',role:'account'});
    const admin=(await api('/workspace',account.token,{role:'admin'})).token;
    const date='2026-10-02';
    for (const [id,day,time,type,status] of [
        ['E001',date,'08:20','in','正常'],['E001',date,'08:25','in','正常'],
        ['A001',date,'17:00','out','正常'],['A002','2026-10-01','22:00','in','正常'],
        ['A002',date,'06:00','out','正常']
    ]) db.addPunchRecord({id,timestamp:at(day,time),type,status,shift:'Fixture',source:'manual'});
    const range={startDate:date,endDate:date};
    const full=await api('/admin/reports/query',admin,range);
    assert.equal(full.status,200,JSON.stringify(full));
    assert.equal(full.data.summary.recordCount,4);
    assert.equal(full.data.summary.abnormalCount,2);
    assert.equal(full.data.summary.missingPunchDayCount,2);
    assert.equal(full.data.summary.rawAbnormalCount,0);
    assert.equal(full.data.records.find(row=>row.employeeId==='A002').attendanceFlags.length,0);
    const selected=await api('/admin/reports/query',admin,{...range,employeeId:'E001',category:'abnormal'});
    assert.equal(selected.data.summary.recordCount,2);
    assert.equal(selected.data.filteredRecordCount,1);
    assert.equal(selected.data.records[0].employeeId,'E001');
    assert.equal(selected.data.records[0].attendanceStatusText,'正常');
    assert.equal((await api('/admin/reports/query',admin,{...range,category:'invalid'})).status,400);
    assert.equal((await api('/admin/reports/query',admin,{...range,employeeId:'E00'})).status,404);
    const exported=await api('/admin/reports/export',admin,{...range,category:'missing_punch',templateId:'payroll'});
    assert.equal(exported.status,200,JSON.stringify(exported));
    const csv=exported.data.csvContent;
    assert.ok(csv.includes('E001') && csv.includes('A001'));
    assert.ok(!csv.includes('A002') && !csv.includes('missing_out'));
    assert.equal((await api('/admin/reports/export',admin,{...range,category:'overtime',templateId:'payroll'})).status,400);
    const today='2026-11-12';
    db.saveShifts([{name:'Day shift',start:'08:20',end:'17:00'}]);
    db.addPunchRecord({id:'E001',timestamp:at(today,'17:10'),type:'in',status:'正常',shift:'Day shift',source:'manual'});
    const afterShift=await api('/admin/reports/query',admin,{employeeId:'E001',startDate:today,endDate:today});
    assert.equal(afterShift.status,200);
    assert.equal(afterShift.data.summary.abnormalCount,1);
    assert.deepEqual(afterShift.data.records[0].attendanceFlags,['missing_out']);
});

test('a complete overnight or same-day session does not hide a later missing out', () => {
    const previous = '2026-11-11', today = '2026-11-12';
    const nightIn = punch('N',previous,'22:00','in'), nightOut = punch('N',today,'06:00','out');
    const dayIn = punch('N',today,'08:20','in');
    const morningIn = punch('S',today,'08:20','in'), morningOut = punch('S',today,'12:00','out');
    const secondIn = punch('S',today,'13:00','in');
    const leave = { employeeId:'NO-PUNCH',recordKind:'leave' };
    const visible = [nightOut,dayIn,morningIn,morningOut,secondIn,leave];
    const cutoff = () => at(today,'17:00');
    const rows = classifyAttendanceReport(visible,[...visible,nightIn],at(today,'18:00'),cutoff);
    assert.deepEqual(rows.map(row=>row.attendanceFlags),[[],['missing_out'],[],[],['missing_out'],[]]);
    assert.equal(rows.filter(row=>row.reportCategories.includes('missing_punch')).length,2);
    assert.equal(rows.length,visible.length);
    const pending = classifyAttendanceReport(visible,[...visible,nightIn],at(today,'16:00'),cutoff);
    assert.deepEqual(pending.map(row=>row.attendanceFlags),[[],['awaiting_out'],[],[],['awaiting_out'],[]]);
});
